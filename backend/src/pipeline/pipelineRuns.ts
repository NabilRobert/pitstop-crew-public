// Per-run logging over pipeline_runs — backs the system health page and
// the dead-man's-switch heartbeat check (docs/PROJECT.md → Automation).

import { query, queryOne } from '../data/db.js'

export const VALID_RUN_TYPES = ['daily', 'weekly', 'weekly_feedback', 'backup'] as const
export type RunType = (typeof VALID_RUN_TYPES)[number]

/** Thrown by startRun() when another run is already in flight — the
 * idx_pipeline_runs_one_running partial unique index (db/schema.sql)
 * enforces this at the DB level, so it holds across processes (the API
 * server and the cron script, scripts/runDaily.ts, both hit this DB). */
export class PipelineRunInProgressError extends Error {
  constructor() {
    super('A pipeline run is already in progress')
    this.name = 'PipelineRunInProgressError'
  }
}

export async function startRun(runType: RunType): Promise<number> {
  if (!VALID_RUN_TYPES.includes(runType)) {
    throw new Error(`run_type must be one of ${VALID_RUN_TYPES.join(', ')}, got ${runType}`)
  }
  try {
    const rows = await query<{ id: number }>(
      "INSERT INTO pipeline_runs (run_type, started_at, status) VALUES ($1, $2, 'running') RETURNING id",
      [runType, new Date()]
    )
    return rows[0].id
  } catch (err) {
    // 23505 = unique_violation — idx_pipeline_runs_one_running rejected this
    // insert because another row is already 'running'. pg surfaces the
    // SQLSTATE as `.code` on the thrown error, not as a distinguishable class.
    if (err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === '23505') {
      throw new PipelineRunInProgressError()
    }
    throw err
  }
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
 * makes sure they get logged before propagating (per docs/PROJECT.md's
 * failure-alerting principle: surfaced, never silently skipped). */
export async function trackRun<T>(
  runType: RunType,
  fn: (handle: { costUsdMicros: number | null; runId: number }) => Promise<T>,
  existingRunId?: number
): Promise<T> {
  const runId = existingRunId ?? (await startRun(runType))
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
  // finished_at IS NOT NULL is defense-in-depth now, not the only guard: a
  // still-in-progress row is status='running' (see startRun above), which
  // can never match status='success' at all. Kept anyway as cheap insurance
  // against any future writer that sets 'success' before 'finished_at'.
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

export async function getRunById(id: number) {
  return queryOne('SELECT * FROM pipeline_runs WHERE id = $1', [id])
}

/** Called once at process boot (see src/api/main.ts and scripts/runDaily.ts).
 * A row is left status='running' forever if the process holding it crashes
 * or is killed mid-run (no finally-block runs in that case) — and since the
 * partial unique index allows only one 'running' row at a time, an orphan
 * like that would otherwise permanently wedge every future run behind a 409
 * that can never clear itself. Marks any such row 'failure' with an
 * explanatory message so the index frees up and system-health/getRecentRuns
 * reporting reflects reality instead of a silently-stuck run.
 *
 * This is best-effort cleanup, not a distributed lock — it can't distinguish
 * "the previous process actually crashed" from "this run is still genuinely
 * in flight in another still-alive process." In practice that's a
 * negligible risk: both the API server and the cron script run this at
 * their own boot, and a live run holds its row for minutes, not the seconds
 * between reconcile-at-boot and lock-acquisition. Safe to call on every
 * boot even when nothing is orphaned (affects 0 rows). */
export async function reconcileOrphanedRuns(): Promise<number> {
  const rows = await query<{ id: number }>(
    `UPDATE pipeline_runs
     SET status = 'failure',
         finished_at = $1,
         error_message = 'Orphaned run reconciled at process startup — process likely crashed or was restarted mid-run'
     WHERE status = 'running'
     RETURNING id`,
    [new Date()]
  )
  return rows.length
}
