// Creates the schema on the hosted Postgres DB from db/schema.sql. Safe
// to re-run — every statement is IF NOT EXISTS, and the Time Machine seed
// below only ever writes once (guarded by demo_state_overrides being empty).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { DATABASE_URL, REPO_ROOT, DATA_SOURCE } from '../src/platform/config.js'
import { query } from '../src/data/db.js'
import * as timeMachine from '../src/data/demo/timeMachine.js'
import type { State } from '../src/data/demo/markov.js'

const SEED_DAYS = 14
const STATE_WEIGHTS: [State, number][] = [
  ['standstill', 0.5],
  ['good', 0.25],
  ['bad', 0.15],
  ['volatile', 0.1],
]

function pickWeightedState(): State {
  const r = Math.random()
  let cumulative = 0
  for (const [state, weight] of STATE_WEIGHTS) {
    cumulative += weight
    if (r < cumulative) return state
  }
  return STATE_WEIGHTS[STATE_WEIGHTS.length - 1][0]
}

/** Pre-populates demo_state_overrides with a random 14-day timeline
 * starting tomorrow, so opening the Time Machine page means editing an
 * existing pinned story instead of starting from a blank calendar. Only
 * runs once — if any override already exists (from this seed or from a
 * user editing it via the Time Machine page), it's left untouched. */
async function seedTimeMachineTimeline(): Promise<void> {
  if (DATA_SOURCE !== 'demo') return
  const [{ count }] = await query<{ count: number }>('SELECT COUNT(*) AS count FROM demo_state_overrides')
  if (count > 0) {
    console.log('demo_state_overrides already has rows — leaving the existing timeline as-is')
    return
  }
  const today = new Date()
  for (let i = 1; i <= SEED_DAYS; i++) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    await timeMachine.setOverride(dateStr, pickWeightedState())
  }
  console.log(`Seeded a ${SEED_DAYS}-day random Time Machine timeline starting tomorrow`)
}

async function main() {
  if (!DATABASE_URL) throw new Error('PITSTOP_DB_STRING not set — add it to .env')
  const schemaSql = readFileSync(join(REPO_ROOT, 'db', 'schema.sql'), 'utf-8')
  const client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    await client.query(schemaSql)
    console.log('Initialized schema on hosted Postgres DB')
  } finally {
    await client.end()
  }

  await seedTimeMachineTimeline()
}

main()
