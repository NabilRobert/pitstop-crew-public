// Markov chain for demo-mode daily state — see PROJECT.md → Generation
// algorithm. 4 states, biased toward persistence so streaks/momentum
// emerge naturally. Not exported directly; use resolveStateSequence() to
// walk the chain.

import { createHash } from 'node:crypto'

export const STATES = ['good', 'bad', 'standstill', 'volatile'] as const
export type State = (typeof STATES)[number]

// rows = "from" state, cols = "to" state. Diagonal-heavy = persistence.
const TRANSITIONS: Record<State, Record<State, number>> = {
  good: { good: 0.5, bad: 0.15, standstill: 0.25, volatile: 0.1 },
  bad: { good: 0.15, bad: 0.5, standstill: 0.25, volatile: 0.1 },
  standstill: { good: 0.2, bad: 0.2, standstill: 0.5, volatile: 0.1 },
  volatile: { good: 0.2, bad: 0.2, standstill: 0.2, volatile: 0.4 },
}

/** Deterministic seed from arbitrary parts. JS has no built-in seedable
 * random and no equivalent to Python's random.Random(seed), so this
 * derives a stable 32-bit integer seed via SHA-256, used below to drive a
 * small seeded PRNG (mulberry32) — same idea as the Python version's
 * stable_seed(), just a different underlying generator. Determinism is
 * *within* this TS implementation, not bit-for-bit identical to the
 * Python version for the same seed/date — doesn't matter since nothing
 * reads across languages, only already-stored demo data matters, and
 * that's untouched by this rewrite. */
export function stableSeed(...parts: (string | number)[]): number {
  const digest = createHash('sha256').update(parts.join('|')).digest('hex')
  return parseInt(digest.slice(0, 8), 16)
}

/** mulberry32 — small, fast, decent-quality seeded PRNG. Returns a
 * function producing floats in [0, 1), mirroring Python's random.random(). */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function uniform(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min)
}

function dayRng(seed: number, day: string): () => number {
  return seededRandom(stableSeed(seed, day))
}

export function nextState(prevState: State, seed: number, day: string): State {
  const rand = dayRng(seed, day)
  const row = TRANSITIONS[prevState]
  const r = rand()
  let cumulative = 0
  for (const state of STATES) {
    cumulative += row[state]
    if (r <= cumulative) return state
  }
  return STATES[STATES.length - 1] // floating-point fallback
}

/** Walk the chain from startDate to endDate inclusive, honoring any forced
 * states in `overrides` (dateStr -> state). Cheap — pure arithmetic, no
 * I/O — this is what makes Time Machine fast-forwarding "free". Returns a
 * Map<dateStr, State> for every day in the range. */
export function resolveStateSequence(
  startDate: string,
  endDate: string,
  seed: number,
  overrides: Map<string, State>
): Map<string, State> {
  const states = new Map<string, State>()
  let current: State = 'standstill' // arbitrary, deterministic starting point
  let day = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')
  while (day <= end) {
    const dayStr = day.toISOString().slice(0, 10)
    current = overrides.get(dayStr) ?? nextState(current, seed, dayStr)
    states.set(dayStr, current)
    day = new Date(day.getTime() + 86_400_000)
  }
  return states
}
