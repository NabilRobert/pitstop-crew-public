// Unit test for the pure spend-ceiling decision logic. checkSpendCeiling()
// and startRun() itself aren't tested here — they need a live DB (reading
// settings, summing pipeline_runs) — but the actual comparison they depend
// on is a plain, easily-testable function.

import { describe, it, expect } from 'vitest'
import { exceedsSpendCeiling } from './pipelineRuns.js'

describe('exceedsSpendCeiling', () => {
  it('never exceeds when the cap is disabled (null)', () => {
    expect(exceedsSpendCeiling(0, null)).toBe(false)
    expect(exceedsSpendCeiling(1_000_000, null)).toBe(false)
  })

  it('does not exceed while strictly under the cap', () => {
    expect(exceedsSpendCeiling(19.99, 20)).toBe(false)
  })

  it('exceeds once spend reaches the cap exactly', () => {
    expect(exceedsSpendCeiling(20, 20)).toBe(true)
  })

  it('exceeds once spend goes past the cap', () => {
    expect(exceedsSpendCeiling(25, 20)).toBe(true)
  })

  it('handles zero month-to-date spend against a real cap', () => {
    expect(exceedsSpendCeiling(0, 20)).toBe(false)
  })
})
