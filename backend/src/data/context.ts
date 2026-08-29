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
// level data for ~8 ad groups x ~3 keywords each over a 30-day window is
// 700+ rows — far too much for a token-budget-constrained prompt (see
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
  return `${performanceContext}\n\nTop ad groups/keywords by spend this window (aggregated — not every row; see individual counts above for full totals):\n${adGroupKeywordContext}`
}
