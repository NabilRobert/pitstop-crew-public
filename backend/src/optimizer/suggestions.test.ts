// v3 step 6 — how an engine run is stored across weekly runs
// (src/optimizer/suggestions.ts): open rows are kept, not duplicated, and
// retired only when the run no longer produces them.

import { describe, it, expect } from 'vitest'
import { matchPlannedCampaigns, normalizeCampaignName, planPersistence, type OpenRow } from './suggestions.js'
import type { Candidate, EngineResult } from './engine.js'

const candidate = (fingerprint: string): Candidate => ({
  type: 'negative_keyword',
  campaignId: 1,
  adGroupId: 10,
  keywordId: 100,
  searchTermId: 1,
  payload: { kind: 'negative_keyword', text: 'x', match_type: 'exact', scope: 'ad_group', collisions: [] },
  evidence: { window_start: '2026-07-05', window_end: '2026-10-02', clicks: 40, impressions: 800, cost_micros: 1, conversions: 0, conversions_value_micros: 0, min_clicks_required: 37 },
  basis: 'evidence',
  confidence: 'medium',
  expectedImpact: null,
  inventorySnapshotOn: null,
  fingerprint,
})

const result = (over: Partial<EngineResult>): EngineResult => ({
  candidates: [],
  capped: [],
  existing: [],
  produced: [],
  skipped: [],
  notEnoughData: 0,
  inventoryAvailable: true,
  ...over,
})

describe('planPersistence', () => {
  const open: OpenRow[] = [
    { id: 1, fingerprint: 'still-true', inventoryDependent: false },
    { id: 2, fingerprint: 'gone', inventoryDependent: false },
    { id: 3, fingerprint: 'stock-based', inventoryDependent: true },
  ]

  it('inserts the new candidates and supersedes open rows the run no longer produces', () => {
    const plan = planPersistence(result({ candidates: [candidate('new')], produced: ['new', 'still-true'] }), open)
    expect(plan.insert.map((c) => c.fingerprint)).toEqual(['new'])
    expect(plan.supersedeIds).toEqual([2, 3])
  })

  it('keeps inventory-based open rows when this run had no inventory to re-check them against', () => {
    const plan = planPersistence(result({ produced: ['still-true'], inventoryAvailable: false }), open)
    expect(plan.supersedeIds).toEqual([2])
  })

  it('supersedes nothing when there is nothing open', () => {
    expect(planPersistence(result({ candidates: [candidate('a')], produced: ['a'] }), []).supersedeIds).toEqual([])
  })
})

describe('3.3: planned proposal → real campaign (auto-link)', () => {
  it('matches names case- and whitespace-insensitively', () => {
    expect(normalizeCampaignName('  Search —  Wuling   Almaz ')).toBe('search — wuling almaz')
    const planned = [{ id: 1, name: 'Search — Wuling Almaz' }, { id: 2, name: 'Search — Hyundai Stargazer' }, { id: 3, name: 'Search — Mobil di bawah Rp 150 juta' }]
    const campaigns = [{ id: 40, name: 'search —   wuling almaz' }, { id: 41, name: 'Search — Hyundai Stargazer 2' }, { id: 42, name: ' SEARCH — MOBIL DI BAWAH RP 150 JUTA ' }]
    expect(matchPlannedCampaigns(planned, campaigns)).toEqual([
      { suggestionId: 1, campaignId: 40 },
      { suggestionId: 3, campaignId: 42 },
    ])
  })

  it('links to the lowest campaign id when two real campaigns share the name, and links nothing with no match', () => {
    expect(matchPlannedCampaigns([{ id: 1, name: 'Search — Wuling Almaz' }], [{ id: 77, name: 'Search — Wuling Almaz' }, { id: 12, name: 'search — wuling almaz' }])).toEqual([{ suggestionId: 1, campaignId: 12 }])
    expect(matchPlannedCampaigns([{ id: 1, name: 'Search — Wuling Almaz' }], [{ id: 5, name: 'Brand' }])).toEqual([])
  })
})
