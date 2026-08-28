// Time Machine: pin a Markov state for a future date. See docs/PROJECT.md →
// "Time Machine" — jumping forward silently fast-forwards the chain
// through skipped days (generator.generateDay already does this), this
// module just persists the pin so it survives across runs and feeds every
// future call.

import { query } from '../db.js'
import { STATES, nextState, resolveStateSequence, type State } from './markov.js'
import { START_DATE } from './profile.js'

export async function setOverride(targetDate: string, forcedState: string): Promise<void> {
  if (!STATES.includes(forcedState as State)) {
    throw new Error(`forced_state must be one of ${STATES.join(', ')}, got ${forcedState}`)
  }
  await query(
    `INSERT INTO demo_state_overrides (date, forced_state) VALUES ($1, $2)
     ON CONFLICT(date) DO UPDATE SET forced_state = excluded.forced_state, set_at = CURRENT_TIMESTAMP`,
    [targetDate, forcedState]
  )
}

export async function getOverrides(): Promise<Map<string, State>> {
  // db.ts overrides pg's date type parser to return raw 'YYYY-MM-DD'
  // strings (see db.ts for why) — no Date-object timezone math needed here.
  const rows = await query<{ date: string; forced_state: State }>(
    'SELECT date, forced_state FROM demo_state_overrides'
  )
  const map = new Map<string, State>()
  for (const r of rows) map.set(r.date, r.forced_state)
  return map
}

export async function clearOverride(targetDate: string): Promise<void> {
  await query('DELETE FROM demo_state_overrides WHERE date = $1', [targetDate])
}

// How many days ahead of "today" the override table should stay populated.
// A few days to a couple weeks are both reasonable; a week gives a visible
// planning buffer without needing the cron to add rows too aggressively.
export const TIME_MACHINE_BUFFER_DAYS = 7

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Keeps demo_state_overrides populated TIME_MACHINE_BUFFER_DAYS ahead of
 * `today`, so the Time Machine page's "Active Overrides" list never runs
 * dry — once manually-pinned days are exhausted, this keeps extending the
 * plannable buffer instead of silently falling back to invisible
 * randomness (resolveStateSequence() already handles unpinned days fine,
 * this is purely about keeping the *visible* list populated).
 *
 * New days are filled via the same seeded Markov transition
 * resolveStateSequence() would've produced anyway — so this doesn't change
 * what data gets generated, it just materializes and persists it as a
 * regular override row a few days earlier than it would otherwise appear.
 * Idempotent / cheap to call on every cron tick: no-ops once the buffer is
 * already full. Returns the number of days added. */
export async function ensureFutureOverrides(today: string, seed = 0): Promise<number> {
  const overrides = await getOverrides()
  const target = addDays(today, TIME_MACHINE_BUFFER_DAYS)

  const existingDates = [...overrides.keys()]
  const furthest = existingDates.length > 0 ? existingDates.reduce((a, b) => (a > b ? a : b)) : addDays(today, -1)
  if (furthest >= target) return 0

  const seqEnd = furthest >= START_DATE ? furthest : START_DATE
  const priorStates = resolveStateSequence(START_DATE, seqEnd, seed, overrides)
  let current: State = priorStates.get(seqEnd) ?? 'standstill'

  let added = 0
  for (let day = addDays(furthest, 1); day <= target; day = addDays(day, 1)) {
    current = nextState(current, seed, day)
    await setOverride(day, current)
    added++
  }
  return added
}
