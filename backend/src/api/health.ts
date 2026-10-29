// GET /health — what an uptime monitor probes. Every data route needs the
// database, so the API reports healthy only when the database answers a
// trivial query in time. It used to answer {status: 'ok'} unconditionally,
// which kept a monitor green while every real request was failing.
//
// This checks reachability, not content: an empty database still passes
// (deploy/demo/verify.py is what checks the demo's seed loaded).

import { query } from '../data/db.js'

/** Short enough that a monitor probing every 30s gets a prompt answer; the
 * pool's own connect timeout (10s, data/db.ts) is far too slow for that. */
export const DB_CHECK_TIMEOUT_MS = 3_000

export type HealthBody = { status: 'ok' } | { status: 'unhealthy'; database: 'unreachable' }

export interface HealthResult {
  httpStatus: 200 | 503
  body: HealthBody
}

const HEALTHY: HealthResult = { httpStatus: 200, body: { status: 'ok' } }
const DATABASE_UNREACHABLE: HealthResult = { httpStatus: 503, body: { status: 'unhealthy', database: 'unreachable' } }

/** `pingDatabase` is injectable so tests can simulate a failing or hanging
 * database without a real one. The error itself is logged, never returned:
 * /health is public, and a driver error can carry a host name or user. */
export async function checkHealth(
  pingDatabase: () => Promise<unknown> = () => query('SELECT 1'),
  timeoutMs = DB_CHECK_TIMEOUT_MS
): Promise<HealthResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs}ms`)), timeoutMs)
  })
  try {
    await Promise.race([pingDatabase(), timeout])
    return HEALTHY
  } catch (err) {
    console.error('Health check: database unreachable:', err instanceof Error ? err.message : err)
    return DATABASE_UNREACHABLE
  } finally {
    clearTimeout(timer)
  }
}
