import { describe, it, expect } from 'vitest'
import { nMin, MIN_BASELINE_RATE } from './significance.js'

describe('nMin', () => {
  it('matches the worked example: ~37 clicks at the demo baseline (p0 ≈ 7.9%)', () => {
    expect(nMin(0.079)).toBe(37)
  })

  it('is the smallest n with (1 − p0)^n ≤ p — the "not enough data" boundary', () => {
    for (const p0 of [0.02, 0.05, 0.079, 0.15, 0.3]) {
      const n = nMin(p0)
      expect((1 - p0) ** n).toBeLessThanOrEqual(0.05)
      expect((1 - p0) ** (n - 1)).toBeGreaterThan(0.05)
    }
  })

  it('needs more clicks for a stricter p', () => {
    expect(nMin(0.079, 0.01)).toBeGreaterThan(nMin(0.079, 0.05))
  })

  it('floors the baseline so a zero rate gives a large but finite threshold', () => {
    expect(nMin(0)).toBe(nMin(MIN_BASELINE_RATE))
    expect(Number.isFinite(nMin(0))).toBe(true)
  })
})
