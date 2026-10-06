import { ref, watch, type Ref } from 'vue'
import { api } from '../../shared/api/api'
import type {
  AdGroupPerformanceRow,
  KeywordPerformanceRow,
  QsBucket,
  SearchTermPerformanceRow,
  AdPerformanceRow,
  AdStrength,
  PerformanceRow,
  AssetGroupPerformanceRow,
  Intent,
  KeywordSummary,
} from '../../shared/api/types'
import { keywordOptimizerApi } from '../keyword-optimizer/keywordOptimizerApi'

// Fixed window for this first drill-down slice — the campaign detail page
// doesn't have its own period selector yet (a reasonable follow-up, not
// required for v2 Stage 1). Matches the dashboard's own default.
const DAYS = 90

interface Totals {
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
}

export interface AdGroupRow extends Totals {
  ad_group_id: number
  ad_group: string
  ctr: number
}

export interface KeywordRow extends Totals {
  keyword_id: number
  text: string
  match_type: 'exact' | 'phrase' | 'broad'
  ad_group: string
  ctr: number
  quality_score: number | null
  expected_ctr: QsBucket | null
  ad_relevance: QsBucket | null
  landing_page_experience: QsBucket | null
  // Overhaul v3 (contract 3.0). null / undefined from an older backend both mean
  // "no data yet" and must render as "—", never as 0.
  search_impression_share: number | null
  rank_lost_share: number | null
  bid_micros: number | null
  value_micros: number | null
  /** Window aggregates from GET /keywords/summary; null if that call failed or the keyword is absent. */
  summary: KeywordSummary | null
}

export interface SearchTermRow extends Totals {
  search_term_id: number
  search_term: string
  match_flavor: 'close_variant' | 'broader'
  keyword: string
  ctr: number
  wasted: boolean
  // Overhaul v3 (contract 3.0); null when the backend has not classified the term yet.
  intent: Intent | null
  intent_confidence: number | null
  intent_method: 'rule' | 'llm' | null
  value_micros: number | null
}

export interface AdRow extends Totals {
  ad_id: number
  label: string
  headlines: string[]
  descriptions: string[]
  ad_strength: AdStrength
  ad_group: string
  ctr: number
}

export interface AssetGroupRow extends Totals {
  asset_group_id: number
  asset_group: string
  ad_strength: AdStrength
  ctr: number
}

function aggregateAdGroups(rows: AdGroupPerformanceRow[]): AdGroupRow[] {
  const byAdGroup = new Map<number, AdGroupRow>()
  for (const r of rows) {
    if (!byAdGroup.has(r.ad_group_id)) {
      byAdGroup.set(r.ad_group_id, {
        ad_group_id: r.ad_group_id,
        ad_group: r.ad_group,
        impressions: 0,
        clicks: 0,
        cost_micros: 0,
        conversions: 0,
        ctr: 0,
      })
    }
    const agg = byAdGroup.get(r.ad_group_id)!
    agg.impressions += r.impressions
    agg.clicks += r.clicks
    agg.cost_micros += r.cost_micros
    agg.conversions += r.conversions
  }
  return Array.from(byAdGroup.values())
    .map((a) => ({ ...a, ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0 }))
    .sort((a, b) => b.cost_micros - a.cost_micros)
}

/** Aggregates per-day keyword rows into one row per keyword, summing the
 * metrics but taking Quality Score (and its sub-scores) from the most
 * recent day only — QS is a current-state diagnostic, summing/averaging
 * it across days wouldn't mean anything. */
function aggregateKeywords(rows: KeywordPerformanceRow[]): KeywordRow[] {
  const byKeyword = new Map<number, KeywordRow & { latestDate: string; shareDate: string }>()
  for (const r of rows) {
    const existing = byKeyword.get(r.keyword_id)
    if (!existing) {
      byKeyword.set(r.keyword_id, {
        keyword_id: r.keyword_id,
        text: r.text,
        match_type: r.match_type,
        ad_group: r.ad_group,
        impressions: r.impressions,
        clicks: r.clicks,
        cost_micros: r.cost_micros,
        conversions: r.conversions,
        ctr: 0,
        quality_score: r.quality_score,
        expected_ctr: r.expected_ctr,
        ad_relevance: r.ad_relevance,
        landing_page_experience: r.landing_page_experience,
        search_impression_share: r.search_impression_share ?? null,
        rank_lost_share: r.search_rank_lost_impression_share ?? null,
        bid_micros: r.cpc_bid_micros ?? null,
        value_micros: r.conversions_value_micros ?? null,
        summary: null,
        latestDate: r.date,
        shareDate: r.search_impression_share != null || r.search_rank_lost_impression_share != null ? r.date : '',
      })
      continue
    }
    if (r.conversions_value_micros != null) existing.value_micros = (existing.value_micros ?? 0) + r.conversions_value_micros
    // Impression share is a current-state number like QS, but a day with no impressions has none:
    // take the latest day that actually HAS one, rather than showing "no data" over older real data.
    if ((r.search_impression_share != null || r.search_rank_lost_impression_share != null) && r.date >= existing.shareDate) {
      existing.shareDate = r.date
      existing.search_impression_share = r.search_impression_share ?? null
      existing.rank_lost_share = r.search_rank_lost_impression_share ?? null
    }
    if (r.date >= existing.latestDate) existing.bid_micros = r.cpc_bid_micros ?? null
    existing.impressions += r.impressions
    existing.clicks += r.clicks
    existing.cost_micros += r.cost_micros
    existing.conversions += r.conversions
    if (r.date >= existing.latestDate) {
      existing.latestDate = r.date
      existing.quality_score = r.quality_score
      existing.expected_ctr = r.expected_ctr
      existing.ad_relevance = r.ad_relevance
      existing.landing_page_experience = r.landing_page_experience
    }
  }
  return Array.from(byKeyword.values())
    .map(({ latestDate: _latestDate, shareDate: _shareDate, ...k }) => ({ ...k, ctr: k.impressions ? (k.clicks / k.impressions) * 100 : 0 }))
    .sort((a, b) => b.cost_micros - a.cost_micros)
}

/** Aggregates per-day search term rows into one row per search term, summing
 * metrics. `wasted` flags terms with real spend and zero conversions —
 * negative-keyword candidates — computed off the summed totals rather than
 * any single day, since one bad day doesn't make a term worth excluding. */
function aggregateSearchTerms(rows: SearchTermPerformanceRow[]): SearchTermRow[] {
  const byTerm = new Map<number, SearchTermRow>()
  for (const r of rows) {
    if (!byTerm.has(r.search_term_id)) {
      byTerm.set(r.search_term_id, {
        search_term_id: r.search_term_id,
        search_term: r.search_term,
        match_flavor: r.match_flavor,
        keyword: r.keyword,
        impressions: 0,
        clicks: 0,
        cost_micros: 0,
        conversions: 0,
        ctr: 0,
        wasted: false,
        intent: r.intent ?? null,
        intent_confidence: r.intent_confidence ?? null,
        intent_method: r.intent_method ?? null,
        value_micros: null,
      })
    }
    const agg = byTerm.get(r.search_term_id)!
    if (r.conversions_value_micros != null) agg.value_micros = (agg.value_micros ?? 0) + r.conversions_value_micros
    agg.impressions += r.impressions
    agg.clicks += r.clicks
    agg.cost_micros += r.cost_micros
    agg.conversions += r.conversions
  }
  return Array.from(byTerm.values())
    .map((t) => ({ ...t, ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0, wasted: t.clicks > 0 && t.conversions === 0 }))
    .sort((a, b) => b.cost_micros - a.cost_micros)
}

/** Aggregates per-day ad rows into one row per ad, summing metrics.
 * label/headlines/descriptions/ad_strength are static per ad (unlike
 * Quality Score) so any row's copy is fine to take. */
function aggregateAds(rows: AdPerformanceRow[]): AdRow[] {
  const byAd = new Map<number, AdRow>()
  for (const r of rows) {
    if (!byAd.has(r.ad_id)) {
      byAd.set(r.ad_id, {
        ad_id: r.ad_id,
        label: r.label,
        headlines: r.headlines,
        descriptions: r.descriptions,
        ad_strength: r.ad_strength,
        ad_group: r.ad_group,
        impressions: 0,
        clicks: 0,
        cost_micros: 0,
        conversions: 0,
        ctr: 0,
      })
    }
    const agg = byAd.get(r.ad_id)!
    agg.impressions += r.impressions
    agg.clicks += r.clicks
    agg.cost_micros += r.cost_micros
    agg.conversions += r.conversions
  }
  return Array.from(byAd.values())
    .map((a) => ({ ...a, ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0 }))
    .sort((a, b) => b.cost_micros - a.cost_micros)
}

/** Aggregates per-day asset group rows into one row per group, summing
 * metrics. ad_strength is static per group (like ads.ad_strength) so any
 * row's copy is fine to take. */
function aggregateAssetGroups(rows: AssetGroupPerformanceRow[]): AssetGroupRow[] {
  const byGroup = new Map<number, AssetGroupRow>()
  for (const r of rows) {
    if (!byGroup.has(r.asset_group_id)) {
      byGroup.set(r.asset_group_id, {
        asset_group_id: r.asset_group_id,
        asset_group: r.asset_group,
        ad_strength: r.ad_strength,
        impressions: 0,
        clicks: 0,
        cost_micros: 0,
        conversions: 0,
        ctr: 0,
      })
    }
    const agg = byGroup.get(r.asset_group_id)!
    agg.impressions += r.impressions
    agg.clicks += r.clicks
    agg.cost_micros += r.cost_micros
    agg.conversions += r.conversions
  }
  return Array.from(byGroup.values())
    .map((a) => ({ ...a, ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0 }))
    .sort((a, b) => b.cost_micros - a.cost_micros)
}

export function useCampaignDetail(campaignId: Ref<string | number>) {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const campaignName = ref('')
  const adGroupRows = ref<AdGroupRow[]>([])
  const keywordRows = ref<KeywordRow[]>([])
  const searchTermRows = ref<SearchTermRow[]>([])
  const adRows = ref<AdRow[]>([])
  // v2 Stage 4 — impression share + optimization score. Rides the
  // existing /performance endpoint (campaign_performance columns, not a
  // new table), filtered client-side to this campaign by name — the
  // same pattern CampaignTable.vue already uses, since PerformanceRow
  // only carries the campaign's name, not its id. Empty for PMax/Display
  // (search_impression_share is null there), which is what conditionally
  // hides the chart on the page.
  const impressionShareRows = ref<PerformanceRow[]>([])
  // v2 Stage 6 — PMax asset groups. The endpoint is implicitly pmax-only
  // (no campaignId filter, unlike ad-group/keyword calls), so this
  // always fetches all 4 rows and filters client-side by campaign name —
  // naturally empty (and hides the section) for every non-PMax campaign.
  const assetGroupRows = ref<AssetGroupRow[]>([])

  async function load() {
    loading.value = true
    error.value = null
    try {
      const id = Number(campaignId.value)
      const [campaigns, adGroupPerf, perf, assetGroupPerf] = await Promise.all([
        api.campaigns(),
        api.adGroupPerformance(DAYS, id),
        api.performance(DAYS),
        api.assetGroupPerformance(DAYS),
      ])
      campaignName.value = campaigns.find((c) => c.id === id)?.name ?? ''
      adGroupRows.value = aggregateAdGroups(adGroupPerf)
      impressionShareRows.value = perf
        .filter((r) => r.campaign === campaignName.value && r.search_impression_share !== null)
        .sort((a, b) => a.date.localeCompare(b.date))
      assetGroupRows.value = aggregateAssetGroups(assetGroupPerf.filter((r) => r.campaign === campaignName.value))

      const adGroupIds = [...new Set(adGroupPerf.map((r) => r.ad_group_id))]
      const [keywordPerfByAdGroup, adPerfByAdGroup] = await Promise.all([
        Promise.all(adGroupIds.map((agId) => api.keywordPerformance(DAYS, agId))),
        Promise.all(adGroupIds.map((agId) => api.adPerformance(DAYS, agId))),
      ])
      const keywordPerf = keywordPerfByAdGroup.flat()
      keywordRows.value = aggregateKeywords(keywordPerf)
      // Window aggregates that cannot be derived from per-day rows (intent mix, per-action
      // conversions, stock). Best-effort: the table must keep working if this call fails or the
      // backend predates it, so a failure just leaves every summary cell on "no data yet".
      try {
        const summary = await keywordOptimizerApi.summary(DAYS)
        const byId = new Map(summary.items.map((i) => [i.keyword_id, i]))
        keywordRows.value = keywordRows.value.map((k) => ({ ...k, summary: byId.get(k.keyword_id) ?? null }))
      } catch {
        // intentionally ignored, see above
      }
      adRows.value = aggregateAds(adPerfByAdGroup.flat())

      const keywordIds = [...new Set(keywordPerf.map((r) => r.keyword_id))]
      const searchTermPerfByKeyword = await Promise.all(keywordIds.map((kwId) => api.searchTermPerformance(DAYS, kwId)))
      searchTermRows.value = aggregateSearchTerms(searchTermPerfByKeyword.flat())
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  watch(campaignId, load, { immediate: true })

  return {
    loading,
    error,
    campaignName,
    adGroupRows,
    keywordRows,
    searchTermRows,
    adRows,
    impressionShareRows,
    assetGroupRows,
  }
}
