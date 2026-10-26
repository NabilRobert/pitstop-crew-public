// Kai's step around the engine (docs/overhaul-v3-backend.md section 11.3),
// the pure parts: what she is shown, the deterministic check of what she
// returns, and the text Ciri grades. Kai may only rank candidates and
// explain them. She can't add one, and every number the UI shows comes
// from the database rows, never from her text.

import type { Basis, Confidence, ExpectedImpact, MatchType, SuggestionEvidence, SuggestionPayload, SuggestionType } from './types.js'

/** An open keyword_suggestions row with the names it points at. */
export interface OpenSuggestion {
  id: number
  type: SuggestionType
  basis: Basis
  confidence: Confidence
  payload: SuggestionPayload
  evidence: SuggestionEvidence
  expectedImpact: ExpectedImpact | null
  campaignName: string | null
  adGroupName: string | null
  keyword: { text: string; matchType: MatchType } | null
  searchTerm: string | null
  explanation: string | null // set by an earlier run's Kai step, or null
}

export interface AccountSummary {
  windowStart: string
  windowEnd: string
  inventory: { source: 'demo' | 'connected' | 'unavailable'; snapshotOn: string | null }
  campaigns: { name: string; clicks: number; costMicros: number; conversions: number }[]
}

// Money reaches Kai in whole rupiah, never micros: a field ending in _micros
// (or with _micros_ inside, like wasted_spend_micros_per_week) becomes the
// same name with _idr, its value divided by 1,000,000 and rounded.
const MICROS_KEY = /_micros(?=_|$)/

/** A copy of a value with every micros field turned into whole rupiah. */
export function inRupiah(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inRupiah)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) =>
      MICROS_KEY.test(k) ? [k.replace(MICROS_KEY, '_idr'), typeof v === 'number' ? Math.round(v / 1e6) : v] : [k, inRupiah(v)]
    )
  )
}

/** The JSON Kai receives (and Ciri grades her against). Snake case, the
 * contract's own field names, money in whole rupiah (inRupiah). Only rows
 * without an explanation get a new one; the rest are ranked alongside them. */
export function buildKaiInput(open: readonly OpenSuggestion[], summary: AccountSummary): string {
  return JSON.stringify({
    account: {
      window_start: summary.windowStart,
      window_end: summary.windowEnd,
      inventory: { source: summary.inventory.source, snapshot_on: summary.inventory.snapshotOn },
      campaigns: summary.campaigns.map((c) => ({
        name: c.name,
        clicks: c.clicks,
        cost_idr: Math.round(c.costMicros / 1e6),
        conversions: Math.round(c.conversions * 100) / 100,
      })),
    },
    candidates: open.map((o) => {
      const { kind: _kind, ...payload } = o.payload as unknown as Record<string, unknown>
      // 3.6: an ad's checks are all true once stored; not sent.
      if (o.type === 'new_ad') delete payload.checks
      return {
        candidate_id: o.id,
        type: o.type,
        basis: o.basis,
        confidence: o.confidence,
        needs_explanation: o.explanation === null,
        campaign: o.campaignName,
        ad_group: o.adGroupName,
        keyword: o.keyword ? `${o.keyword.text} (${o.keyword.matchType})` : null,
        search_term: o.searchTerm,
        payload: inRupiah(payload),
        evidence: inRupiah(o.evidence),
        expected_impact: inRupiah(o.expectedImpact),
      }
    }),
  })
}

export interface RankedItem {
  candidateId: number
  rank: number // 1 = most important, renumbered 1..n
  explanation: string | null // null = keep the row's existing explanation
}

export interface RankingValidation {
  items: RankedItem[]
  rejected: { candidate_id: unknown; reason: 'malformed' | 'unknown_id' | 'duplicate' | 'bad_rank' }[]
  // Explanations quoting a number not in that candidate's own data.
  // STARTING DEFAULT: flagged in the trace, not dropped — except for the
  // types in STRICT_NUMBER_TYPES, whose explanation is dropped (`dropped`).
  foreignNumbers: { candidateId: number; numbers: string[]; dropped: boolean }[]
  // Explanations that say "micros" or quote a rupiah figure that isn't one
  // of the candidate's own: always dropped, whatever the type.
  badMoney: { candidateId: number; problems: string[] }[]
  unranked: number[] // candidate ids Kai left out (their rank stays null)
}

export const MAX_EXPLANATION_CHARS = 600

// 3.3: a campaign proposal's explanation (3.6: and an ad's) may quote only
// numbers in its own fields. One that quotes any other number is dropped, and
// the row asks for a new explanation next run.
export const STRICT_NUMBER_TYPES: ReadonlySet<SuggestionType> = new Set(['new_campaign', 'new_ad'])

/** Validates Kai's {"ranking":[{candidate_id, rank, explanation}]}. Ids not
 * in the candidate set, ids given twice (both copies), and non-numeric
 * ranks are rejected; the rest are ordered by Kai's rank and renumbered
 * 1..n. An explanation is kept only for a candidate that asked for one. */
export function validateRanking(raw: unknown, candidates: readonly OpenSuggestion[]): RankingValidation {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const rejected: RankingValidation['rejected'] = []
  const list = raw && typeof raw === 'object' ? (raw as { ranking?: unknown }).ranking : undefined
  const entries = Array.isArray(list) ? list : []

  const counts = new Map<number, number>()
  for (const e of entries) {
    const id = e && typeof e === 'object' ? (e as { candidate_id?: unknown }).candidate_id : undefined
    if (typeof id === 'number') counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const kept: { id: number; rank: number; order: number; explanation: string | null }[] = []
  entries.forEach((e, order) => {
    if (!e || typeof e !== 'object') return void rejected.push({ candidate_id: null, reason: 'malformed' })
    const { candidate_id, rank, explanation } = e as { candidate_id?: unknown; rank?: unknown; explanation?: unknown }
    if (typeof candidate_id !== 'number' || !byId.has(candidate_id)) return void rejected.push({ candidate_id, reason: 'unknown_id' })
    if ((counts.get(candidate_id) ?? 0) > 1) return void rejected.push({ candidate_id, reason: 'duplicate' })
    if (typeof rank !== 'number' || !Number.isFinite(rank)) return void rejected.push({ candidate_id, reason: 'bad_rank' })
    const wanted = byId.get(candidate_id)!.explanation === null
    const text = typeof explanation === 'string' ? explanation.trim().slice(0, MAX_EXPLANATION_CHARS) : ''
    kept.push({ id: candidate_id, rank, order, explanation: wanted && text !== '' ? text : null })
  })

  kept.sort((a, b) => a.rank - b.rank || a.order - b.order)
  const foreignNumbers: RankingValidation['foreignNumbers'] = []
  const badMoney: RankingValidation['badMoney'] = []
  const items = kept.map((k, i) => {
    let explanation = k.explanation
    if (explanation !== null) {
      const c = byId.get(k.id)!
      const money = moneyProblems(explanation, c)
      if (money.length > 0) badMoney.push({ candidateId: k.id, problems: money })
      const numbers = findForeignNumbers(explanation, c)
      if (numbers.length > 0) {
        const dropped = STRICT_NUMBER_TYPES.has(c.type)
        foreignNumbers.push({ candidateId: k.id, numbers, dropped })
        if (dropped) explanation = null
      }
      if (money.length > 0) explanation = null
    }
    return { candidateId: k.id, rank: i + 1, explanation }
  })
  const rankedIds = new Set(items.map((i) => i.candidateId))
  return { items, rejected, foreignNumbers, badMoney, unranked: candidates.filter((c) => !rankedIds.has(c.id)).map((c) => c.id) }
}

// --- the number check ---------------------------------------------------

const NUMBER = String.raw`\d+(?:[.,]\d+)*(?:\s*(?:miliar|milyar|billion|juta|jt|ribu|rb|k|million|thousand)\b)?`
const NUMBER_TOKEN = new RegExp(NUMBER, 'gi')
// A rupiah figure: "Rp 45,111", "Rp45.111", "IDR 2.3 juta", "45,111 rupiah".
const RUPIAH = new RegExp(String.raw`\b(?:rp|idr)\.?\s*(${NUMBER})|(${NUMBER})\s*rupiah\b`, 'gi')
const MICROS_WORD = /\bmicros?\b/i

/** The numeric readings of one token: English (1,234.5) and Indonesian
 * (1.234,5) separators, with a "miliar"/"juta"/"ribu"/"k" multiplier applied. */
function readings(token: string): number[] {
  const m = token.match(/^([\d.,]+)\s*([a-z]*)$/i)
  if (!m) return []
  const unit = m[2].toLowerCase()
  const mult = ['miliar', 'milyar', 'billion'].includes(unit)
    ? 1e9
    : ['juta', 'jt', 'million'].includes(unit)
      ? 1e6
      : ['ribu', 'rb', 'k', 'thousand'].includes(unit)
        ? 1e3
        : 1
  const en = Number(m[1].replace(/,/g, ''))
  const id = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return [en, id].filter(Number.isFinite).map((n) => n * mult)
}

const DATE = /\b\d{4}-\d{2}-\d{2}\b/g

// A date is one value, not three numbers: its parts never count as figures.
function collectNumbers(value: unknown, out: number[]): void {
  if (typeof value === 'number' && Number.isFinite(value)) out.push(value)
  else if (typeof value === 'string') for (const t of value.replace(DATE, ' ').match(NUMBER_TOKEN) ?? []) out.push(...readings(t))
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectNumbers(v, out)
}

/** Every number a candidate's explanation may quote: what Kai was shown of
 * its evidence, payload and expected impact (money in rupiah, never micros)
 * and its target texts, plus a 0-1 share as a percent. */
export function allowedNumbers(c: OpenSuggestion): number[] {
  const raw: number[] = []
  collectNumbers([inRupiah([c.evidence, c.payload, c.expectedImpact]), c.keyword?.text, c.searchTerm, c.campaignName, c.adGroupName], raw)
  const out = new Set<number>()
  for (const n of raw) {
    out.add(n)
    if (Math.abs(n) <= 1) out.add(n * 100)
  }
  return [...out]
}

/** The candidate's money, in rupiah: every _idr field of what Kai was shown,
 * and any rupiah figure inside its own texts (a theme such as "Used Cars
 * Rp 150–250 Juta"). */
export function rupiahFigures(c: OpenSuggestion): number[] {
  const out: number[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') for (const m of v.matchAll(RUPIAH)) out.push(...readings((m[1] ?? m[2]).trim()))
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (/_idr(?=_|$)/.test(k) && typeof x === 'number' && Number.isFinite(x)) out.push(x)
        else walk(x)
      }
  }
  walk([inRupiah([c.evidence, c.payload, c.expectedImpact]), c.keyword?.text, c.searchTerm, c.campaignName, c.adGroupName])
  return out
}

/** Like the ad copy's number check (adCopy.ts), for money: an explanation may
 * not mention micros, and every rupiah figure it quotes must be one of the
 * candidate's own, as written or rounded ("Rp 45 ribu" for Rp 45,111). */
export function moneyProblems(explanation: string, c: OpenSuggestion): string[] {
  const out: string[] = []
  if (MICROS_WORD.test(explanation)) out.push('mentions micros')
  const allowed = rupiahFigures(c)
  for (const m of explanation.matchAll(RUPIAH)) {
    const token = (m[1] ?? m[2]).trim()
    if (!readings(token).some((x) => allowed.some((a) => close(x, a)))) out.push(`"${m[0].trim()}" is not a rupiah figure in the evidence`)
  }
  return out
}

const close = (x: number, a: number) => Math.abs(x - a) <= Math.max(0.51, 0.02 * Math.abs(a))

/** The candidate's own dates may be quoted as written; any other date is
 * reported whole. */
export function findForeignNumbers(explanation: string, c: OpenSuggestion): string[] {
  const allowed = allowedNumbers(c)
  const ownDates = new Set(JSON.stringify([c.evidence, c.payload]).match(DATE) ?? [])
  const dates = explanation.match(DATE) ?? []
  const rest = explanation.replace(DATE, ' ')
  return [
    ...dates.filter((d) => !ownDates.has(d)),
    ...(rest.match(NUMBER_TOKEN) ?? []).filter((t) => !readings(t).some((x) => allowed.some((a) => close(x, a)))),
  ]
}

// --- the text Ciri grades -------------------------------------------------

function target(c: OpenSuggestion): string {
  const p = c.payload
  switch (p.kind) {
    case 'negative_keyword':
      return `negative ${p.match_type} "${p.text}" (${p.scope === 'campaign' ? c.campaignName : c.adGroupName})`
    case 'promote_search_term':
      return `promote "${p.text}" to exact (${c.adGroupName})`
    case 'change_match_type':
      return `${c.keyword?.text} ${p.from} → ${p.to}`
    case 'pause_keyword':
      return `pause ${c.keyword?.text}`
    case 'spin_out_campaign':
      return `${p.suggested_name} (${p.keyword_ids.length} keywords from ${c.adGroupName})`
    case 'new_keyword':
      return `new keyword "${p.text}"${c.adGroupName ? ` (${c.adGroupName})` : ''}`
    case 'raise_bid_candidate':
      return `raise bid on ${c.keyword?.text}`
    case 'new_campaign':
      return `new campaign "${p.name}" (${p.basis.replace(/_/g, ' ')}, ${p.ad_groups.length} ad group${p.ad_groups.length === 1 ? '' : 's'}, ${p.stock.units} units)`
    case 'new_ad': {
      const where = p.target.kind === 'proposed_campaign' ? `"${p.target.ad_group_name}" in proposal #${p.target.campaign_suggestion_id}` : `"${c.adGroupName}" in "${c.campaignName}"`
      return `new ad for ${where} (${p.basis.replace(/_/g, ' ')}, ${p.facts.units} units)`
    }
  }
}

/** The ranked list as readable text: stored as Kai's ai_outputs content
 * and graded by Ciri, whose issue quotes must be verbatim substrings of it. */
export function renderRanking(items: readonly RankedItem[], candidates: readonly OpenSuggestion[]): string {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  return items
    .map((i) => {
      const c = byId.get(i.candidateId)!
      const head = `#${i.rank} [${c.type.replace(/_/g, ' ')}${c.basis === 'prior' ? ', unverified' : ''}] ${target(c)}`
      if (i.explanation !== null) return `${head}\n${i.explanation}`
      // Asked for one this run but none survived validation (e.g. a dropped
      // new_campaign explanation), or kept from an earlier run.
      return `${head}\n${c.explanation === null ? '(no usable explanation this run)' : '(explained in an earlier run)'}`
    })
    .join('\n\n')
}
