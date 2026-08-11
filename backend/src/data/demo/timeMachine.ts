// Time Machine: pin a Markov state for a future date. See PROJECT.md →
// "Time Machine" — jumping forward silently fast-forwards the chain
// through skipped days (generator.generateDay already does this), this
// module just persists the pin so it survives across runs and feeds every
// future call.

import { query } from '../db.js'
import { STATES, type State } from './markov.js'

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
