// Per-run logging over pipeline_runs — backs the system health page and
// the dead-man's-switch heartbeat check (PROJECT.md → Automation).

import { query, queryOne } from '../data/db.js'

export const VALID_RUN_TYPES = ['daily', 'weekly', 'weekly_feedback', 'backup'] as const
export type RunType = (typeof VALID_RUN_TYPES)[number]

export async function startRun(runType: RunType): Promise<number> {
  if (!VALID_RUN_TYPES.includes(runType)) {
    throw new Error(`run_type must be one of ${VALID_RUN_TYPES.join(', ')}, got ${runType}`)
  }
  const rows = await query<{ id: number }>(
    "INSERT INTO pipeline_runs (run_type, started_at, status) VALUES ($1, $2, 'success') RETURNING id",
    [runType, new Date()]
  )
  return rows[0].id
}

export async function finishRun(
  runId: number,
  status: 'success' | 'failure' | 'partial' = 'success',
  costUsdMicros: number | null = null,
  errorMessage: string | null = null
): Promise<void> {
  await query(
    `UPDATE pipeline_runs
     SET finished_at = $1, status = $2, cost_usd_micros = $3, error_message = $4
     WHERE id = $5`,
    [new Date(), status, costUsdMicros, errorMessage, runId]
  )
}

/** Usage:
 *   const handle = { costUsdMicros: null as number | null }
 *   await trackRun('daily', async () => { ...pipeline work...; handle.costUsdMicros = 12_000 }, handle)
 * On success, marks 'success'. On any exception, marks 'failure' with the
 * exception message and re-raises — this never swallows errors, it only
 * makes sure they get logged before propagating (per PROJECT.md's
 * failure-alerting principle: surfaced, never silently skipped). */
export async function trackRun<T>(
  runType: RunType,
  fn: (handle: { costUsdMicros: number | null; runId: number }) => Promise<T>
): Promise<T> {
  const runId = await startRun(runType)
  const handle = { costUsdMicros: null as number | null, runId }
  try {
    const result = await fn(handle)
    await finishRun(runId, 'success', handle.costUsdMicros)
    return result
  } catch (err) {
    await finishRun(runId, 'failure', null, String(err instanceof Error ? err.message : err))
    throw err
  }
}

export async function getLastSuccessfulRun(runType: RunType) {
  // finished_at IS NOT NULL matters: startRun() inserts status='success' as
  // a placeholder before any work happens (see startRun below), so without
  // this guard a still-in-progress run can match "last successful run"
  // while it's actually mid-flight. Narrow window (a run takes minutes),
  // but a real correctness gap, so guarded rather than left as a footgun.
  return queryOne(
    `SELECT * FROM pipeline_runs WHERE run_type = $1 AND status = 'success' AND finished_at IS NOT NULL
     ORDER BY finished_at DESC LIMIT 1`,
    [runType]
  )
}

export async function getRecentRuns(runType?: RunType, limit = 20) {
  if (runType) {
    return query('SELECT * FROM pipeline_runs WHERE run_type = $1 ORDER BY started_at DESC LIMIT $2', [
      runType,
      limit,
    ])
  }
  return query('SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT $1', [limit])
}
