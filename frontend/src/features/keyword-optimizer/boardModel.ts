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
  /** Contract 3.2: 'paused' keywords are shown muted; null when the backend predates it. */
  status: 'enabled' | 'paused' | null
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
  const byTime = b.created_at.localeCompare(a.created_at)
  // One run's rows share a timestamp: fall back to id ascending, which is the engine's own order.
  return byTime !== 0 ? byTime : a.id - b.id
}

export function buildNotes(
  rows: KeywordPerformanceRow[],
  summaries: KeywordSummary[],
  suggestions: Suggestion[]
): BoardNote[] {
  const byKeyword = new Map<number, Omit<BoardNote, 'size' | 'open' | 'all' | 'verdict' | 'summary' | 'status'>>()
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

  // Contract 3.2: the summary lists EVERY non-removed keyword, including paused ones and ones with no
  // activity in the period. They have no performance rows, so give them a note with zero spend.
  for (const sm of summaries) {
    if (byKeyword.has(sm.keyword_id) || !sm.text || !sm.campaign || !sm.ad_group) continue
    byKeyword.set(sm.keyword_id, {
      keywordId: sm.keyword_id,
      text: sm.text,
      matchType: sm.match_type ?? 'phrase',
      campaign: sm.campaign,
      adGroup: sm.ad_group.name,
      spendMicros: 0,
      clicks: 0,
      conversions: 0,
    })
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
      status: summary?.status ?? null,
      summary,
      size: i < lCut ? 'L' : i < mCut ? 'M' : 'S',
      open: all.filter((s) => s.status === 'open'),
      all,
    }
  })
}

/** Suggestions that belong to no single keyword (campaign ideas, campaign-wide negatives, brand-new keyword ideas).
 * Whole-campaign proposals are NOT here: they have their own, much more visible lane (see `proposalsByStatus`). */
export function looseIdeas(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.filter((s) => s.keyword === null && s.status === 'open' && s.type !== 'new_campaign' && !isProposalAd(s)).sort(byRank)
}

/** An ad that is part of a proposed campaign (shown inside that campaign's poster, not as its own idea). */
export function isProposalAd(s: Suggestion): boolean {
  return s.type === 'new_ad' && s.payload.kind === 'new_ad' && s.payload.target.kind === 'proposed_campaign'
}

/** The ads that belong to one proposed campaign, in the order the server sent them. */
export function adsOfProposal(suggestions: Suggestion[], campaignSuggestionId: number): Suggestion[] {
  return suggestions.filter(
    (s) => s.payload.kind === 'new_ad' && s.payload.target.kind === 'proposed_campaign' && s.payload.target.campaign_suggestion_id === campaignSuggestionId && s.status !== 'dismissed' && s.status !== 'superseded'
  )
}

/** New-campaign proposals in one status ('open' = proposed by the AI and waiting, 'planned' = approved). */
export function proposalsByStatus(suggestions: Suggestion[], status: 'open' | 'planned'): Suggestion[] {
  return suggestions.filter((s) => s.type === 'new_campaign' && s.status === status).sort(byRank)
}

export interface BoardFilter {
  campaignId: number | null
  verdict: KeywordVerdict | 'all'
  showAll: boolean
  /** Free-text search over keyword, campaign and ad group. Empty = no search. Searching always shows every match. */
  query?: string
}

/** Every whitespace-separated word of the query must appear, case-insensitively, as plain text (no regex).
 * An empty or blank query matches everything. Shared by the board search and the inventory search. */
export function matchesAllWords(haystack: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const h = haystack.toLowerCase()
  return words.every((w) => h.includes(w))
}

/** Board search: the keyword, its campaign or its ad group. */
export function matchesQuery(n: Pick<BoardNote, 'text' | 'adGroup' | 'campaign'>, query: string): boolean {
  return matchesAllWords(`${n.text} ${n.campaign.name} ${n.adGroup}`, query)
}

export const BOARD_LIMIT = 24

/** What the board actually draws: filters first, then the biggest spenders plus anything with advice. */
export function visibleNotes(notes: BoardNote[], filter: BoardFilter, limit = BOARD_LIMIT): { shown: BoardNote[]; hidden: number } {
  const searching = !!filter.query && filter.query.trim() !== ''
  const filtered = notes.filter(
    (n) =>
      (filter.campaignId === null || n.campaign.id === filter.campaignId) &&
      (filter.verdict === 'all' || n.verdict === filter.verdict) &&
      (!searching || matchesQuery(n, filter.query as string))
  )
  // A search is a request to see the matches, all of them: the "biggest 24" trim does not apply.
  if (searching || filter.showAll || filtered.length <= limit) return { shown: filtered, hidden: 0 }
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
export const NEW_TYPES: SuggestionType[] = ['new_keyword', 'new_campaign', 'new_ad']

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

export interface CampaignKeyword {
  keywordId: number
  text: string
  matchType: KeywordMatchType
  status: 'enabled' | 'paused' | null
  verdict: KeywordVerdict | null
  spendMicros: number
}

export interface CampaignRollup {
  keywords: number
  /** The campaign's keywords by spend, biggest first (paused and idle ones included, contract 3.2). */
  keywordList: CampaignKeyword[]
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
  // 3.2: paused and idle keywords have no rows but belong to a campaign all the same.
  for (const sm of summaries) if (sm.campaign && !campaignOfKeyword.has(sm.keyword_id)) campaignOfKeyword.set(sm.keyword_id, sm.campaign.id)
  const verdictOf = new Map(summaries.map((s) => [s.keyword_id, s.verdict ?? null]))

  const out = new Map<number, CampaignRollup>()
  const get = (campaignId: number): CampaignRollup => {
    let r = out.get(campaignId)
    if (!r) {
      r = { keywords: 0, keywordList: [], verdicts: EMPTY_VERDICTS(), openSuggestions: 0 }
      out.set(campaignId, r)
    }
    return r
  }
  const rowInfo = new Map<number, { text: string; matchType: KeywordMatchType; spend: number }>()
  for (const r of rows) {
    const e = rowInfo.get(r.keyword_id)
    if (e) e.spend += r.cost_micros
    else rowInfo.set(r.keyword_id, { text: r.text, matchType: r.match_type, spend: r.cost_micros })
  }
  const summaryOf = new Map(summaries.map((s) => [s.keyword_id, s]))
  for (const [keywordId, campaignId] of campaignOfKeyword) {
    const r = get(campaignId)
    r.keywords++
    r.verdicts[verdictOf.get(keywordId) ?? 'none']++
    const sm = summaryOf.get(keywordId)
    const info = rowInfo.get(keywordId)
    const text = info?.text ?? sm?.text
    if (text) {
      r.keywordList.push({
        keywordId,
        text,
        matchType: info?.matchType ?? sm?.match_type ?? 'phrase',
        status: sm?.status ?? null,
        verdict: sm?.verdict ?? null,
        spendMicros: info?.spend ?? 0,
      })
    }
  }
  for (const r of out.values()) r.keywordList.sort((a, b) => b.spendMicros - a.spendMicros || a.keywordId - b.keywordId)
  for (const s of suggestions) {
    if (s.status !== 'open' || !s.campaign) continue
    get(s.campaign.id).openSuggestions++
  }
  return out
}
