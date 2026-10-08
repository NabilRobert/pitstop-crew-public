// Per-run logging over pipeline_runs — backs the system health page and
// the dead-man's-switch heartbeat check (docs/PROJECT.md → Automation).

import { query, queryOne } from '../data/db.js'
import { createUsageTracker, priceUsage, type UsageByModel } from '../platform/llmUsage.js'
import { traceRun } from '../platform/trace.js'
import { redactSecrets } from '../platform/redact.js'
import { getSettings } from '../platform/settings.js'

export const VALID_RUN_TYPES = ['daily', 'weekly', 'weekly_feedback', 'backup', 'keyword_optimizer'] as const
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

/** Pure — testable in isolation. `capUsd: null` means the cap is disabled
 * (never exceeds); everything else is a plain `>=` comparison. Separated
 * from the DB-querying checkSpendCeiling() below so the actual decision
 * logic doesn't need a live database to test. */
export function exceedsSpendCeiling(monthToDateCostUsd: number, capUsd: number | null): boolean {
  return capUsd !== null && monthToDateCostUsd >= capUsd
}

/** Thrown by startRun() when the monthly spend ceiling (Settings page,
 * monthly_cost_cap_usd) has been reached — mirrors PipelineRunInProgressError's
 * shape. Carries the numbers so a caller can build its own message without a
 * second query. */
export class SpendCeilingExceededError extends Error {
  constructor(
    public readonly capUsd: number,
    public readonly monthToDateUsd: number
  ) {
    super(`Monthly spend cap of $${capUsd.toFixed(2)} reached (month to date: $${monthToDateUsd.toFixed(2)})`)
    this.name = 'SpendCeilingExceededError'
  }
}

/** Sums cost_usd_micros for every run started this calendar month (server
 * time — same convention as every other date-based check here) and compares
 * against the configured cap. A run with no recorded cost (no price
 * configured for the model it used) contributes 0 via SUM's normal NULL
 * handling — this can't protect against spend that genuinely has no price
 * configured, only against spend that's actually being tracked. */
async function checkSpendCeiling(): Promise<void> {
  const { monthly_cost_cap_usd } = await getSettings()
  if (monthly_cost_cap_usd === '') return // disabled
  const capUsd = Number(monthly_cost_cap_usd)
  const rows = await query<{ total_micros: number | null }>(
    `SELECT COALESCE(SUM(cost_usd_micros), 0) AS total_micros FROM pipeline_runs WHERE started_at >= date_trunc('month', now())`
  )
  // OID 20 (BIGINT) is globally parsed to Number in data/db.ts, not left as
  // a string — this SELECT's result is already a number.
  const monthToDateUsd = (rows[0]?.total_micros ?? 0) / 1e6
  if (exceedsSpendCeiling(monthToDateUsd, capUsd)) {
    throw new SpendCeilingExceededError(capUsd, monthToDateUsd)
  }
}

export async function startRun(runType: RunType): Promise<number> {
  if (!VALID_RUN_TYPES.includes(runType)) {
    throw new Error(`run_type must be one of ${VALID_RUN_TYPES.join(', ')}, got ${runType}`)
  }
  // Checked before the insert, not after — the same single choke point
  // already shared by both the cron script and the manual trigger, so one
  // check covers both paths with no duplicated logic. Backups don't call
  // any model (they're a pg_dump), cost nothing, and aren't what the cap is
  // protecting against — exempting them means a maxed-out cap can't also
  // silently stop backups from running for the rest of the month.
  if (runType !== 'backup') await checkSpendCeiling()
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
  errorMessage: string | null = null,
  llmUsage: unknown = null
): Promise<void> {
  await query(
    `UPDATE pipeline_runs
     SET finished_at = $1, status = $2, cost_usd_micros = $3, error_message = $4, llm_usage = $5
     WHERE id = $6`,
    // error_message is redacted here, at write time: a provider error can echo a
    // key or connection string, and this column is shown on the run list.
    // Serialized explicitly, same reasoning as ads.headlines in damon.ts —
    // don't rely on pg's implicit object->jsonb coercion.
    [new Date(), status, costUsdMicros, errorMessage == null ? null : redactSecrets(errorMessage), llmUsage == null ? null : JSON.stringify(llmUsage), runId]
  )
}

/** Turns a tracker's raw usage into what finishRun stores: per-model token
 * counts (+ per-model cost where a rate exists) and the run total. Both are
 * null when the run made no LLM calls (e.g. backup). */
function summarizeUsage(usage: UsageByModel): { llmUsage: unknown; costUsdMicros: number | null } {
  if (Object.keys(usage).length === 0) return { llmUsage: null, costUsdMicros: null }
  const priced = priceUsage(usage)
  return { llmUsage: priced.models, costUsdMicros: priced.totalUsdMicros }
}

/** Usage:
 *   const handle = { costUsdMicros: null as number | null }
 *   await trackRun('daily', async () => { ...pipeline work...; handle.costUsdMicros = 12_000 }, handle)
 * On success, marks 'success' — or 'partial' when fn set handle.partial to
 * why (the run finished, but a step degraded: e.g. the keyword optimizer
 * stored its suggestions but the model step that ranks them was
 * unavailable). The reason is stored as error_message. On any exception, marks 'failure' with the
 * exception message and re-raises — this never swallows errors, it only
 * makes sure they get logged before propagating (per docs/PROJECT.md's
 * failure-alerting principle: surfaced, never silently skipped). */
export async function trackRun<T>(
  runType: RunType,
  fn: (handle: { costUsdMicros: number | null; runId: number; partial: string | null; notes: string[] }) => Promise<T>,
  existingRunId?: number
): Promise<T> {
  const runId = existingRunId ?? (await startRun(runType))
  // notes: what the run wants said in its summary (the trace root the Run
  // Inspector shows), e.g. "no changes since the last run" (3.5).
  const handle = { costUsdMicros: null as number | null, runId, partial: null as string | null, notes: [] as string[] }
  // Every complete()/completeJson() call made inside fn (however deep) is
  // attributed to this run — see platform/llmUsage.ts.
  const tracker = createUsageTracker()
  try {
    // The run's trace root (platform/trace.ts): everything fn does nests under
    // it, and it carries the run's total tokens and cost however fn ends.
    const result = await tracker.run(() =>
      traceRun(runId, `${runType} run`, { run_type: runType }, async (root) => {
        try {
          return await fn(handle)
        } finally {
          let tokensIn = 0
          let tokensOut = 0
          let calls = 0
          for (const u of Object.values(tracker.usage)) {
            tokensIn += u.input_tokens
            tokensOut += u.output_tokens
            calls += u.calls
          }
          const { costUsdMicros } = summarizeUsage(tracker.usage)
          root.set({
            tokensIn,
            tokensOut,
            costUsd: costUsdMicros == null ? null : costUsdMicros / 1e6,
            summary: `${handle.notes.map((n) => `${n}. `).join('')}${runType} run: ${calls} LLM call${calls === 1 ? '' : 's'}, ${tokensIn} tokens in / ${tokensOut} out`,
          })
        }
      })
    )
    const { llmUsage, costUsdMicros } = summarizeUsage(tracker.usage)
    // An explicit handle.costUsdMicros set by fn still wins over the computed one.
    await finishRun(runId, handle.partial === null ? 'success' : 'partial', handle.costUsdMicros ?? costUsdMicros, handle.partial, llmUsage)
    return result
  } catch (err) {
    // Calls made before the failure were still billed — keep their usage.
    const { llmUsage, costUsdMicros } = summarizeUsage(tracker.usage)
    await finishRun(runId, 'failure', costUsdMicros, String(err instanceof Error ? err.message : err), llmUsage)
    // Lets a caller that only has the error (the cron script's failure alert)
    // attach its follow-up work to this run's trace.
    if (err && typeof err === 'object') Object.defineProperty(err, 'pipelineRunId', { value: runId, configurable: true })
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

/** Like getLastSuccessfulRun, but a 'partial' run counts too: it finished,
 * one step degraded. Used where re-running would repeat the same degraded
 * step on every cron tick (the keyword optimizer when Kai is unreachable). */
export async function getLastCompletedRun(runType: RunType) {
  return queryOne(
    `SELECT * FROM pipeline_runs WHERE run_type = $1 AND status IN ('success', 'partial') AND finished_at IS NOT NULL
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

/** Minutes a row may stay status='running' before it is treated as orphaned. A
 * real run takes a few minutes; this is far above that and still frees the
 * one-running-run index within half an hour of a genuine crash. */
const ORPHAN_AFTER_MINUTES = 30

/** Called at process boot (src/api/main.ts) and on every cron tick
 * (scripts/runDaily.ts). A row is left status='running' forever if the
 * process holding it crashes or is killed mid-run (no finally-block runs in
 * that case) — and since the partial unique index allows only one 'running'
 * row at a time, an orphan like that would otherwise permanently wedge every
 * future run behind a 409 that can never clear itself.
 *
 * Only rows that started more than ORPHAN_AFTER_MINUTES ago are failed. The
 * cron tick and the API server are separate processes and neither can tell
 * "the other process crashed" from "its run is still in flight", so a newer
 * running row is left alone (and logged) — otherwise a manual "Generate report
 * now" that a cron tick happens to land in the middle of would be marked failed
 * while still running. Cost: after a crash or restart mid-run, the orphan blocks
 * new runs until it is 30 minutes old. Says what it did in the log. Returns the
 * number of rows it failed. */
export async function reconcileOrphanedRuns(): Promise<number> {
  const failed = await query<{ id: number; run_type: string; minutes: number }>(
    `UPDATE pipeline_runs
     SET status = 'failure',
         finished_at = $1,
         error_message = 'Orphaned run reconciled — still marked running more than ' || $2::int || ' minutes after it started; the process holding it likely crashed or was restarted mid-run'
     WHERE status = 'running' AND started_at < NOW() - ($2::int * INTERVAL '1 minute')
     RETURNING id, run_type, ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60)::int AS minutes`,
    [new Date(), ORPHAN_AFTER_MINUTES]
  )
  for (const r of failed) {
    console.log(`reconcileOrphanedRuns: marked ${r.run_type} run #${r.id} failed (running for ${r.minutes} min, limit ${ORPHAN_AFTER_MINUTES})`)
  }
  const live = await query<{ id: number; run_type: string; minutes: number }>(
    `SELECT id, run_type, ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60)::int AS minutes
     FROM pipeline_runs WHERE status = 'running'`
  )
  for (const r of live) {
    console.log(`reconcileOrphanedRuns: left ${r.run_type} run #${r.id} alone (running for ${r.minutes} min, under the ${ORPHAN_AFTER_MINUTES}-min limit)`)
  }
  return failed.length
}
