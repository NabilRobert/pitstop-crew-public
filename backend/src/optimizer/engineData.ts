// SQL readers for the keyword optimizer engine (docs/overhaul-v3-backend.md
// section 11.1): builds one EngineInput from the Pitstop DB. Window totals
// are summed in SQL; the engine itself (engine.ts) stays pure. Read-only.

import { query } from '../data/db.js'
import { DATA_SOURCE } from '../platform/config.js'
import { getSettings } from '../platform/settings.js'
import { evidenceWindow, type EngineAd, type EngineInput, type EngineKeyword, type EngineThresholds, type PromotedTerm } from './engine.js'
import type { AdSettings } from './ads.js'
import { loadIntentCache } from './intentJob.js'
import { loadInventorySnapshot, type InventorySnapshot } from './inventory/index.js'
import { loadSuggestionHistory } from './suggestions.js'
import { loadVehicleParses } from './vehicleParseJob.js'
import { buildDictionary, parseVehicle } from './vehicleParse.js'
import type { MatchType } from './types.js'

export interface LoadOptions {
  asOf?: string // default: the newest day with keyword data
  thresholds?: Partial<EngineThresholds>
  inventory?: InventorySnapshot // default: read one snapshot now
}

// How a keywords.status maps to the two states the API knows. Demo rows
// store 'enabled'; the live API's ENABLED / PAUSED / REMOVED are matched
// case-insensitively. NULL or anything unrecognised counts as enabled.
export const STATUS_SQL = {
  enabled: "lower(COALESCE(k.status, 'enabled')) NOT IN ('paused', 'removed')",
  paused: "lower(COALESCE(k.status, '')) = 'paused'",
}

/** Every keyword in one status with its totals over [start, end] — zeros
 * for one with no rows in the window. The engine reads the enabled ones;
 * the keyword verdicts read the paused ones too (verdict.ts). */
export async function loadKeywordWindow(start: string, end: string, status: keyof typeof STATUS_SQL): Promise<EngineKeyword[]> {
  const rows = await query<{
    id: number
    ad_group_id: number
    text: string
    match_type: MatchType
    cpc_bid_micros: number | null
    first_served_on: string | null
    impressions: number
    clicks: number
    cost_micros: number
    conversions: number
    conversions_value_micros: number
    quality_score: number | null
    rank_lost: number | null
  }>(
    `SELECT k.id, k.ad_group_id, k.text, k.match_type, k.cpc_bid_micros,
            (SELECT to_char(MIN(f.date), 'YYYY-MM-DD') FROM keyword_performance f
              WHERE f.keyword_id = k.id AND f.impressions > 0 AND f.date <= $3) AS first_served_on,
            COALESCE(SUM(kp.impressions), 0)::int AS impressions,
            COALESCE(SUM(kp.clicks), 0)::int AS clicks,
            COALESCE(SUM(kp.cost_micros), 0) AS cost_micros,
            COALESCE(SUM(kp.conversions), 0)::float8 AS conversions,
            COALESCE(SUM(kp.conversions_value_micros), 0) AS conversions_value_micros,
            (ARRAY_AGG(kp.quality_score ORDER BY kp.date DESC) FILTER (WHERE kp.quality_score IS NOT NULL))[1] AS quality_score,
            AVG(kp.search_rank_lost_impression_share)::float8 AS rank_lost
     FROM keywords k
     LEFT JOIN keyword_performance kp ON kp.keyword_id = k.id AND kp.date BETWEEN $2 AND $3
     WHERE k.data_source = $1 AND ${STATUS_SQL[status]}
     GROUP BY k.id
     ORDER BY k.id`,
    [DATA_SOURCE, start, end]
  )
  return rows.map((r) => ({
    id: r.id,
    adGroupId: r.ad_group_id,
    text: r.text,
    matchType: r.match_type,
    cpcBidMicros: r.cpc_bid_micros,
    firstServedOn: r.first_served_on,
    stats: {
      impressions: r.impressions,
      clicks: r.clicks,
      costMicros: Number(r.cost_micros),
      conversions: r.conversions,
      conversionsValueMicros: Number(r.conversions_value_micros),
    },
    qualityScore: r.quality_score,
    rankLostShare: r.rank_lost,
  }))
}

/** 3.6 — enabled ads in enabled ad groups, with their totals over
 * [start, end] (zeros for an ad with no rows in the window). */
export async function loadAdWindow(start: string, end: string): Promise<EngineAd[]> {
  const rows = await query<{
    id: number
    ad_group_id: number
    label: string
    headlines: unknown
    descriptions: unknown
    final_url: string | null
    ad_strength: EngineAd['adStrength']
    impressions: number
    clicks: number
    cost_micros: number
    conversions: number
  }>(
    `SELECT a.id, a.ad_group_id, a.label, a.headlines, a.descriptions, a.final_url, a.ad_strength,
            COALESCE(SUM(ap.impressions), 0)::int AS impressions,
            COALESCE(SUM(ap.clicks), 0)::int AS clicks,
            COALESCE(SUM(ap.cost_micros), 0) AS cost_micros,
            COALESCE(SUM(ap.conversions), 0)::float8 AS conversions
     FROM ads a
     JOIN ad_groups ag ON ag.id = a.ad_group_id
     LEFT JOIN ad_performance ap ON ap.ad_id = a.id AND ap.date BETWEEN $2 AND $3
     WHERE a.data_source = $1
       AND lower(COALESCE(a.status, 'enabled')) NOT IN ('paused', 'removed')
       AND lower(COALESCE(ag.status, 'enabled')) NOT IN ('paused', 'removed')
     GROUP BY a.id
     ORDER BY a.id`,
    [DATA_SOURCE, start, end]
  )
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return rows.map((r) => ({
    id: r.id,
    adGroupId: r.ad_group_id,
    label: r.label,
    headlines: strings(r.headlines),
    descriptions: strings(r.descriptions),
    finalUrl: r.final_url,
    adStrength: r.ad_strength,
    stats: { impressions: r.impressions, clicks: r.clicks, costMicros: Number(r.cost_micros), conversions: r.conversions, conversionsValueMicros: 0 },
  }))
}

/** 3.6 — promote_search_term suggestions the owner applied (the engine
 * keeps the recent ones as winners). */
export async function loadPromotedTerms(): Promise<PromotedTerm[]> {
  const rows = await query<{ text: string | null; search_term_id: number | null; ad_group_id: number | null; conversions: number | null; applied_on: string | null }>(
    `SELECT payload->>'text' AS text, search_term_id, ad_group_id, (evidence->>'conversions')::float8 AS conversions,
            to_char((status_changed_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS applied_on
     FROM keyword_suggestions
     WHERE suggestion_type = 'promote_search_term' AND status = 'applied'
     ORDER BY id`
  )
  return rows.flatMap((r) =>
    r.text === null || r.applied_on === null
      ? []
      : [{ text: r.text, searchTermId: r.search_term_id, adGroupId: r.ad_group_id, conversions: r.conversions ?? 0, appliedOn: r.applied_on }]
  )
}

/** 3.6 — the dealer facts and claims ad copy may use, from the settings. */
export function adSettingsFrom(settings: Record<string, string>): AdSettings {
  const blankToNull = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : v.trim())
  return {
    dealerName: settings.dealer_name.trim(),
    dealerCity: settings.dealer_city.trim(),
    dealerArea: blankToNull(settings.dealer_area),
    dealerWhatsapp: blankToNull(settings.dealer_whatsapp),
    landingUrl: blankToNull(settings.dealer_landing_url),
    claims: {
      installments: settings.ads_claim_installments === 'true',
      trade_in: settings.ads_claim_trade_in === 'true',
      test_drive: settings.ads_claim_test_drive === 'true',
      inspection: settings.ads_claim_inspection === 'true',
    },
    inspectionWording: settings.ads_inspection_wording.trim(),
  }
}

/** The newest day with keyword data for this data source; null with none. */
export async function latestKeywordDate(): Promise<string | null> {
  const [{ last }] = await query<{ last: string | null }>(
    `SELECT to_char(MAX(kp.date), 'YYYY-MM-DD') AS last
     FROM keyword_performance kp JOIN keywords k ON k.id = kp.keyword_id
     WHERE k.data_source = $1`,
    [DATA_SOURCE]
  )
  return last
}

export async function loadEngineInput(opts: LoadOptions = {}): Promise<EngineInput> {
  const asOf = opts.asOf ?? (await latestKeywordDate())
  if (!asOf) throw new Error('no keyword data yet — nothing for the keyword optimizer to read')
  const { start, end } = evidenceWindow(asOf, opts.thresholds)

  const [campaigns, adGroups, keywordRows, termRows, negatives, changeEvents, settings, intents, cachedParses, history, inventory, ads, promotedTerms] =
    await Promise.all([
      query<{ id: number; name: string }>('SELECT id, name FROM campaigns WHERE data_source = $1 ORDER BY id', [DATA_SOURCE]),
      query<{ id: number; campaign_id: number; name: string }>(
        'SELECT id, campaign_id, name FROM ad_groups WHERE data_source = $1 ORDER BY id',
        [DATA_SOURCE]
      ),
      // Removed and paused keywords spend nothing and get no suggestions.
      loadKeywordWindow(start, end, 'enabled'),
      query<{
        id: number
        ad_group_id: number
        keyword_id: number
        text: string
        impressions: number
        clicks: number
        cost_micros: number
        conversions: number
        conversions_value_micros: number
      }>(
        `SELECT st.id, st.ad_group_id, st.keyword_id, st.text,
                SUM(stp.impressions)::int AS impressions, SUM(stp.clicks)::int AS clicks,
                SUM(stp.cost_micros) AS cost_micros, SUM(stp.conversions)::float8 AS conversions,
                SUM(stp.conversions_value_micros) AS conversions_value_micros
         FROM search_terms st
         JOIN search_term_performance stp ON stp.search_term_id = st.id
         -- Terms of enabled keywords only: nothing is suggested under a
         -- keyword that is already paused or removed.
         JOIN keywords k ON k.id = st.keyword_id AND ${STATUS_SQL.enabled}
         WHERE st.data_source = $1 AND stp.date BETWEEN $2 AND $3
         GROUP BY st.id
         ORDER BY st.id`,
        [DATA_SOURCE, start, end]
      ),
      query<{ scope: 'campaign' | 'ad_group' | 'shared_set'; campaign_id: number | null; ad_group_id: number | null; text: string; match_type: MatchType }>(
        'SELECT scope, campaign_id, ad_group_id, text, match_type FROM negative_keywords WHERE data_source = $1',
        [DATA_SOURCE]
      ),
      // Demo change events are stamped in UTC (profile.ts timeOfDay).
      query<{ campaign_id: number | null; changed_on: string }>(
        `SELECT campaign_id, to_char((changed_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS changed_on
         FROM change_events WHERE data_source = $1 AND changed_at >= ($2::date - 30)`,
        [DATA_SOURCE, asOf]
      ),
      getSettings(),
      loadIntentCache(),
      loadVehicleParses(),
      loadSuggestionHistory(),
      opts.inventory ? Promise.resolve(opts.inventory) : loadInventorySnapshot(),
      loadAdWindow(start, end),
      loadPromotedTerms(),
    ])

  const keywords = keywordRows

  // The weekly job parses keywords before the engine runs; a keyword added
  // since then gets the rule parse here rather than no stock link at all.
  const dictionary = buildDictionary(inventory.vehicles)
  const vehicleParses = new Map(cachedParses)
  for (const k of keywords) if (!vehicleParses.has(k.id)) vehicleParses.set(k.id, parseVehicle(k.text, dictionary))

  return {
    asOf,
    windowStart: start,
    windowEnd: end,
    campaigns,
    adGroups: adGroups.map((a) => ({ id: a.id, campaignId: a.campaign_id, name: a.name })),
    keywords,
    searchTerms: termRows.map((r) => ({
      id: r.id,
      adGroupId: r.ad_group_id,
      keywordId: r.keyword_id,
      text: r.text,
      stats: {
        impressions: r.impressions,
        clicks: r.clicks,
        costMicros: Number(r.cost_micros),
        conversions: r.conversions,
        conversionsValueMicros: Number(r.conversions_value_micros),
      },
    })),
    intents,
    vehicleParses,
    inventory,
    negatives: negatives.map((n) => ({ scope: n.scope, campaignId: n.campaign_id, adGroupId: n.ad_group_id, text: n.text, matchType: n.match_type })),
    changeEvents: changeEvents.map((e) => ({ campaignId: e.campaign_id, changedOn: e.changed_on })),
    history,
    settings: {
      pValue: Number(settings.keyword_min_confidence_p),
      allowedSpendShare: Number(settings.inventory_allowed_spend_share),
      leadToSaleRate: Number(settings.inventory_lead_to_sale_rate),
      budgetFloorIdr: Number(settings.campaign_daily_budget_floor_idr),
      budgetCeilingIdr: Number(settings.campaign_daily_budget_ceiling_idr),
    },
    ads,
    adSettings: adSettingsFrom(settings),
    promotedTerms,
    thresholds: opts.thresholds,
  }
}
