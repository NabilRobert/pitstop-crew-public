import { ref, watch, type Ref } from 'vue'
import { api } from '../../shared/api/api'
import type { AdGroupPerformanceRow, KeywordPerformanceRow, QsBucket } from '../../shared/api/types'

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
  const byKeyword = new Map<number, KeywordRow & { latestDate: string }>()
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
        latestDate: r.date,
      })
      continue
    }
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
    .map(({ latestDate: _latestDate, ...k }) => ({ ...k, ctr: k.impressions ? (k.clicks / k.impressions) * 100 : 0 }))
    .sort((a, b) => b.cost_micros - a.cost_micros)
}

export function useCampaignDetail(campaignId: Ref<string | number>) {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const campaignName = ref('')
  const adGroupRows = ref<AdGroupRow[]>([])
  const keywordRows = ref<KeywordRow[]>([])

  async function load() {
    loading.value = true
    error.value = null
    try {
      const id = Number(campaignId.value)
      const [campaigns, adGroupPerf] = await Promise.all([api.campaigns(), api.adGroupPerformance(DAYS, id)])
      campaignName.value = campaigns.find((c) => c.id === id)?.name ?? ''
      adGroupRows.value = aggregateAdGroups(adGroupPerf)

      const adGroupIds = [...new Set(adGroupPerf.map((r) => r.ad_group_id))]
      const keywordPerfByAdGroup = await Promise.all(adGroupIds.map((agId) => api.keywordPerformance(DAYS, agId)))
      keywordRows.value = aggregateKeywords(keywordPerfByAdGroup.flat())
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  watch(campaignId, load, { immediate: true })

  return { loading, error, campaignName, adGroupRows, keywordRows }
}
