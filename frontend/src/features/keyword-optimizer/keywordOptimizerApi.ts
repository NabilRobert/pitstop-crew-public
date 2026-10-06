// Data layer for the keyword optimizer page. Calls the real endpoints
// (overhaul-v3.md section 13), except when VITE_KEYWORD_OPTIMIZER_FIXTURES is
// "true": then it serves contract-shaped fixtures from memory so the page can
// be developed and checked before the backend ships. Fixture mode keeps
// applied/dismissed changes in memory only and never touches the network.

import { api } from '../../shared/api/api'
import type {
  KeywordPerformanceRow,
  InventorySummary,
  KeywordSummaryResponse,
  Suggestion,
  SuggestionStatus,
  SuggestionsQuery,
  SuggestionsResponse,
} from '../../shared/api/types'
import {
  FIXTURE_INVENTORY,
  FIXTURE_KEYWORD_ROWS,
  FIXTURE_KEYWORD_SUMMARY,
  FIXTURE_SUGGESTIONS,
} from './fixtures'

export const USE_FIXTURES = import.meta.env.VITE_KEYWORD_OPTIMIZER_FIXTURES === 'true'

// Mutable copy so PATCH works in fixture mode.
const fixtureState: Suggestion[] = FIXTURE_SUGGESTIONS.map((s) => ({ ...s }))

function filterFixtures(query: SuggestionsQuery): SuggestionsResponse {
  const status = query.status ?? 'open'
  const filtered = fixtureState
    .filter((s) => (status === 'all' ? true : s.status === status))
    .filter((s) => (query.type ? s.type === query.type : true))
    .filter((s) => (query.campaign_id ? s.campaign?.id === query.campaign_id : true))
    // contract: rank ascending with nulls last, then created_at descending
    .sort((a, b) => {
      if (a.rank === null && b.rank !== null) return 1
      if (a.rank !== null && b.rank === null) return -1
      if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank
      return b.created_at.localeCompare(a.created_at)
    })
  const offset = query.offset ?? 0
  const limit = query.limit ?? 50
  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    run: { id: 140, finished_at: '2026-10-05T23:12:00Z', status: 'success' },
    inventory: { source: 'demo', snapshot_on: FIXTURE_INVENTORY.snapshot_on },
  }
}

export const keywordOptimizerApi = {
  suggestions: (query: SuggestionsQuery = {}): Promise<SuggestionsResponse> =>
    USE_FIXTURES ? Promise.resolve(filterFixtures(query)) : api.keywordSuggestions(query),

  setStatus: async (id: number, status: Exclude<SuggestionStatus, 'superseded'>): Promise<Suggestion> => {
    if (!USE_FIXTURES) return api.updateKeywordSuggestion(id, status)
    const row = fixtureState.find((s) => s.id === id)
    if (!row) throw new Error(`No keyword suggestion with id ${id}`)
    if (row.status === 'superseded') throw new Error('A superseded suggestion cannot be changed')
    row.status = status
    row.status_changed_at = status === 'open' ? null : new Date().toISOString()
    return { ...row }
  },

  inventory: (): Promise<InventorySummary> =>
    USE_FIXTURES ? Promise.resolve(FIXTURE_INVENTORY) : api.inventorySummary(),

  summary: (days = 30, adGroupId?: number): Promise<KeywordSummaryResponse> =>
    USE_FIXTURES ? Promise.resolve(FIXTURE_KEYWORD_SUMMARY) : api.keywordSummary(days, adGroupId),

  /** Per-day keyword rows for the whole account (no ad group filter). */
  keywordRows: (days = 30): Promise<KeywordPerformanceRow[]> =>
    USE_FIXTURES ? Promise.resolve(FIXTURE_KEYWORD_ROWS) : api.keywordPerformance(days),

  exportNegatives: (format: 'csv' | 'txt', status: SuggestionStatus | 'all' = 'open'): Promise<Blob> => {
    if (!USE_FIXTURES) return api.exportKeywordSuggestions(format, status)
    const rows = fixtureState.filter(
      (s) => s.type === 'negative_keyword' && (status === 'all' || s.status === status) && s.payload.kind === 'negative_keyword'
    )
    return Promise.resolve(new Blob([rows.map((s) => (s.payload.kind === 'negative_keyword' ? s.payload.text : '')).join('\n')], { type: 'text/plain' }))
  },
}
