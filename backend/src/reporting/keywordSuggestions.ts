// Read/write layer behind the keyword optimizer API — contract 3.0
// (docs/overhaul-v3.md section 13). The route files stay thin; the pure
// parts (query validation, status transitions, the export file, the
// inventory summary, the row → Suggestion mapping) are exported for tests.

import { query, queryOne } from '../data/db.js'
import { csvCell, neutralizeCell } from './csvSafe.js'
import { buildBriefCsv, buildBriefTxt } from './campaignBrief.js'
import { getKeywordIntentSummaries } from '../optimizer/intentJob.js'
import { loadEngineInput, loadKeywordWindow } from '../optimizer/engineData.js'
import { DATA_SOURCE } from '../platform/config.js'
import { keywordVerdicts } from '../optimizer/verdict.js'
import { loadInventorySnapshot, type InventorySnapshot } from '../optimizer/inventory/index.js'
import { agingBucket, daysBetween, matchStock, type AgingBucket } from '../optimizer/stock.js'
import { loadVehicleParses } from '../optimizer/vehicleParseJob.js'
import { buildDictionary, parseVehicle, type VehicleParse } from '../optimizer/vehicleParse.js'
import type {
  Basis,
  Confidence,
  ExpectedImpact,
  Intent,
  KeywordVerdict,
  MatchType,
  SuggestionEvidence,
  SuggestionPayload,
  SuggestionStatus,
  SuggestionType,
  ValueTier,
} from '../optimizer/types.js'

export const SUGGESTION_STATUSES: readonly SuggestionStatus[] = ['open', 'planned', 'applied', 'dismissed', 'superseded']
export const SUGGESTION_TYPES: readonly SuggestionType[] = [
  'negative_keyword',
  'promote_search_term',
  'change_match_type',
  'pause_keyword',
  'spin_out_campaign',
  'new_keyword',
  'raise_bid_candidate',
  'new_campaign',
  'new_ad',
]

export interface Suggestion {
  id: number
  pipeline_run_id: number
  type: SuggestionType
  status: SuggestionStatus
  basis: Basis
  confidence: Confidence
  rank: number | null
  explanation: string | null
  campaign: { id: number; name: string } | null
  ad_group: { id: number; name: string } | null
  keyword: { id: number; text: string; match_type: MatchType } | null
  search_term: { id: number; text: string } | null
  payload: SuggestionPayload
  evidence: SuggestionEvidence
  expected_impact: ExpectedImpact | null
  inventory: { snapshot_on: string; stock_count: number; avg_days_listed: number | null; avg_margin_idr: number | null } | null
  created_at: string
  status_changed_at: string | null
  linked_campaign: { id: number; name: string } | null // 3.3
}

export interface SuggestionRow {
  id: number
  pipeline_run_id: number
  suggestion_type: SuggestionType
  status: SuggestionStatus
  basis: Basis
  confidence: Confidence
  rank: number | null
  explanation: string | null
  campaign_id: number | null
  campaign_name: string | null
  ad_group_id: number | null
  ad_group_name: string | null
  keyword_id: number | null
  keyword_text: string | null
  keyword_match_type: MatchType | null
  search_term_id: number | null
  search_term_text: string | null
  payload: SuggestionPayload
  evidence: SuggestionEvidence
  expected_impact: ExpectedImpact | null
  inventory_snapshot_on: string | null
  created_at: Date | string
  status_changed_at: Date | string | null
  linked_campaign_id: number | null
  linked_campaign_name: string | null
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString())

/** DB row → contract Suggestion. The inventory block comes from the stock
 * numbers the engine stored in evidence, present only on rows that leaned
 * on the inventory (those carry inventory_snapshot_on). */
export function toSuggestion(r: SuggestionRow): Suggestion {
  const e = r.evidence
  const inventory =
    r.inventory_snapshot_on !== null && typeof e.stock_count === 'number'
      ? {
          snapshot_on: r.inventory_snapshot_on,
          stock_count: e.stock_count,
          avg_days_listed: typeof e.avg_days_listed === 'number' ? e.avg_days_listed : null,
          avg_margin_idr: typeof e.avg_margin_idr === 'number' ? e.avg_margin_idr : null,
        }
      : null
  return {
    id: r.id,
    pipeline_run_id: r.pipeline_run_id,
    type: r.suggestion_type,
    status: r.status,
    basis: r.basis,
    confidence: r.confidence,
    rank: r.rank,
    explanation: r.explanation,
    campaign: r.campaign_id !== null && r.campaign_name !== null ? { id: r.campaign_id, name: r.campaign_name } : null,
    ad_group: r.ad_group_id !== null && r.ad_group_name !== null ? { id: r.ad_group_id, name: r.ad_group_name } : null,
    keyword:
      r.keyword_id !== null && r.keyword_text !== null && r.keyword_match_type !== null
        ? { id: r.keyword_id, text: r.keyword_text, match_type: r.keyword_match_type }
        : null,
    search_term: r.search_term_id !== null && r.search_term_text !== null ? { id: r.search_term_id, text: r.search_term_text } : null,
    payload: r.payload,
    evidence: r.evidence,
    expected_impact: r.expected_impact,
    inventory,
    created_at: iso(r.created_at),
    status_changed_at: r.status_changed_at === null ? null : iso(r.status_changed_at),
    linked_campaign: r.linked_campaign_id !== null && r.linked_campaign_name !== null ? { id: r.linked_campaign_id, name: r.linked_campaign_name } : null,
  }
}

const SELECT_ROWS = `
  SELECT s.id, s.pipeline_run_id, s.suggestion_type, s.status, s.basis, s.confidence, s.rank, s.explanation,
         s.campaign_id, c.name AS campaign_name, s.ad_group_id, ag.name AS ad_group_name,
         s.keyword_id, k.text AS keyword_text, k.match_type AS keyword_match_type,
         s.search_term_id, st.text AS search_term_text,
         s.payload, s.evidence, s.expected_impact, s.inventory_snapshot_on, s.created_at, s.status_changed_at,
         s.linked_campaign_id, lc.name AS linked_campaign_name
  FROM keyword_suggestions s
  LEFT JOIN campaigns lc ON lc.id = s.linked_campaign_id
  LEFT JOIN campaigns c ON c.id = s.campaign_id
  LEFT JOIN ad_groups ag ON ag.id = s.ad_group_id
  LEFT JOIN keywords k ON k.id = s.keyword_id
  LEFT JOIN search_terms st ON st.id = s.search_term_id`

// --- query validation ------------------------------------------------------

type QueryValue = unknown // what Express puts in req.query: string, string[], object or undefined
export type Parsed<T> = { ok: true; value: T } | { ok: false; detail: string }

function single(v: QueryValue): string | undefined | null {
  if (v === undefined) return undefined
  return typeof v === 'string' ? v : null // null = given twice or as an object: invalid
}

/** A single-valued parameter or its default; null when it was repeated. */
function singleOr(v: QueryValue, fallback: string): string | null {
  const s = single(v)
  return s === undefined ? fallback : s
}

export function intParam(v: QueryValue, name: string, fallback: number, min: number, max: number): Parsed<number> {
  const s = single(v)
  if (s === undefined) return { ok: true, value: fallback }
  const n = s === null ? NaN : Number(s)
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false, detail: `${name} must be an integer from ${min} to ${max}` }
  return { ok: true, value: n }
}

export interface ListQuery {
  status: SuggestionStatus | 'all'
  type: SuggestionType | null
  campaignId: number | null
  limit: number
  offset: number
}

export function parseListQuery(q: Record<string, QueryValue>): Parsed<ListQuery> {
  const status = singleOr(q.status, 'open')
  if (status === null || (status !== 'all' && !(SUGGESTION_STATUSES as readonly string[]).includes(status))) {
    return { ok: false, detail: `status must be one of ${SUGGESTION_STATUSES.join(', ')} or all` }
  }
  const type = single(q.type)
  if (type === null || (type !== undefined && !(SUGGESTION_TYPES as readonly string[]).includes(type))) {
    return { ok: false, detail: `type must be one of ${SUGGESTION_TYPES.join(', ')}` }
  }
  const campaign = intParam(q.campaign_id, 'campaign_id', -1, 1, 2_147_483_647)
  if (!campaign.ok) return campaign
  const limit = intParam(q.limit, 'limit', 50, 1, 200)
  if (!limit.ok) return limit
  const offset = intParam(q.offset, 'offset', 0, 0, 2_147_483_647)
  if (!offset.ok) return offset
  return {
    ok: true,
    value: {
      status: status as ListQuery['status'],
      type: (type as SuggestionType | undefined) ?? null,
      campaignId: campaign.value === -1 ? null : campaign.value,
      limit: limit.value,
      offset: offset.value,
    },
  }
}

export interface ExportQuery {
  status: SuggestionStatus | 'all'
  format: 'csv' | 'txt'
}

export function parseExportQuery(q: Record<string, QueryValue>): Parsed<ExportQuery> {
  const type = singleOr(q.type, 'negative_keyword')
  if (type !== 'negative_keyword') return { ok: false, detail: 'only type=negative_keyword can be exported' }
  const status = singleOr(q.status, 'open')
  if (status === null || (status !== 'all' && !(SUGGESTION_STATUSES as readonly string[]).includes(status))) {
    return { ok: false, detail: `status must be one of ${SUGGESTION_STATUSES.join(', ')} or all` }
  }
  const format = singleOr(q.format, 'csv')
  if (format !== 'csv' && format !== 'txt') return { ok: false, detail: 'format must be csv or txt' }
  return { ok: true, value: { status: status as ExportQuery['status'], format } }
}

/** GET /keyword-suggestions/:id/brief (3.3): `format` csv (default) or txt. */
export function parseBriefQuery(q: Record<string, QueryValue>): Parsed<{ format: 'csv' | 'txt' }> {
  const format = singleOr(q.format, 'csv')
  if (format !== 'csv' && format !== 'txt') return { ok: false, detail: 'format must be csv or txt' }
  return { ok: true, value: { format } }
}

// --- status changes --------------------------------------------------------

const ALLOWED: Record<string, readonly SuggestionStatus[]> = {
  open: ['applied', 'dismissed'],
  applied: ['open'],
  dismissed: ['open'],
}
// 3.3 — a campaign proposal (3.6: and an ad) can also be planned
// (approved, waiting to be built or launched), undone, dropped, or marked
// as built.
const PLANNABLE: ReadonlySet<SuggestionType> = new Set(['new_campaign', 'new_ad'])
const ALLOWED_PLANNABLE: Record<string, readonly SuggestionStatus[]> = {
  open: ['applied', 'dismissed', 'planned'],
  planned: ['open', 'dismissed', 'applied'],
  applied: ['open'],
  dismissed: ['open'],
}

export type TransitionCheck = { ok: true } | { ok: false; code: 400 | 409; detail: string }

/** Contract 3.3 PATCH rules. The body was already checked to be applied,
 * dismissed, open or planned. `planned` on anything but a new_campaign or
 * (3.6) new_ad is a 400; a superseded row is 409; any other move not in the
 * table (open → open, applied → dismissed) is a conflict with the row's
 * current state. */
export function checkTransition(from: SuggestionStatus, to: SuggestionStatus, type: SuggestionType): TransitionCheck {
  if (to === 'planned' && !PLANNABLE.has(type)) return { ok: false, code: 400, detail: 'planned is only valid for new_campaign and new_ad suggestions' }
  if (from === 'superseded') return { ok: false, code: 409, detail: 'this suggestion was superseded by a newer run and can no longer change' }
  const table = PLANNABLE.has(type) ? ALLOWED_PLANNABLE : ALLOWED
  if (!(table[from] ?? []).includes(to)) {
    return { ok: false, code: 409, detail: `can't change a suggestion from ${from} to ${to}${from !== 'open' && from !== 'planned' ? ' — reopen it first' : ''}` }
  }
  return { ok: true }
}

export function parseStatusBody(body: unknown): Parsed<'applied' | 'dismissed' | 'open' | 'planned'> {
  const status = body && typeof body === 'object' ? (body as { status?: unknown }).status : undefined
  if (status === 'superseded') return { ok: false, detail: 'superseded is set by the server only' }
  if (status !== 'applied' && status !== 'dismissed' && status !== 'open' && status !== 'planned') {
    return { ok: false, detail: 'status must be applied, dismissed, open or planned' }
  }
  return { ok: true, value: status }
}

// --- the export file ---------------------------------------------------------

export { neutralizeCell } from './csvSafe.js'

export interface NegativeExportRow {
  campaign: string | null
  adGroup: string | null // null for a campaign-level negative
  text: string
  matchType: MatchType
}

const CRITERION_TYPE: Record<MatchType, string> = { exact: 'Negative Exact', phrase: 'Negative Phrase', broad: 'Negative Broad' }

/** Google Ads Editor-style CSV (headers to VERIFY against a real Editor
 * export, per the contract) or a plain list in Google's match-type
 * notation. */
export function buildNegativeExport(rows: readonly NegativeExportRow[], format: 'csv' | 'txt'): string {
  if (format === 'txt') {
    return rows
      .map((r) => {
        const t = neutralizeCell(r.text)
        return r.matchType === 'exact' ? `[${t}]` : r.matchType === 'phrase' ? `"${t}"` : t
      })
      .join('\n')
      .concat(rows.length ? '\n' : '')
  }
  const lines = [['Campaign', 'Ad Group', 'Keyword', 'Criterion Type'].join(',')]
  for (const r of rows) lines.push([r.campaign ?? '', r.adGroup ?? '', r.text, CRITERION_TYPE[r.matchType]].map(csvCell).join(','))
  return lines.join('\r\n') + '\r\n'
}

export type BriefResult = { ok: true; body: string } | { ok: false; code: 400 | 404; detail: string }

/** The brief for one new_campaign suggestion, in any status. */
export async function getCampaignBrief(id: number, format: 'csv' | 'txt'): Promise<BriefResult> {
  const row = await queryOne<{ suggestion_type: SuggestionType; payload: SuggestionPayload }>(
    'SELECT suggestion_type, payload FROM keyword_suggestions WHERE id = $1',
    [id]
  )
  if (!row) return { ok: false, code: 404, detail: 'suggestion not found' }
  if (row.suggestion_type !== 'new_campaign' || row.payload.kind !== 'new_campaign') {
    return { ok: false, code: 400, detail: 'a brief exists only for new_campaign suggestions' }
  }
  return { ok: true, body: format === 'csv' ? buildBriefCsv(row.payload) : buildBriefTxt(row.payload) }
}

// --- inventory -----------------------------------------------------------------

// One snapshot per minute at most: every page load would otherwise read
// the dealer's database again.
const INVENTORY_TTL_MS = 60_000
let inventoryCache: { at: number; snapshot: InventorySnapshot } | null = null

export async function currentInventory(): Promise<InventorySnapshot> {
  if (inventoryCache && Date.now() - inventoryCache.at < INVENTORY_TTL_MS) return inventoryCache.snapshot
  const snapshot = await loadInventorySnapshot()
  inventoryCache = { at: Date.now(), snapshot }
  return snapshot
}

export interface InventorySummary {
  source: 'demo' | 'connected' | 'unavailable'
  snapshot_on: string | null
  error: string | null
  totals: { available: number; reserved: number; sold_last_30d: number } | null
  aging: { bucket: AgingBucket; count: number }[]
  by_model: {
    make: string
    model: string
    available: number
    avg_days_listed: number | null
    avg_price_idr: number | null
    avg_margin_idr: number | null
    linked_keyword_count: number
  }[]
}

const AGING_BUCKETS: readonly AgingBucket[] = ['0-30', '31-60', '61-90', '90+']
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null)

/** Pure. Aging and the per-model averages are over available units;
 * linked_keyword_count counts keywords parsed to that exact make and model. */
export function buildInventorySummary(snap: InventorySnapshot, keywordParses: readonly VehicleParse[]): InventorySummary {
  if (snap.source === 'unavailable' || snap.snapshotOn === null) {
    return { source: 'unavailable', snapshot_on: null, error: snap.error, totals: null, aging: [], by_model: [] }
  }
  const on = snap.snapshotOn
  const available = snap.vehicles.filter((v) => v.status === 'available')
  const aging = AGING_BUCKETS.map((bucket) => ({ bucket, count: available.filter((v) => agingBucket(daysBetween(v.listedOn, on)) === bucket).length }))

  const models = new Map<string, { make: string; model: string }>()
  for (const v of snap.vehicles) {
    const key = `${v.make}|${v.model}`.toLowerCase()
    if (!models.has(key)) models.set(key, { make: v.make, model: v.model })
  }
  const by_model = [...models.values()]
    .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model))
    .map((m) => {
      const units = available.filter((v) => sameName(v.make, m.make) && sameName(v.model, m.model))
      const withCost = units.filter((v) => v.acquisitionCostIdr !== null)
      return {
        make: m.make,
        model: m.model,
        available: units.length,
        avg_days_listed: avg(units.map((v) => daysBetween(v.listedOn, on))),
        avg_price_idr: avg(units.map((v) => v.priceIdr)),
        avg_margin_idr: avg(withCost.map((v) => v.priceIdr - v.acquisitionCostIdr!)),
        linked_keyword_count: keywordParses.filter((p) => p.make !== null && p.model !== null && sameName(p.make, m.make) && sameName(p.model, m.model)).length,
      }
    })

  return {
    source: snap.source,
    snapshot_on: on,
    error: null,
    totals: {
      available: available.length,
      reserved: snap.vehicles.filter((v) => v.status === 'reserved').length,
      sold_last_30d: snap.vehicles.filter((v) => v.status === 'sold' && v.soldOn !== null && daysBetween(v.soldOn, on) >= 0 && daysBetween(v.soldOn, on) <= 30).length,
    },
    aging,
    by_model,
  }
}

export async function getInventorySummary(): Promise<InventorySummary> {
  const [snap, parses] = await Promise.all([currentInventory(), loadVehicleParses()])
  return buildInventorySummary(snap, [...parses.values()])
}

// --- suggestions -----------------------------------------------------------------

export async function listSuggestions(q: ListQuery) {
  const where: string[] = []
  const params: unknown[] = []
  if (q.status !== 'all') where.push(`s.status = $${params.push(q.status)}`)
  if (q.type !== null) where.push(`s.suggestion_type = $${params.push(q.type)}`)
  if (q.campaignId !== null) where.push(`s.campaign_id = $${params.push(q.campaignId)}`)
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [rows, [{ total }], run, inventory] = await Promise.all([
    query<SuggestionRow>(
      `${SELECT_ROWS} ${filter}
       ORDER BY s.rank ASC NULLS LAST, s.created_at DESC, s.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.limit, q.offset]
    ),
    query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM keyword_suggestions s ${filter}`, params),
    queryOne<{ id: number; finished_at: Date | null; status: 'running' | 'success' | 'failure' | 'partial' }>(
      "SELECT id, finished_at, status FROM pipeline_runs WHERE run_type = 'keyword_optimizer' ORDER BY started_at DESC, id DESC LIMIT 1"
    ),
    currentInventory(),
  ])
  return {
    items: rows.map(toSuggestion),
    total,
    run: run ? { id: run.id, finished_at: run.finished_at === null ? null : iso(run.finished_at), status: run.status } : null,
    inventory: { source: inventory.source, snapshot_on: inventory.snapshotOn },
  }
}

export async function getSuggestion(id: number): Promise<Suggestion | null> {
  const row = await queryOne<SuggestionRow>(`${SELECT_ROWS} WHERE s.id = $1`, [id])
  return row ? toSuggestion(row) : null
}

export type StatusChange = { ok: true; suggestion: Suggestion } | { ok: false; code: 400 | 404 | 409; detail: string }

export async function changeSuggestionStatus(id: number, to: 'applied' | 'dismissed' | 'open' | 'planned'): Promise<StatusChange> {
  const current = await queryOne<{ status: SuggestionStatus; suggestion_type: SuggestionType }>(
    'SELECT status, suggestion_type FROM keyword_suggestions WHERE id = $1',
    [id]
  )
  if (!current) return { ok: false, code: 404, detail: `No keyword suggestion with id ${id}` }
  const check = checkTransition(current.status, to, current.suggestion_type)
  if (!check.ok) return check
  // Guarded on the status just read, so a concurrent change (or a run
  // superseding the row in between) is a 409, not a lost update.
  const updated = await query(
    'UPDATE keyword_suggestions SET status = $2, status_changed_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = $3 RETURNING id',
    [id, to, current.status]
  )
  if (updated.length === 0) return { ok: false, code: 409, detail: 'the suggestion changed while this request was in flight — reload and try again' }
  return { ok: true, suggestion: (await getSuggestion(id))! }
}

export async function exportNegatives(q: ExportQuery): Promise<string> {
  const params: unknown[] = []
  const statusFilter = q.status === 'all' ? '' : `AND s.status = $${params.push(q.status)}`
  const rows = await query<{ campaign: string | null; ad_group: string | null; payload: SuggestionPayload }>(
    `SELECT c.name AS campaign, ag.name AS ad_group, s.payload
     FROM keyword_suggestions s
     LEFT JOIN campaigns c ON c.id = s.campaign_id
     LEFT JOIN ad_groups ag ON ag.id = s.ad_group_id
     WHERE s.suggestion_type = 'negative_keyword' ${statusFilter}
     ORDER BY s.rank ASC NULLS LAST, c.name, ag.name, s.id`,
    params
  )
  const out: NegativeExportRow[] = []
  for (const r of rows) {
    if (r.payload.kind !== 'negative_keyword') continue
    out.push({
      campaign: r.campaign,
      adGroup: r.payload.scope === 'ad_group' ? r.ad_group : null,
      text: r.payload.text,
      matchType: r.payload.match_type,
    })
  }
  return buildNegativeExport(out, q.format)
}

// --- keyword summary -----------------------------------------------------------

export interface KeywordSummary {
  keyword_id: number
  // 3.2 — identity, so the list stands on its own (paused and idle keywords
  // have no performance rows to take it from).
  text: string
  match_type: MatchType
  campaign: { id: number; name: string }
  ad_group: { id: number; name: string }
  status: 'enabled' | 'paused'
  intent_mix: Partial<Record<Intent, number>> | null
  intent_coverage: number | null
  conversions_by_action: { conversion_action_id: number; name: string; tier: ValueTier | null; conversions: number; value_micros: number }[]
  stock_count: number | null
  avg_days_listed: number | null
  waste_exposure: number | null
  verdict: KeywordVerdict // 3.1
}

export interface KeywordIdentityRow {
  id: number
  text: string
  match_type: MatchType
  status: string | null // as stored: 'enabled' in demo; ENABLED / PAUSED / REMOVED from the live API
  ad_group_id: number
  ad_group_name: string
  campaign_id: number
  campaign_name: string
}

/** keywords.status → the API's two states; null for a removed keyword
 * (left out of the summary). NULL or anything unrecognised is enabled, the
 * same rule as engineData.ts STATUS_SQL. */
export function keywordStatus(raw: string | null): 'enabled' | 'paused' | null {
  const s = (raw ?? '').toLowerCase()
  if (s === 'removed') return null
  return s === 'paused' ? 'paused' : 'enabled'
}

export interface SummaryParts {
  intents: ReadonlyMap<number, { intentMix: KeywordSummary['intent_mix']; intentCoverage: number | null; wasteExposure: number | null }>
  actions: ReadonlyMap<number, KeywordSummary['conversions_by_action']>
  stock: (keywordId: number) => { stockCount: number; avgDaysListed: number | null } | null
  verdicts: ReadonlyMap<number, KeywordVerdict>
}

/** Pure. One item per keyword that isn't removed, in id order. A keyword
 * with no activity in the window has no intent row: its intent fields are
 * null and its conversions an empty list — no data, never zero. */
export function buildKeywordSummaryItems(rows: readonly KeywordIdentityRow[], parts: SummaryParts): KeywordSummary[] {
  return [...rows]
    .sort((a, b) => a.id - b.id)
    .flatMap((r) => {
      const status = keywordStatus(r.status)
      if (status === null) return []
      const i = parts.intents.get(r.id)
      const stock = parts.stock(r.id)
      return [
        {
          keyword_id: r.id,
          text: r.text,
          match_type: r.match_type,
          campaign: { id: r.campaign_id, name: r.campaign_name },
          ad_group: { id: r.ad_group_id, name: r.ad_group_name },
          status,
          intent_mix: i?.intentMix ?? null,
          intent_coverage: i?.intentCoverage ?? null,
          conversions_by_action: parts.actions.get(r.id) ?? [],
          stock_count: stock ? stock.stockCount : null,
          avg_days_listed: stock ? stock.avgDaysListed : null,
          waste_exposure: i?.wasteExposure ?? null,
          // Only a keyword outside both the engine's input and the paused
          // list could miss a verdict; with no evidence, no call is made.
          verdict: parts.verdicts.get(r.id) ?? 'needs_data',
        },
      ]
    })
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Every keyword that isn't removed (enabled ones with no activity and
 * paused ones included), with window aggregates over the same window
 * /keywords/performance uses for the same `days` (today minus days, through
 * today). `verdict` is the exception: it is the engine's call, so it always
 * uses the engine's evidence window and thresholds (verdict.ts), whatever
 * `days` is. */
export async function getKeywordsSummary(days: number, adGroupId?: number): Promise<{ items: KeywordSummary[]; coverage: number | null }> {
  const end = new Date().toISOString().slice(0, 10)
  const start = addDays(end, -days)
  const adGroupFilter = adGroupId === undefined ? '' : 'AND k.ad_group_id = $3'
  const params: unknown[] = adGroupId === undefined ? [start, end] : [start, end, adGroupId]

  const [keywords, intents, actionRows, inventory, parses] = await Promise.all([
    query<KeywordIdentityRow>(
      `SELECT k.id, k.text, k.match_type, k.status, ag.id AS ad_group_id, ag.name AS ad_group_name,
              c.id AS campaign_id, c.name AS campaign_name
       FROM keywords k
       JOIN ad_groups ag ON ag.id = k.ad_group_id
       JOIN campaigns c ON c.id = ag.campaign_id
       WHERE k.data_source = $1 ${adGroupId === undefined ? '' : 'AND k.ad_group_id = $2'}
       ORDER BY k.id`,
      adGroupId === undefined ? [DATA_SOURCE] : [DATA_SOURCE, adGroupId]
    ),
    getKeywordIntentSummaries(start, end, adGroupId),
    query<{ keyword_id: number; conversion_action_id: number; name: string; tier: ValueTier | null; conversions: number; value_micros: number }>(
      `SELECT kca.keyword_id, ca.id AS conversion_action_id, ca.name, ca.value_tier AS tier,
              SUM(kca.conversions)::float8 AS conversions, SUM(kca.conversions_value_micros) AS value_micros
       FROM keyword_conversion_action_performance kca
       JOIN conversion_actions ca ON ca.id = kca.conversion_action_id
       JOIN keywords k ON k.id = kca.keyword_id
       WHERE kca.date BETWEEN $1 AND $2 ${adGroupFilter}
       GROUP BY kca.keyword_id, ca.id, ca.name, ca.value_tier
       ORDER BY kca.keyword_id, ca.id`,
      params
    ),
    currentInventory(),
    loadVehicleParses(),
  ])

  const actions = new Map<number, KeywordSummary['conversions_by_action']>()
  for (const r of actionRows) {
    if (!actions.has(r.keyword_id)) actions.set(r.keyword_id, [])
    actions.get(r.keyword_id)!.push({
      conversion_action_id: r.conversion_action_id,
      name: r.name,
      tier: r.tier,
      conversions: Math.round(r.conversions * 100) / 100,
      value_micros: Number(r.value_micros),
    })
  }
  // A keyword not in the parse cache yet (added since the last weekly run)
  // gets the rule parse, as the engine's reader does (engineData.ts).
  const dictionary = buildDictionary(inventory.vehicles)
  const textOf = new Map(keywords.map((k) => [k.id, k.text]))
  const stock = (keywordId: number) => {
    const parse = parses.get(keywordId) ?? (textOf.has(keywordId) ? parseVehicle(textOf.get(keywordId)!, dictionary) : undefined)
    if (!parse || inventory.source === 'unavailable' || inventory.snapshotOn === null) return null
    return matchStock(parse, inventory.vehicles, inventory.snapshotOn)
  }
  const listed = keywords.filter((k) => keywordStatus(k.status) !== null)
  const verdicts =
    listed.length > 0 ? await loadVerdicts(inventory, (id) => stock(id)?.stockCount ?? null) : new Map<number, KeywordVerdict>()

  return { items: buildKeywordSummaryItems(keywords, { intents: intents.byKeyword, actions, stock, verdicts }), coverage: intents.coverage }
}

/** The engine's input (same inventory snapshot as the summary), the paused
 * keywords over the same window, the open pause suggestions and the applied
 * test keywords. */
async function loadVerdicts(inventory: InventorySnapshot, stockCount: (keywordId: number) => number | null): Promise<Map<number, KeywordVerdict>> {
  const input = await loadEngineInput({ inventory })
  const [paused, pauses, tests] = await Promise.all([
    loadKeywordWindow(input.windowStart, input.windowEnd, 'paused'),
    query<{ keyword_id: number }>(
      "SELECT keyword_id FROM keyword_suggestions WHERE status = 'open' AND suggestion_type = 'pause_keyword' AND keyword_id IS NOT NULL"
    ),
    query<{ payload: SuggestionPayload }>(
      "SELECT payload FROM keyword_suggestions WHERE status = 'applied' AND suggestion_type = 'new_keyword' AND (payload->>'is_test')::boolean"
    ),
  ])
  return keywordVerdicts(input, {
    stockCount,
    openPauseKeywordIds: new Set(pauses.map((p) => p.keyword_id)),
    appliedTestKeywords: tests.flatMap((t) => (t.payload.kind === 'new_keyword' ? [{ text: t.payload.text, adGroupId: t.payload.ad_group_id }] : [])),
    pausedKeywords: paused,
  })
}
