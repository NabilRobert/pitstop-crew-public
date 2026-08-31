// Formats stored performance data into compact text for agent prompts.
// Shared by the Ask feature; the cron pipeline reuses it for the same
// reason — one place that turns DB rows into prompt context.

import { query } from './db.js'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// cost_micros/cpc_micros carry no currency label of their own — without
// this, a model defaults to assuming USD and writes "$" figures, which is
// wrong for this account (IDR, per dummy.md/research.md; see also
// format.js's formatMicrosAsIDR). Anna is the only agent that reads this
// raw data directly — Rico and Sammy only ever see Anna's already-written
// text — so a wrong currency here silently propagates through the whole
// report chain if not corrected at the source.
const CURRENCY_NOTE =
  'Note on units: cost_micros and cpc_micros fields are Indonesian Rupiah in micros (divide by 1,000,000 for the actual Rupiah amount) — this account\'s currency is IDR, not USD. When citing a cost figure in prose, write it as Rupiah (e.g. "Rp 21,120" or "IDR 21,120"), never with a "$" sign.\n\n'

export interface BuildPerformanceContextArgs {
  campaignId?: number | null
  segmentId?: number | null
  endDate?: string
  days?: number
}

export async function buildPerformanceContext(args: BuildPerformanceContextArgs = {}): Promise<string> {
  const endDate = args.endDate ?? new Date().toISOString().slice(0, 10)
  const days = args.days ?? 30
  const startDate = addDays(endDate, -days)

  let rows: unknown[]
  if (args.segmentId != null) {
    rows = await query(
      `SELECT sp.date, c.name AS campaign, s.segment_type, s.segment_value,
              sp.impressions, sp.clicks, sp.cost_micros, sp.conversions
       FROM segment_performance sp
       JOIN campaigns c ON c.id = sp.campaign_id
       JOIN segments s ON s.id = sp.segment_id
       WHERE sp.segment_id = $1 AND sp.date BETWEEN $2 AND $3
       ORDER BY sp.date`,
      [args.segmentId, startDate, endDate]
    )
  } else if (args.campaignId != null) {
    rows = await query(
      `SELECT cp.date, c.name AS campaign, cp.impressions, cp.clicks, cp.cost_micros, cp.conversions
       FROM campaign_performance cp
       JOIN campaigns c ON c.id = cp.campaign_id
       WHERE cp.campaign_id = $1 AND cp.date BETWEEN $2 AND $3
       ORDER BY cp.date`,
      [args.campaignId, startDate, endDate]
    )
  } else {
    rows = await query(
      `SELECT cp.date, c.name AS campaign, cp.impressions, cp.clicks, cp.cost_micros, cp.conversions
       FROM campaign_performance cp
       JOIN campaigns c ON c.id = cp.campaign_id
       WHERE cp.date BETWEEN $1 AND $2
       ORDER BY cp.date, c.name`,
      [startDate, endDate]
    )
  }

  return CURRENCY_NOTE + JSON.stringify(rows)
}

/** Per-campaign aggregates over a window, not a raw row dump — backs the
 * critic's historical-comparison context. A raw dump would be up to
 * ~days×campaigns rows of JSON (e.g. 300+ for a 60-day window), sent on
 * every single critic call in a run (there can be ~10 in one pipeline
 * run); the critic only needs "what's normal for this campaign" to judge
 * whether current claims look unusual, which a handful of aggregate
 * numbers per campaign conveys just as well at a fraction of the tokens. */
export async function buildHistoricalSummary(endDate: string, days: number): Promise<string> {
  const startDate = addDays(endDate, -days)
  const rows = await query(
    `SELECT c.name AS campaign,
            MIN(cp.date) AS from_date, MAX(cp.date) AS to_date,
            SUM(cp.impressions) AS total_impressions, SUM(cp.clicks) AS total_clicks,
            SUM(cp.cost_micros) AS total_cost_micros, ROUND(SUM(cp.conversions)::numeric, 2) AS total_conversions,
            ROUND(AVG(cp.clicks::numeric / NULLIF(cp.impressions, 0) * 100), 2) AS avg_daily_ctr_pct,
            ROUND(AVG(cp.cost_micros::numeric / NULLIF(cp.clicks, 0)), 0) AS avg_daily_cpc_micros
     FROM campaign_performance cp
     JOIN campaigns c ON c.id = cp.campaign_id
     WHERE cp.date BETWEEN $1 AND $2
     GROUP BY c.name
     ORDER BY c.name`,
    [startDate, endDate]
  )
  return CURRENCY_NOTE + JSON.stringify(rows)
}

// v2 Stage 1 — ad groups + keywords + Quality Score. Top-N aggregated over
// the window, NOT a raw dump (per docs/v2-*-plan.md decision #9): keyword-
// level data for ~8 ad groups x ~4 keywords each over a 30-day window is
// 1000+ rows — far too much for a token-budget-constrained prompt (see
// anna.ts's MAX_TOKENS comment on gpt-5-mini's hidden reasoning-token
// cost). Mirrors buildHistoricalSummary's aggregate-not-dump pattern above,
// ordered by total spend so the model sees what actually matters first.
export async function buildAdGroupKeywordContext(
  endDate: string,
  days: number,
  campaignId?: number | null,
  topN = 10
): Promise<string> {
  const startDate = addDays(endDate, -days)
  const params: unknown[] = [startDate, endDate]
  let campaignFilter = ''
  if (campaignId != null) {
    params.push(campaignId)
    campaignFilter = `AND ag.campaign_id = $${params.length}`
  }
  params.push(topN)
  const rows = await query(
    `SELECT c.name AS campaign, ag.name AS ad_group, k.text AS keyword, k.match_type,
            SUM(kp.impressions) AS total_impressions, SUM(kp.clicks) AS total_clicks,
            SUM(kp.cost_micros) AS total_cost_micros, ROUND(SUM(kp.conversions)::numeric, 2) AS total_conversions,
            (ARRAY_AGG(kp.quality_score ORDER BY kp.date DESC))[1] AS latest_quality_score,
            MIN(kp.quality_score) AS min_quality_score_in_window,
            (ARRAY_AGG(kp.expected_ctr ORDER BY kp.date DESC))[1] AS latest_expected_ctr,
            (ARRAY_AGG(kp.ad_relevance ORDER BY kp.date DESC))[1] AS latest_ad_relevance,
            (ARRAY_AGG(kp.landing_page_experience ORDER BY kp.date DESC))[1] AS latest_landing_page_experience
     FROM keyword_performance kp
     JOIN keywords k ON k.id = kp.keyword_id
     JOIN ad_groups ag ON ag.id = k.ad_group_id
     JOIN campaigns c ON c.id = ag.campaign_id
     WHERE kp.date BETWEEN $1 AND $2 ${campaignFilter}
     GROUP BY c.name, ag.name, k.text, k.match_type
     ORDER BY total_cost_micros DESC
     LIMIT $${params.length}`,
    params
  )
  return CURRENCY_NOTE + JSON.stringify(rows)
}

// v2 Stage 2 — search terms. Top-N by "wasted spend" specifically, not
// just top-N by cost like the keyword builder above: the whole point of
// search-term data is finding negative-keyword candidates, so this
// prioritizes terms with near-zero conversions first (ordered by cost
// among those), then falls back to worst cost-per-conversion if fewer
// than topN terms have zero conversions. Same aggregate-not-dump
// reasoning as buildAdGroupKeywordContext.
export async function buildSearchTermContext(
  endDate: string,
  days: number,
  campaignId?: number | null,
  topN = 10
): Promise<string> {
  const startDate = addDays(endDate, -days)
  const params: unknown[] = [startDate, endDate]
  let campaignFilter = ''
  if (campaignId != null) {
    params.push(campaignId)
    campaignFilter = `AND ag.campaign_id = $${params.length}`
  }
  params.push(topN)
  const rows = await query(
    `SELECT c.name AS campaign, ag.name AS ad_group, k.text AS keyword, st.text AS search_term, st.match_flavor,
            SUM(stp.impressions) AS total_impressions, SUM(stp.clicks) AS total_clicks,
            SUM(stp.cost_micros) AS total_cost_micros, ROUND(SUM(stp.conversions)::numeric, 2) AS total_conversions,
            ROUND((SUM(stp.cost_micros) / NULLIF(SUM(stp.conversions), 0))::numeric, 0) AS cost_per_conversion_micros
     FROM search_term_performance stp
     JOIN search_terms st ON st.id = stp.search_term_id
     JOIN ad_groups ag ON ag.id = st.ad_group_id
     JOIN campaigns c ON c.id = ag.campaign_id
     LEFT JOIN keywords k ON k.id = st.keyword_id
     WHERE stp.date BETWEEN $1 AND $2 ${campaignFilter}
     GROUP BY c.name, ag.name, k.text, st.text, st.match_flavor
     ORDER BY (SUM(stp.conversions) < 0.1) DESC, SUM(stp.cost_micros) DESC
     LIMIT $${params.length}`,
    params
  )
  return (
    CURRENCY_NOTE +
    'These are ranked by "wasted spend" — zero/near-zero-conversion search terms first (highest cost among those), ' +
    'then worst cost-per-conversion — not by raw spend, since the point of search-term data is spotting negative-keyword candidates.\n\n' +
    JSON.stringify(rows)
  )
}

// v2 Stage 3 — ads/creatives. Only 16 ads total exist (2 per ad group,
// 8 ad groups), nowhere near the keyword/search-term row-count problem —
// so this returns every ad's aggregate, not a filtered top-N, though it
// still takes a topN param for consistency/future-proofing if the ad
// count ever grows. ad_strength is a static per-ad attribute (see
// schema.sql), included directly rather than needing a "latest" pick
// the way per-day Quality Score does.
export async function buildAdContext(
  endDate: string,
  days: number,
  campaignId?: number | null,
  topN = 20
): Promise<string> {
  const startDate = addDays(endDate, -days)
  const params: unknown[] = [startDate, endDate]
  let campaignFilter = ''
  if (campaignId != null) {
    params.push(campaignId)
    campaignFilter = `AND ag.campaign_id = $${params.length}`
  }
  params.push(topN)
  const rows = await query(
    `SELECT c.name AS campaign, ag.name AS ad_group, a.label AS ad, a.headlines, a.descriptions, a.ad_strength,
            SUM(ap.impressions) AS total_impressions, SUM(ap.clicks) AS total_clicks,
            SUM(ap.cost_micros) AS total_cost_micros, ROUND(SUM(ap.conversions)::numeric, 2) AS total_conversions
     FROM ad_performance ap
     JOIN ads a ON a.id = ap.ad_id
     JOIN ad_groups ag ON ag.id = a.ad_group_id
     JOIN campaigns c ON c.id = ag.campaign_id
     WHERE ap.date BETWEEN $1 AND $2 ${campaignFilter}
     GROUP BY c.name, ag.name, a.label, a.headlines, a.descriptions, a.ad_strength
     ORDER BY total_cost_micros DESC
     LIMIT $${params.length}`,
    params
  )
  return CURRENCY_NOTE + JSON.stringify(rows)
}

// v2 Stage 4 — impression share + optimization score. Only the 3
// Search-type campaigns have these (NULL for PMax/Display — see
// schema.sql), so this filters to rows where they're actually populated
// rather than returning misleading NULL rows for every campaign. Bounded
// row count (3 campaigns x days) same as buildAdContext's "only 16 ads
// total" reasoning — no top-N truncation needed, every row for the
// window comes back. Rank-lost is derived here (not stored — see
// schema.sql) via a CASE, not a bare GREATEST: Postgres's GREATEST(0,
// NULL) returns 0, not NULL, which would wrongly show rank-lost as 0 for
// PMax/Display instead of leaving it NULL like the other two fields.
export async function buildImpressionShareContext(
  endDate: string,
  days: number,
  campaignId?: number | null
): Promise<string> {
  const startDate = addDays(endDate, -days)
  const params: unknown[] = [startDate, endDate]
  let campaignFilter = ''
  if (campaignId != null) {
    params.push(campaignId)
    campaignFilter = `AND cp.campaign_id = $${params.length}`
  }
  const rows = await query(
    `SELECT cp.date, c.name AS campaign, cp.search_impression_share, cp.search_budget_lost_impression_share,
            CASE WHEN cp.search_impression_share IS NOT NULL
                 THEN GREATEST(0, 1 - cp.search_impression_share - cp.search_budget_lost_impression_share)
                 ELSE NULL END AS search_rank_lost_impression_share,
            cp.optimization_score
     FROM campaign_performance cp
     JOIN campaigns c ON c.id = cp.campaign_id
     WHERE cp.date BETWEEN $1 AND $2 AND cp.search_impression_share IS NOT NULL ${campaignFilter}
     ORDER BY cp.date, c.name`,
    params
  )
  return (
    CURRENCY_NOTE +
    'Impression share only exists for Search-type campaigns (Brand, Search — Used Cars Generic, Search — ' +
    'Model + Suburb) — Performance Max and Display have no rows here. search_rank_lost_impression_share is ' +
    'derived (1 - impression share - budget-lost share, clamped at 0), not a directly reported metric: a ' +
    'rising budget-lost share alongside a flat/unchanged rank-lost share means impressions are being missed ' +
    'due to budget constraints, not ad quality or bid competitiveness.\n\n' +
    JSON.stringify(rows)
  )
}

// v2 Stage 5 — named conversion actions. Account-wide (conversion_action_
// performance has no ad-group hierarchy under it, unlike keywords/ads),
// so this aggregates straight to account totals per named action — only
// 4 rows, well under any token-budget concern, no topN truncation
// needed (same "bounded, return everything" reasoning as buildAdContext).
// No CURRENCY_NOTE here — conversion counts carry no cost_micros figure.
export async function buildConversionActionContext(
  endDate: string,
  days: number,
  campaignId?: number | null
): Promise<string> {
  const startDate = addDays(endDate, -days)
  const params: unknown[] = [startDate, endDate]
  let campaignFilter = ''
  if (campaignId != null) {
    params.push(campaignId)
    campaignFilter = `AND cap.campaign_id = $${params.length}`
  }
  const rows = await query(
    `SELECT ca.name, ca.category, ca.counting_type, ROUND(SUM(cap.conversions)::numeric, 2) AS total_conversions
     FROM conversion_action_performance cap
     JOIN conversion_actions ca ON ca.id = cap.conversion_action_id
     WHERE cap.date BETWEEN $1 AND $2 ${campaignFilter}
     GROUP BY ca.name, ca.category, ca.counting_type
     ORDER BY total_conversions DESC`,
    params
  )
  return (
    'Named conversion actions are account-wide, not scoped to any single campaign — these totals sum every ' +
    "campaign's conversions for this window, broken out by which named action they were credited to.\n\n" +
    JSON.stringify(rows)
  )
}

// v2 Stage 6 — PMax asset groups. Only 4 rows total (scoped to the pmax
// campaign only — real PMax has no ad-group level, asset-group based
// instead), same "bounded, return everything" reasoning as buildAdContext.
// campaignId filter accepted for consistency with the other builders —
// scoping to any non-pmax campaign correctly returns zero rows, since
// asset_groups only exist under pmax.
export async function buildAssetGroupContext(
  endDate: string,
  days: number,
  campaignId?: number | null,
  topN = 10
): Promise<string> {
  const startDate = addDays(endDate, -days)
  const params: unknown[] = [startDate, endDate]
  let campaignFilter = ''
  if (campaignId != null) {
    params.push(campaignId)
    campaignFilter = `AND ag.campaign_id = $${params.length}`
  }
  params.push(topN)
  const rows = await query(
    `SELECT ag.name AS asset_group, SUM(agp.impressions) AS total_impressions, SUM(agp.clicks) AS total_clicks,
            SUM(agp.cost_micros) AS total_cost_micros, ROUND(SUM(agp.conversions)::numeric, 2) AS total_conversions,
            (ARRAY_AGG(agp.ad_strength ORDER BY agp.date DESC))[1] AS ad_strength
     FROM asset_group_performance agp
     JOIN asset_groups ag ON ag.id = agp.asset_group_id
     WHERE agp.date BETWEEN $1 AND $2 ${campaignFilter}
     GROUP BY ag.name
     ORDER BY total_cost_micros DESC
     LIMIT $${params.length}`,
    params
  )
  return CURRENCY_NOTE + JSON.stringify(rows)
}

// v2 Stage 7 — Google Ads' own Recommendations. Currently only 4 rows
// total (a static, hand-authored list — see profile.ts), well under any
// token-budget concern, so every recommendation in the window comes
// back, not a top-N subset. campaign is null for account-level
// recommendations (LEFT JOIN, not INNER — an account-level row has no
// campaigns row to match).
export async function buildRecommendationsContext(
  endDate: string,
  days: number,
  campaignId?: number | null
): Promise<string> {
  const startDate = addDays(endDate, -days)
  const params: unknown[] = [startDate, endDate]
  let campaignFilter = ''
  if (campaignId != null) {
    params.push(campaignId)
    campaignFilter = `AND r.campaign_id = $${params.length}`
  }
  const rows = await query(
    `SELECT r.generated_date, c.name AS campaign, r.recommendation_type, r.title, r.description,
            r.impact_impressions_pct, r.impact_conversions_pct, r.dismissed, r.applied
     FROM recommendations r
     LEFT JOIN campaigns c ON c.id = r.campaign_id
     WHERE r.generated_date BETWEEN $1 AND $2 ${campaignFilter}
     ORDER BY r.generated_date DESC`,
    params
  )
  return (
    "These are Google Ads' own Recommendations (campaign is null for account-level suggestions), not findings " +
    "you generated — dismissed/applied show whether the recommendation has already been acted on. A still-" +
    'pending, non-dismissed recommendation is the most worth surfacing directly.\n\n' +
    JSON.stringify(rows)
  )
}

// v2 Stage 8 — change history. Only 4 rows total (a static, hand-
// authored list — see profile.ts's CHANGE_EVENTS), same "bounded,
// return everything" reasoning as buildRecommendationsContext. campaign
// is null for account-level changes (LEFT JOIN, not INNER).
export async function buildChangeEventContext(
  endDate: string,
  days: number,
  campaignId?: number | null
): Promise<string> {
  const startDate = `${addDays(endDate, -days)}T00:00:00Z`
  const endDateTime = `${endDate}T23:59:59Z`
  const params: unknown[] = [startDate, endDateTime]
  let campaignFilter = ''
  if (campaignId != null) {
    params.push(campaignId)
    campaignFilter = `AND ce.campaign_id = $${params.length}`
  }
  const rows = await query(
    `SELECT ce.changed_at, c.name AS campaign, ce.resource_type, ce.change_operation,
            ce.field_changed, ce.old_value, ce.new_value, ce.changed_by
     FROM change_events ce
     LEFT JOIN campaigns c ON c.id = ce.campaign_id
     WHERE ce.changed_at BETWEEN $1 AND $2 ${campaignFilter}
     ORDER BY ce.changed_at DESC`,
    params
  )
  return (
    'Account change history for this window — real account/campaign edits (budget changes, bidding strategy ' +
    "changes, ad edits), not AI-generated findings. campaign is null for account-level changes. Worth " +
    "correlating against a performance shift you're already flagging on the same campaign around the same " +
    "date — a change event landing right before a metric moves is a much stronger, more specific claim than " +
    "citing the metric move alone.\n\n" +
    JSON.stringify(rows)
  )
}

/** Composes buildPerformanceContext + every v2 builder added so far —
 * used by both the daily pipeline (orchestrator.ts) and the Ask feature
 * (ask.ts), so asking "what's my Quality Score on Search-Model?" actually
 * has data to answer from instead of two divergent context-building
 * paths. Grows one function call at a time as later v2 stages land. */
export async function buildFullContext(args: BuildPerformanceContextArgs = {}): Promise<string> {
  const endDate = args.endDate ?? new Date().toISOString().slice(0, 10)
  const days = args.days ?? 30
  const performanceContext = await buildPerformanceContext(args)
  const adGroupKeywordContext = await buildAdGroupKeywordContext(endDate, days, args.campaignId)
  const searchTermContext = await buildSearchTermContext(endDate, days, args.campaignId)
  const adContext = await buildAdContext(endDate, days, args.campaignId)
  const impressionShareContext = await buildImpressionShareContext(endDate, days, args.campaignId)
  const conversionActionContext = await buildConversionActionContext(endDate, days, args.campaignId)
  const assetGroupContext = await buildAssetGroupContext(endDate, days, args.campaignId)
  const recommendationsContext = await buildRecommendationsContext(endDate, days, args.campaignId)
  const changeEventContext = await buildChangeEventContext(endDate, days, args.campaignId)
  return (
    `${performanceContext}\n\n` +
    `Top ad groups/keywords by spend this window (aggregated — not every row; see individual counts above for full totals):\n${adGroupKeywordContext}\n\n` +
    `Search terms with the most wasted spend this window (aggregated top-N, see note above):\n${searchTermContext}\n\n` +
    `Ad creatives (headlines/descriptions/ad_strength) with their performance this window:\n${adContext}\n\n` +
    `Search impression share, why it's lost, and Optimization Score this window (see note above on scope):\n${impressionShareContext}\n\n` +
    `Named conversion actions this window (account-wide totals):\n${conversionActionContext}\n\n` +
    `Performance Max asset groups (vehicle-category-themed, pmax campaign only) this window:\n${assetGroupContext}\n\n` +
    `Google Ads' own Recommendations generated this window (see note above on scope):\n${recommendationsContext}\n\n` +
    `Account change history this window (see note above on scope):\n${changeEventContext}`
  )
}
