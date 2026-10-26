// v3 step 6 — the engine against the real generated demo account: a
// one-seed regression check of what scripts/scoreOptimizer.ts measures
// across seeds (docs/overhaul-v3-backend.md section 12). Every plant found
// at the horizon, no decoy or legitimate buyer term flagged.

import { describe, it, expect, beforeAll } from 'vitest'
import { generateDay, type DayData } from '../data/demo/generator.js'
import { START_DATE } from '../data/demo/profile.js'
import { addDays, runEngine, type EngineInput, type EngineResult } from './engine.js'
import { buildDemoEngineInput, scoreAgainstGroundTruth, type Score } from './harness.js'

const HORIZON = 126 // 2026-10-05, as in generator.test.ts
let days: DayData[]
let input: EngineInput
let result: EngineResult
let score: Score

beforeAll(() => {
  days = Array.from({ length: HORIZON + 1 }, (_, i) => generateDay(addDays(START_DATE, i), 0))
  input = buildDemoEngineInput(days, addDays(START_DATE, HORIZON))
  result = runEngine(input)
  score = scoreAgainstGroundTruth([...result.candidates, ...result.capped], input)
})

describe('engine on the demo account (seed 0)', () => {
  it('finds every planted problem with the expected suggestion type', () => {
    const missed = score.rows.filter((r) => r.row.expected !== null && !r.found).map((r) => r.row.id)
    expect(missed).toEqual([])
  })

  it('flags no decoy and turns no legitimate credit / trade-in term into a negative', () => {
    expect(score.rows.filter((r) => r.falsePositive).map((r) => r.row.id)).toEqual([])
  })

  it('says "not enough data" for the low-volume zero-conversion terms instead of guessing', () => {
    expect(result.notEnoughData).toBeGreaterThanOrEqual(8) // at least the 8 decoys
  })

  it('takes every number in a candidate from the input window', () => {
    for (const c of result.candidates) {
      expect(c.evidence.window_start).toBe(input.windowStart)
      expect(c.evidence.window_end).toBe(input.windowEnd)
      if (c.basis === 'prior' && c.type !== 'negative_keyword') expect(c.evidence.clicks).toBeNull()
    }
    expect(new Set(result.candidates.map((c) => c.fingerprint)).size).toBe(result.candidates.length)
  })

  it('degrades without the inventory: no stock-based pause, bid or new-keyword suggestions, the rest unchanged', () => {
    const offline = runEngine(buildDemoEngineInput(days, addDays(START_DATE, HORIZON), { inventory: 'unavailable' }))
    expect(offline.inventoryAvailable).toBe(false)
    expect(offline.candidates.some((c) => c.type === 'raise_bid_candidate' || c.type === 'new_keyword')).toBe(false)
    expect(offline.candidates.some((c) => c.type === 'pause_keyword' && (c.evidence.rules as string[]).includes('pause.no_stock'))).toBe(false)
    const negatives = (r: EngineResult) => r.candidates.filter((c) => c.type === 'negative_keyword').map((c) => c.fingerprint).sort()
    expect(negatives(offline)).toEqual(negatives(result))
  })
})
