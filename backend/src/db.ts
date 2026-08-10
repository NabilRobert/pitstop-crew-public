// Postgres connection layer (Sumopod/Sumobase-hosted).
//
// The connection string uses port 6432 — PgBouncer's standard port, not
// Postgres's native 5432 — meaning this DB sits behind a connection pooler.
// The Python version of this backend had to disable psycopg's server-side
// prepared statements (prepare_threshold=None) because PgBouncer's
// transaction pooling doesn't support named prepared statements persisting
// across pooled connections. node-postgres (`pg`) doesn't name/cache
// prepared statements by default for plain query() calls, so this should
// be safe without extra config — verified against the real DB below.

import pg from 'pg'
import { DATABASE_URL } from './config.js'

// pg's default type parser turns a DATE column into a JS Date object at
// *local* midnight, then round-tripping it through .toISOString() converts
// to UTC — which shifts the calendar date by a day whenever the local
// timezone is ahead of UTC (confirmed: this box is WIB/UTC+7, and a
// stored 2026-09-09 came back as 2026-09-08). There's no timezone concept
// that should apply to a plain calendar date here, so return the raw
// 'YYYY-MM-DD' string pg receives from the wire instead of letting it
// become a Date at all. OID 1082 = date.
pg.types.setTypeParser(1082, (val: string) => val)

// pg also returns BIGINT columns (cost_micros, cost_usd_micros — widened
// from INTEGER during the Postgres migration, see schema.sql) as strings,
// not numbers, since BIGINT can exceed JS's safe integer range. This app's
// actual values never come close to that range (tens of billions at most,
// vs. Number.MAX_SAFE_INTEGER ~9x10^15), so the safety net isn't needed
// here and was actively harmful: the frontend's `total += row.cost_micros`
// silently became string concatenation instead of addition, producing
// nonsense figures (garbled digit strings, "Rp∞"). OID 20 = int8/bigint.
pg.types.setTypeParser(20, (val: string) => Number(val))

// Same bug, different trigger: SUM(bigint_column) returns NUMERIC (not
// BIGINT), which pg also stringifies by default for the same
// arbitrary-precision-safety reason — surfaced by the new
// getSegmentBreakdown() aggregate query (SUM(cost_micros) came back as
// "26688000000", a string). Same justification as OID 20 above: this
// app's values never approach JS's safe integer range. OID 1700 = numeric.
pg.types.setTypeParser(1700, (val: string) => Number(val))

let pool: pg.Pool | null = null

function getPool(): pg.Pool {
  if (!DATABASE_URL) throw new Error('PITSTOP_DB_STRING not set — add it to .env')
  if (!pool) pool = new pg.Pool({ connectionString: DATABASE_URL })
  return pool
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(text, params)
  return result.rows
}

export async function queryOne<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

/** For multi-statement operations that must commit atomically together
 * (e.g. Damon upserting a whole day's campaign + segment rows). */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
