// Contract 3.1 — the per-keyword verdict (verdict.ts): each label, the
// order they're checked in, and the cases a label must never get wrong.

import { describe, it, expect } from 'vitest'
import { keywordVerdicts, type VerdictContext } from './verdict.js'
import { evidenceWindow, type EngineInput, type EngineKeyword, type WindowStats } from './engine.js'
import { nMin } from './significance.js'

const AS_OF = '2026-10-05'
const { start, end } = evidenceWindow(AS_OF)

const stats = (clicks: number, conversions: number, costPerClick = 1_600_000_000): WindowStats => ({
  impressions: clicks * 20,
  clicks,
  costMicros: clicks * costPerClick,
  conversions,
  conversionsValueMicros: 0,
})

const kw = (id: number, text: string, s: WindowStats, adGroupId = 10): EngineKeyword => ({
  id, adGroupId, text, matchType: 'phrase', cpcBidMicros: null, firstServedOn: '2026-06-01', stats: s, qualityScore: 7, rankLostShare: null,
})

// One ad group whose big baseline keyword sets an 8% conversion rate and a
// CPA of Rp 20,000 (1,600 per click / 0.08). The keyword under test (id 2)
// is small next to it, so the ad group's numbers barely move.
const BASE = kw(1, '"mobil bekas jakarta"', stats(2000, 160))

function verdicts(k: EngineKeyword, ctx: Partial<VerdictContext> = {}) {
  const input = {
    asOf: AS_OF, windowStart: start, windowEnd: end,
    campaigns: [{ id: 1, name: 'c' }], adGroups: [{ id: 10, campaignId: 1, name: 'g' }],
    keywords: [BASE, k], searchTerms: [], intents: new Map(), vehicleParses: new Map(),
    inventory: { source: 'demo', snapshotOn: AS_OF, vehicles: [], events: [], error: null },
    negatives: [], changeEvents: [], history: [], settings: { pValue: 0.05, allowedSpendShare: 0.2, leadToSaleRate: 0.02 },
  } as EngineInput
  return keywordVerdicts(input, { stockCount: () => null, openPauseKeywordIds: new Set(), appliedTestKeywords: [], ...ctx })
}
const verdictOf = (k: EngineKeyword, ctx: Partial<VerdictContext> = {}) => verdicts(k, ctx).get(k.id)
// A paused keyword is passed alongside the engine's (enabled) input, in the
// same ad group as the baseline keyword.
const pausedVerdict = (k: EngineKeyword, ctx: Partial<VerdictContext> = {}) =>
  verdicts(kw(99, '"unused"', stats(0, 0)), { ...ctx, pausedKeywords: [k] }).get(k.id)

// n_min for this ad group (≈ 37 at 8%); the test keyword's own clicks
// shift the ad-group rate a little, so the cases stay well clear of it.
const N = nMin(0.08)
const ENOUGH = N + 15
const FEW = N - 15

describe('keyword verdicts, one each', () => {
  it('no_stock: spent in the window and none of the car in stock', () => {
    expect(verdictOf(kw(2, '"bmw 320i bekas"', stats(20, 0)), { stockCount: () => 0 })).toBe('no_stock')
  })

  it('testing: an applied test keyword still under n_min clicks', () => {
    const tests = [{ text: 'wuling almaz bekas', adGroupId: 10 }]
    expect(verdictOf(kw(2, '"wuling almaz bekas"', stats(FEW, 0)), { appliedTestKeywords: tests })).toBe('testing')
    expect(verdictOf(kw(2, '"wuling almaz bekas"', stats(FEW, 0)), { appliedTestKeywords: [{ text: 'wuling almaz bekas', adGroupId: null }] })).toBe('testing')
    expect(verdictOf(kw(2, '"wuling almaz bekas"', stats(FEW, 0)), { appliedTestKeywords: [{ text: 'wuling almaz bekas', adGroupId: 99 }] })).toBe('needs_data')
  })

  it('wasting: n_min clicks and zero conversions', () => {
    expect(verdictOf(kw(2, '"mobil bekas tua"', stats(ENOUGH, 0)))).toBe('wasting')
  })

  it('wasting: an open pause suggestion, even below n_min', () => {
    expect(verdictOf(kw(2, '"mobil bekas tua"', stats(FEW, 0)), { openPauseKeywordIds: new Set([2]) })).toBe('wasting')
  })

  it('winner: n_min clicks, 2+ conversions, CPA at or below the ad group’s', () => {
    expect(verdictOf(kw(2, '"avanza bekas"', stats(ENOUGH, ENOUGH * 0.12)))).toBe('winner')
  })

  it('needs_data: under n_min clicks, however good it looks', () => {
    expect(verdictOf(kw(2, '"avanza bekas"', stats(FEW, FEW * 0.3)))).toBe('needs_data')
  })

  it('steady: enough clicks, converting, but not beating its ad group', () => {
    expect(verdictOf(kw(2, '"avanza bekas"', stats(ENOUGH, ENOUGH * 0.04)))).toBe('steady')
    // Beats the CPA but on a single conversion: not a winner yet.
    expect(verdictOf(kw(2, '"avanza bekas"', stats(ENOUGH, 1.5, 400_000_000)))).toBe('steady')
  })
})

describe('the order: first match wins', () => {
  it('no_stock beats testing, wasting and winner', () => {
    const k = kw(2, '"wuling almaz bekas"', stats(ENOUGH, ENOUGH * 0.12))
    expect(verdictOf(k, { stockCount: () => 0, appliedTestKeywords: [{ text: 'wuling almaz bekas', adGroupId: 10 }], openPauseKeywordIds: new Set([2]) })).toBe('no_stock')
  })

  it('testing beats wasting from an open pause', () => {
    expect(verdictOf(kw(2, '"wuling almaz bekas"', stats(FEW, 0)), { appliedTestKeywords: [{ text: 'wuling almaz bekas', adGroupId: 10 }], openPauseKeywordIds: new Set([2]) })).toBe('testing')
  })

  it('a test keyword that reaches n_min with no conversion is killed: wasting', () => {
    expect(verdictOf(kw(2, '"wuling almaz bekas"', stats(ENOUGH, 0)), { appliedTestKeywords: [{ text: 'wuling almaz bekas', adGroupId: 10 }] })).toBe('wasting')
  })

  it('a test keyword that reaches n_min and beats its ad group graduates: winner', () => {
    expect(verdictOf(kw(2, '"wuling almaz bekas"', stats(ENOUGH, ENOUGH * 0.12)), { appliedTestKeywords: [{ text: 'wuling almaz bekas', adGroupId: 10 }] })).toBe('winner')
  })

  it('stock in hand (or no vehicle named) never reads no_stock', () => {
    expect(verdictOf(kw(2, '"avanza bekas"', stats(ENOUGH, ENOUGH * 0.12)), { stockCount: () => 3 })).toBe('winner')
    expect(verdictOf(kw(2, '"mobil bekas murah"', stats(ENOUGH, 0)), { stockCount: () => null })).toBe('wasting')
  })
})

describe('never wrong on', () => {
  it('a winner’s numbers with an open pause suggestion: wasting, never winner', () => {
    expect(verdictOf(kw(2, '"avanza bekas"', stats(ENOUGH, ENOUGH * 0.12)), { openPauseKeywordIds: new Set([2]) })).toBe('wasting')
  })

  it('a keyword with no spend: needs_data, even with zero stock', () => {
    expect(verdictOf(kw(2, '"bmw 320i bekas"', stats(0, 0)), { stockCount: () => 0 })).toBe('needs_data')
    expect(verdictOf(kw(2, '"avanza bekas"', stats(0, 0)))).toBe('needs_data')
  })
})

describe('paused keywords (contract 3.2)', () => {
  it('never reads winner: a paused keyword with a winner’s numbers is steady', () => {
    expect(pausedVerdict(kw(3, '"avanza bekas"', stats(ENOUGH, ENOUGH * 0.12)))).toBe('steady')
  })

  it('never reads wasting: zero conversions past n_min, or an open pause, is steady', () => {
    expect(pausedVerdict(kw(3, '"mobil bekas tua"', stats(ENOUGH, 0)))).toBe('steady')
    expect(pausedVerdict(kw(3, '"mobil bekas tua"', stats(FEW, 0)), { openPauseKeywordIds: new Set([3]) })).toBe('steady')
  })

  it('still reads no_stock when it spent in the window and there are no cars', () => {
    expect(pausedVerdict(kw(3, '"bmw 320i bekas"', stats(ENOUGH, 0)), { stockCount: (id) => (id === 3 ? 0 : null) })).toBe('no_stock')
  })

  it('reads needs_data below n_min, including a paused keyword with no activity', () => {
    expect(pausedVerdict(kw(3, '"avanza bekas"', stats(FEW, FEW * 0.3)))).toBe('needs_data')
    expect(pausedVerdict(kw(3, '"avanza bekas"', stats(0, 0)))).toBe('needs_data')
  })

  it('is judged against its ad group’s enabled keywords, and gets no verdict it would not as enabled', () => {
    // Same numbers, enabled: steady → paused: steady; enabled: needs_data → paused: needs_data.
    expect(verdictOf(kw(2, '"avanza bekas"', stats(ENOUGH, ENOUGH * 0.04)))).toBe('steady')
    expect(pausedVerdict(kw(3, '"avanza bekas"', stats(ENOUGH, ENOUGH * 0.04)))).toBe('steady')
  })
})

describe('an enabled keyword with no activity in the window', () => {
  it('reads needs_data, or testing when it is an applied test keyword', () => {
    expect(verdictOf(kw(2, '"agya bekas"', stats(0, 0)))).toBe('needs_data')
    expect(verdictOf(kw(2, '"wuling almaz bekas"', stats(0, 0)), { appliedTestKeywords: [{ text: 'wuling almaz bekas', adGroupId: 10 }] })).toBe('testing')
  })
})
