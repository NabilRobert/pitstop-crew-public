// Data layer for the keyword optimizer page. Calls the real endpoints
// (overhaul-v3.md section 13), except when VITE_KEYWORD_OPTIMIZER_FIXTURES is
// "true": then it serves contract-shaped fixtures from memory so the page can
// be developed and checked before the backend ships. Fixture mode keeps
// applied/dismissed changes in memory only and never touches the network.

import { api } from '../../shared/api/api'
import type {
  Launch,
  LaunchListItem,
  LaunchRequest,
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
import { adsToLaunchWith, confirmNameOf, launchKind, plannedObjects } from './launchModel'

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
      return b.created_at.localeCompare(a.created_at) || a.id - b.id
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

// Fixture mode launches (simulated, like the real thing for now): the same rules the backend enforces, in memory.
const fixtureLaunches: LaunchListItem[] = []
let nextLaunchId = 1
/** In fixture mode creation is allowed, so the whole flow can be tried; the real switch is the `ads_write_enabled` setting. */
export const FIXTURE_WRITE_ENABLED = true

export const keywordOptimizerApi = {
  suggestions: (query: SuggestionsQuery = {}): Promise<SuggestionsResponse> =>
    USE_FIXTURES ? Promise.resolve(filterFixtures(query)) : api.keywordSuggestions(query),

  setStatus: async (id: number, status: Exclude<SuggestionStatus, 'superseded'>): Promise<Suggestion> => {
    if (!USE_FIXTURES) return api.updateKeywordSuggestion(id, status)
    const row = fixtureState.find((s) => s.id === id)
    if (!row) throw new Error(`No keyword suggestion with id ${id}`)
    if (row.status === 'superseded') throw new Error('A superseded suggestion cannot be changed')
    // Mirrors the backend's rules (contract 3.3): 'planned' only exists for new_campaign proposals.
    if (status === 'planned' && row.type !== 'new_campaign') throw new Error("Only a new campaign proposal can be planned")
    const allowed: Record<string, string[]> = {
      open: ['applied', 'dismissed', ...(row.type === 'new_campaign' ? ['planned'] : [])],
      planned: ['open', 'dismissed', 'applied'],
      applied: ['open'],
      dismissed: ['open'],
    }
    if (!(allowed[row.status] ?? []).includes(status)) throw new Error(`A suggestion that is ${row.status} cannot be changed to ${status}`)
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

  /** The paste-ready brief for a new campaign proposal (3.3). In fixture mode a readable stand-in. */
  exportBrief: (id: number, format: 'csv' | 'txt' = 'csv'): Promise<Blob> => {
    if (!USE_FIXTURES) return api.exportCampaignBrief(id, format)
    const row = fixtureState.find((s) => s.id === id)
    if (!row || row.payload.kind !== 'new_campaign') return Promise.reject(new Error('Not a new campaign proposal'))
    const p = row.payload
    const lines = [p.name, ...p.ad_groups.flatMap((g) => [`  ${g.name}`, ...g.keywords.map((k) => `    ${k.text} (${k.match_type})`)])]
    return Promise.resolve(new Blob([lines.join('\n')], { type: 'text/plain' }))
  },

  /** Contract 3.6: validate or create a SIMULATED launch. Fixture mode mirrors the server's rules and error cases. */
  launch: async (req: LaunchRequest): Promise<Launch> => {
    if (!USE_FIXTURES) return api.createLaunch(req)
    const row = fixtureState.find((x) => x.id === req.suggestion_id)
    if (!row) throw new Error(`No keyword suggestion with id ${req.suggestion_id}`)
    if (!FIXTURE_WRITE_ENABLED) throw new Error('Creating campaigns is switched off in Settings')
    if (launchKind(row) === null) throw new Error('Only a planned campaign, or a planned ad for an existing ad group, can be launched')
    if (!(req.confirm_name === confirmNameOf(row))) throw new Error('The confirmation name does not match')
    const objects = plannedObjects(row, row.payload.kind === 'new_campaign' ? adsToLaunchWith(fixtureState, row.id) : [])
    const base = { created_at: new Date().toISOString(), mode: 'simulated' as const, suggestion_id: row.id, objects }
    if (req.validate_only) {
      const v: Launch = { ...base, id: null, status: 'validated', campaign: null, messages: ['Simulated check passed: every object is within Google limits and nothing is a duplicate.'] }
      fixtureLaunches.unshift({ ...v, id: nextLaunchId++, validate_only: true })
      return v
    }
    const campaign = row.payload.kind === 'new_campaign' ? { id: 900 + nextLaunchId, name: row.payload.name } : null
    // creating moves the suggestion (and the ads that went with it) to applied
    row.status = 'applied'
    row.status_changed_at = new Date().toISOString()
    if (campaign) {
      row.linked_campaign = campaign
      for (const a of adsToLaunchWith(fixtureState, row.id)) {
        a.status = 'applied'
        a.status_changed_at = row.status_changed_at
      }
    }
    const created: Launch = { ...base, id: nextLaunchId, status: 'created', campaign, messages: ['Created in the demo data, paused. Nothing was sent to Google Ads.'] }
    fixtureLaunches.unshift({ ...created, id: nextLaunchId++, validate_only: false })
    return created
  },

  launches: (limit = 20): Promise<LaunchListItem[]> =>
    USE_FIXTURES ? Promise.resolve(fixtureLaunches.slice(0, limit)) : api.launches(limit),

  exportNegatives: (format: 'csv' | 'txt', status: SuggestionStatus | 'all' = 'open'): Promise<Blob> => {
    if (!USE_FIXTURES) return api.exportKeywordSuggestions(format, status)
    const rows = fixtureState.filter(
      (s) => s.type === 'negative_keyword' && (status === 'all' || s.status === status) && s.payload.kind === 'negative_keyword'
    )
    return Promise.resolve(new Blob([rows.map((s) => (s.payload.kind === 'negative_keyword' ? s.payload.text : '')).join('\n')], { type: 'text/plain' }))
  },
}
