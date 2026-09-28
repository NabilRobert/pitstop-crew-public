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
    'IMPORTANT — this list is ranked WORST-FIRST by wasted spend: zero/near-zero-conversion terms first (highest cost ' +
    'among those), then worst cost-per-conversion. It is a negative-keyword-candidate list, not a sample of typical or ' +
    'top-performing queries — every row was selected for being expensive relative to its results. Do NOT cite it as ' +
    'evidence of best-performing, top, representative, or high-intent queries, or of overall search efficiency; use the ' +
    'keyword table above for that.\n\n' +
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

// Deterministic "precomputed facts" for cross-table comparisons the models
// (and especially the critic) have been getting wrong: which campaign is
// largest by conversions, what counts as a lead-type conversion action, and
// whether a Search campaign loses more impression share to budget or to
// rank. Computed by SQL over the same rows the other builders read — never
// by an LLM. The 30-day-window block goes into the context Anna receives
// (so the critic, which sees that same context, judges her against exactly
// what she saw); only the longer-window comparison stays critic-only, in
// buildHistoricalFacts, matching the existing longer-history design.
const LEAD_CALL_CATEGORIES = ['SUBMIT_LEAD_FORM', 'PHONE_CALL_LEAD']
const LOST_SHARE_TIE = 0.005 // rank-lost and budget-lost within this are reported as "about equal"

async function conversionsRankingRows(startDate: string, endDate: string) {
  return query<{ name: string; conv: number }>(
    `SELECT c.name, SUM(cp.conversions) AS conv
     FROM campaign_performance cp JOIN campaigns c ON c.id = cp.campaign_id
     WHERE cp.date BETWEEN $1 AND $2
     GROUP BY c.name ORDER BY SUM(cp.conversions) DESC, c.name`,
    [startDate, endDate]
  )
}

const rankingText = (rows: { name: string; conv: number }[]) =>
  rows.map((r) => `${r.name} ${Number(r.conv).toFixed(2)}`).join(' > ')

function whichLarger(budgetLost: number, rankLost: number): string {
  if (rankLost - budgetLost > LOST_SHARE_TIE) return 'rank-lost larger'
  if (budgetLost - rankLost > LOST_SHARE_TIE) return 'budget-lost larger'
  return 'about equal'
}

/** ~1k characters. Empty when the context is scoped to one campaign or
 * segment — cross-campaign rankings mean nothing there. */
export async function buildFactsContext(
  endDate: string,
  days: number,
  campaignId?: number | null,
  segmentId?: number | null
): Promise<string> {
  if (campaignId != null || segmentId != null) return ''
  const startDate = addDays(endDate, -days)
  const lines: string[] = []

  const rankingRows = await conversionsRankingRows(startDate, endDate)
  if (rankingRows.length) lines.push(`- Conversions by campaign, last ${days} days, ranked: ${rankingText(rankingRows)}.`)

  // Asset groups are parts of one campaign — quote only that campaign's own
  // total, not a separately rounded asset-group sum that could differ by a cent.
  const pmax = await query<{ name: string }>(
    `SELECT DISTINCT c.name FROM asset_groups ag JOIN campaigns c ON c.id = ag.campaign_id`
  )
  for (const r of pmax) {
    const total = rankingRows.find((x) => x.name === r.name)
    lines.push(
      `- Asset-group figures are parts of ${r.name}${total ? ` (its campaign total is ${Number(total.conv).toFixed(2)})` : ''}, not separate campaigns to compare against campaign totals.`
    )
  }

  const cats = await query<{ category: string; conv: number; names: string }>(
    `SELECT ca.category, SUM(cap.conversions) AS conv, string_agg(DISTINCT ca.name, ' + ' ORDER BY ca.name) AS names
     FROM conversion_action_performance cap JOIN conversion_actions ca ON ca.id = cap.conversion_action_id
     WHERE cap.date BETWEEN $1 AND $2 GROUP BY ca.category ORDER BY SUM(cap.conversions) DESC, ca.category`,
    [startDate, endDate]
  )
  const total = cats.reduce((a, r) => a + Number(r.conv), 0)
  if (total > 0) {
    const leadCall = cats.filter((r) => LEAD_CALL_CATEGORIES.includes(r.category)).reduce((a, r) => a + Number(r.conv), 0)
    lines.push(
      `- Named conversion actions by category, last ${days} days (total ${total.toFixed(2)}): ` +
        cats.map((r) => `${r.category} ${Number(r.conv).toFixed(2)} (${Math.round((100 * Number(r.conv)) / total)}%) = ${r.names}`).join('; ') +
        `. Lead/call categories (${LEAD_CALL_CATEGORIES.join(' + ')}) combined: ${leadCall.toFixed(2)} (${Math.round((100 * leadCall) / total)}%).`
    )
  }

  const latest = await query<{ name: string; date: string; imp_share: number; bl: number }>(
    `SELECT DISTINCT ON (c.name) c.name, cp.date, cp.search_impression_share AS imp_share, cp.search_budget_lost_impression_share AS bl
     FROM campaign_performance cp JOIN campaigns c ON c.id = cp.campaign_id
     WHERE cp.date BETWEEN $1 AND $2 AND cp.search_impression_share IS NOT NULL
     ORDER BY c.name, cp.date DESC`,
    [startDate, endDate]
  )
  const avgs = await query<{ name: string; bl: number; rl: number }>(
    `SELECT c.name, AVG(cp.search_budget_lost_impression_share) AS bl,
            AVG(GREATEST(0, 1 - cp.search_impression_share - cp.search_budget_lost_impression_share)) AS rl
     FROM campaign_performance cp JOIN campaigns c ON c.id = cp.campaign_id
     WHERE cp.date BETWEEN $1 AND $2 AND cp.search_impression_share IS NOT NULL GROUP BY c.name`,
    [startDate, endDate]
  )
  const avgByName = new Map(avgs.map((a) => [a.name, a]))
  for (const l of latest) {
    const bl = Number(l.bl)
    const rl = Math.max(0, 1 - Number(l.imp_share) - bl)
    const a = avgByName.get(l.name)
    lines.push(
      `- ${l.name}, impression share lost: on ${l.date} budget-lost ${bl.toFixed(4)} vs rank-lost ${rl.toFixed(4)} (${whichLarger(bl, rl)})` +
        (a ? `; ${days}-day average budget-lost ${Number(a.bl).toFixed(4)} vs rank-lost ${Number(a.rl).toFixed(4)} (${whichLarger(Number(a.bl), Number(a.rl))}).` : '.')
    )
  }

  if (lines.length === 0) return ''
  return (
    'Precomputed facts — computed by SQL from the same data shown above, not estimated by a model. Where a claim can ' +
    'be checked against one of these lines, trust the line over your own arithmetic.\n' +
    lines.join('\n')
  )
}

/** Critic-only: the longer-window comparison fact. The writers never see
 * the 60-day window, so it must not reach them (and isn't in buildFullContext). */
export async function buildHistoricalFacts(endDate: string, days: number): Promise<string> {
  const rows = await conversionsRankingRows(addDays(endDate, -days), endDate)
  if (!rows.length) return ''
  return `Precomputed fact (SQL, not a model) — conversions by campaign, last ${days} days, ranked: ${rankingText(rows)}.`
}

/** What the critic gets as its historical context: the per-campaign summary
 * plus the longer-window fact. */
export async function buildCriticHistoricalContext(endDate: string, days: number): Promise<string> {
  const summary = await buildHistoricalSummary(endDate, days)
  const facts = await buildHistoricalFacts(endDate, days)
  return facts ? `${summary}\n\n${facts}` : summary
}

/** How many source rows fed the context for a window — recorded on the
 * trace's context step so a run shows how much data the agents were given.
 * Best-effort: returns {} rather than throwing. */
export async function getContextRowCounts(endDate: string, days: number): Promise<Record<string, number>> {
  const startDate = addDays(endDate, -days)
  const tables: [string, string, string][] = [
    ['campaign_performance', 'campaign_performance', 'date'],
    ['ad_group_performance', 'ad_group_performance', 'date'],
    ['keyword_performance', 'keyword_performance', 'date'],
    ['search_term_performance', 'search_term_performance', 'date'],
    ['ad_performance', 'ad_performance', 'date'],
    ['conversion_action_performance', 'conversion_action_performance', 'date'],
    ['asset_group_performance', 'asset_group_performance', 'date'],
    ['segment_performance', 'segment_performance', 'date'],
    ['recommendations', 'recommendations', 'generated_date'],
    ['change_events', 'change_events', 'changed_at::date'],
  ]
  try {
    const selects = tables.map(([alias, table, col]) => `(SELECT COUNT(*) FROM ${table} WHERE ${col} BETWEEN $1 AND $2)::int AS ${alias}`)
    const rows = await query<Record<string, number>>(`SELECT ${selects.join(', ')}`, [startDate, endDate])
    return rows[0] ?? {}
  } catch {
    return {}
  }
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
  const factsContext = await buildFactsContext(endDate, days, args.campaignId, args.segmentId)
  return (
    `${performanceContext}\n\n` +
    `Top ad groups/keywords by spend this window (aggregated — not every row; see individual counts above for full totals):\n${adGroupKeywordContext}\n\n` +
    `Search terms ranked WORST-FIRST by wasted spend — negative-keyword candidates, NOT top performers (aggregated top-N, see note):\n${searchTermContext}\n\n` +
    `Ad creatives (headlines/descriptions/ad_strength) with their performance this window:\n${adContext}\n\n` +
    `Search impression share, why it's lost, and Optimization Score this window (see note above on scope):\n${impressionShareContext}\n\n` +
    `Named conversion actions this window (account-wide totals):\n${conversionActionContext}\n\n` +
    `Performance Max asset groups (vehicle-category-themed, pmax campaign only) this window:\n${assetGroupContext}\n\n` +
    `Google Ads' own Recommendations generated this window (see note above on scope):\n${recommendationsContext}\n\n` +
    `Account change history this window (see note above on scope):\n${changeEventContext}` +
    (factsContext ? `\n\n${factsContext}` : '')
  )
}
