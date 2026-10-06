// Pure model for the cork-board view: turns keyword rows, the window summary
// and the suggestions into notes, loose ideas, a headline and three numbers.
// No Vue, no network, no i18n: everything the board shows is decided here from
// backend-provided numbers, so it can be checked in isolation. The frontend
// never invents a verdict (contract 3.1): it only reads `summary.verdict`.

import type {
  KeywordMatchType,
  KeywordPerformanceRow,
  KeywordSummary,
  KeywordVerdict,
  Suggestion,
  SuggestionType,
} from '../../shared/api/types'

export type SizeTier = 'S' | 'M' | 'L'

export interface BoardNote {
  keywordId: number
  text: string
  matchType: KeywordMatchType
  campaign: { id: number; name: string }
  adGroup: string
  spendMicros: number
  clicks: number
  conversions: number
  /** null when the backend predates contract 3.1 (no sticker rather than a guessed one). */
  verdict: KeywordVerdict | null
  summary: KeywordSummary | null
  size: SizeTier
  /** Open suggestions for this keyword, best-ranked first. */
  open: Suggestion[]
  /** Every suggestion for this keyword (any status), for the detail panel. */
  all: Suggestion[]
}

/** Largest few spenders are L, the next chunk M, the rest S. */
const L_SHARE = 0.15
const M_SHARE = 0.35

function byRank(a: Suggestion, b: Suggestion): number {
  if (a.rank === null && b.rank !== null) return 1
  if (a.rank !== null && b.rank === null) return -1
  if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank
  return b.created_at.localeCompare(a.created_at)
}

export function buildNotes(
  rows: KeywordPerformanceRow[],
  summaries: KeywordSummary[],
  suggestions: Suggestion[]
): BoardNote[] {
  const byKeyword = new Map<number, Omit<BoardNote, 'size' | 'open' | 'all' | 'verdict' | 'summary'>>()
  for (const r of rows) {
    const existing = byKeyword.get(r.keyword_id)
    if (!existing) {
      byKeyword.set(r.keyword_id, {
        keywordId: r.keyword_id,
        text: r.text,
        matchType: r.match_type,
        campaign: { id: r.campaign_id, name: r.campaign },
        adGroup: r.ad_group,
        spendMicros: r.cost_micros,
        clicks: r.clicks,
        conversions: r.conversions,
      })
    } else {
      existing.spendMicros += r.cost_micros
      existing.clicks += r.clicks
      existing.conversions += r.conversions
    }
  }

  const summaryById = new Map(summaries.map((s) => [s.keyword_id, s]))
  const suggestionsById = new Map<number, Suggestion[]>()
  for (const s of suggestions) {
    if (!s.keyword) continue
    const list = suggestionsById.get(s.keyword.id) ?? []
    list.push(s)
    suggestionsById.set(s.keyword.id, list)
  }

  const base = [...byKeyword.values()].sort((a, b) => b.spendMicros - a.spendMicros || a.keywordId - b.keywordId)
  const lCut = Math.max(1, Math.round(base.length * L_SHARE))
  const mCut = lCut + Math.round(base.length * M_SHARE)

  return base.map((k, i) => {
    const summary = summaryById.get(k.keywordId) ?? null
    const all = (suggestionsById.get(k.keywordId) ?? []).slice().sort(byRank)
    return {
      ...k,
      verdict: summary?.verdict ?? null,
      summary,
      size: i < lCut ? 'L' : i < mCut ? 'M' : 'S',
      open: all.filter((s) => s.status === 'open'),
      all,
    }
  })
}

/** Suggestions that belong to no single keyword (campaign ideas, campaign-wide negatives, brand-new keyword ideas). */
export function looseIdeas(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.filter((s) => s.keyword === null && s.status === 'open').sort(byRank)
}

export interface BoardFilter {
  campaignId: number | null
  verdict: KeywordVerdict | 'all'
  showAll: boolean
}

export const BOARD_LIMIT = 24

/** What the board actually draws: filters first, then the biggest spenders plus anything with advice. */
export function visibleNotes(notes: BoardNote[], filter: BoardFilter, limit = BOARD_LIMIT): { shown: BoardNote[]; hidden: number } {
  const filtered = notes.filter(
    (n) => (filter.campaignId === null || n.campaign.id === filter.campaignId) && (filter.verdict === 'all' || n.verdict === filter.verdict)
  )
  if (filter.showAll || filtered.length <= limit) return { shown: filtered, hidden: 0 }
  const withAdvice = filtered.filter((n) => n.open.length > 0)
  const adviceIds = new Set(withAdvice.map((n) => n.keywordId))
  const room = Math.max(0, limit - withAdvice.length)
  const topSpenders = filtered.filter((n) => !adviceIds.has(n.keywordId)).slice(0, room)
  const keep = new Set([...withAdvice, ...topSpenders].map((n) => n.keywordId))
  const shown = filtered.filter((n) => keep.has(n.keywordId)) // keeps the spend order
  return { shown, hidden: filtered.length - shown.length }
}

export const STOP_TYPES: SuggestionType[] = ['negative_keyword', 'pause_keyword', 'change_match_type']
export const GROW_TYPES: SuggestionType[] = ['promote_search_term', 'raise_bid_candidate', 'spin_out_campaign']
export const NEW_TYPES: SuggestionType[] = ['new_keyword']

export interface Headline {
  total: number
  stop: number
  grow: number
  fresh: number
}

/** Counts behind the headline sentence, over OPEN suggestions only. */
export function headline(suggestions: Suggestion[]): Headline {
  const open = suggestions.filter((s) => s.status === 'open')
  const count = (types: SuggestionType[]) => open.filter((s) => types.includes(s.type)).length
  return { total: open.length, stop: count(STOP_TYPES), grow: count(GROW_TYPES), fresh: count(NEW_TYPES) }
}

export interface BoardNumbers {
  /** Spend on keywords that are not working: wasting money, or advertised with no cars to sell. null = backend has no verdicts. */
  nowhereMicros: number | null
  /** Spend on keywords that are working. null = backend has no verdicts. */
  winnersMicros: number | null
}

export function boardNumbers(notes: BoardNote[]): BoardNumbers {
  if (!notes.some((n) => n.verdict !== null)) return { nowhereMicros: null, winnersMicros: null }
  const sum = (verdicts: KeywordVerdict[]) =>
    notes.filter((n) => n.verdict && verdicts.includes(n.verdict)).reduce((acc, n) => acc + n.spendMicros, 0)
  return { nowhereMicros: sum(['wasting', 'no_stock']), winnersMicros: sum(['winner']) }
}

export function campaignsOf(notes: BoardNote[]): { id: number; name: string }[] {
  const seen = new Map<number, string>()
  for (const n of notes) seen.set(n.campaign.id, n.campaign.name)
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

/** A small deterministic tilt per note, -2.5 to +2.4 degrees, so a board looks pinned by hand but never jitters between renders. */
export function tiltDegrees(keywordId: number): number {
  return ((keywordId * 37) % 50) / 10 - 2.5
}

/** Cost per conversion, or null if there were no conversions (never divide by zero, never show 0). */
export function costPerConversionMicros(n: Pick<BoardNote, 'spendMicros' | 'conversions'>): number | null {
  return n.conversions > 0 ? n.spendMicros / n.conversions : null
}

export interface CampaignRollup {
  keywords: number
  /** Keyword count per verdict. Keywords without a verdict (older backend) are counted under `none`. */
  verdicts: Record<KeywordVerdict | 'none', number>
  /** Open suggestions that belong to this campaign (keyword-level or campaign-level). */
  openSuggestions: number
}

const EMPTY_VERDICTS = (): CampaignRollup['verdicts'] => ({
  winner: 0, wasting: 0, no_stock: 0, testing: 0, needs_data: 0, steady: 0, none: 0,
})

/** One small summary per campaign for the Campaigns list: how its keywords are judged, and how much advice is waiting.
 * Campaigns with no keyword rows (Performance Max, Display) are simply absent from the map. */
export function campaignRollup(
  rows: KeywordPerformanceRow[],
  summaries: KeywordSummary[],
  suggestions: Suggestion[]
): Map<number, CampaignRollup> {
  const campaignOfKeyword = new Map<number, number>()
  for (const r of rows) campaignOfKeyword.set(r.keyword_id, r.campaign_id)
  const verdictOf = new Map(summaries.map((s) => [s.keyword_id, s.verdict ?? null]))

  const out = new Map<number, CampaignRollup>()
  const get = (campaignId: number): CampaignRollup => {
    let r = out.get(campaignId)
    if (!r) {
      r = { keywords: 0, verdicts: EMPTY_VERDICTS(), openSuggestions: 0 }
      out.set(campaignId, r)
    }
    return r
  }
  for (const [keywordId, campaignId] of campaignOfKeyword) {
    const r = get(campaignId)
    r.keywords++
    r.verdicts[verdictOf.get(keywordId) ?? 'none']++
  }
  for (const s of suggestions) {
    if (s.status !== 'open' || !s.campaign) continue
    get(s.campaign.id).openSuggestions++
  }
  return out
}
