// The "zero conversions" significance rule (docs/overhaul-v3-backend.md
// section 11.1). With a baseline conversion rate p0, the chance of n
// clicks in a row without a conversion is (1 − p0)^n; once that drops
// below p (default 0.05), zero conversions is evidence of waste rather
// than bad luck. Below n_min clicks the honest answer is "not enough
// data", never a negative keyword.

// Floor for p0 so a near-zero baseline rate can't push n_min to infinity.
export const MIN_BASELINE_RATE = 0.005

export function nMin(baselineRate: number, p = 0.05): number {
  const p0 = Math.min(Math.max(baselineRate, MIN_BASELINE_RATE), 0.999)
  return Math.ceil(Math.log(p) / Math.log(1 - p0))
}
