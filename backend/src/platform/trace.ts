// Run Inspector writer: records every step of a pipeline run as a nested tree
// in trace_events (+ bulky text in trace_payloads). Nesting is automatic via
// AsyncLocalStorage, like llmUsage.ts:
//
//   run -> context | agent -> llm_call | critic_review (-> llm_call) | decision | revision (-> llm_call) | email
//
// Calls made outside a traced run (Ask, voice) find no context and are simply
// not recorded. Writing a trace event must NEVER fail or stall a run: every DB
// write is wrapped in try/catch with a timeout, and after a few consecutive
// failures tracing switches itself off for that run.

import { AsyncLocalStorage } from 'node:async_hooks'
import { query, queryOne } from '../data/db.js'
import { redactSecrets } from './redact.js'

export type TraceKind =
  | 'run'
  | 'context'
  | 'agent'
  | 'llm_call'
  | 'critic_review'
  | 'decision'
  | 'revision'
  | 'email'
  | 'error'
export type TraceStatus = 'ok' | 'error' | 'skipped'
export type PayloadRole = 'prompt' | 'response' | 'context'

export interface SpanFields {
  status?: TraceStatus
  summary?: string
  /** Merged (shallowly) into the meta the span was opened with. */
  meta?: Record<string, unknown>
  model?: string
  tokensIn?: number | null
  tokensOut?: number | null
  /** USD; null/undefined when no price is configured. */
  costUsd?: number | null
  errorMessage?: string | null
}

export interface Span {
  set(fields: SpanFields): void
  payload(role: PayloadRole, content: string): void
}

const NOOP_SPAN: Span = { set() {}, payload() {} }

const WRITE_TIMEOUT_MS = 5_000
const MAX_CONSECUTIVE_FAILURES = 3
const MAX_SUMMARY = 500
const MAX_ERROR = 2_000
const MAX_PAYLOAD = 400_000
const MAX_STACK_LINES = 15
const PAYLOAD_RETENTION_DAYS = 30

interface Shared {
  runId: number
  seq: number
  failures: number
  disabled: boolean
  reportedErrors: WeakSet<object>
}
interface Ctx {
  shared: Shared
  parentId: number | null
}

const store = new AsyncLocalStorage<Ctx>()

const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Never throws, never hangs: a trace write that fails or takes > 5s is logged
 * and dropped. Three failures in a row (e.g. the table is missing) turn tracing
 * off for the rest of the run. */
async function safely<T>(shared: Shared, what: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (shared.disabled) return undefined
  let timer: NodeJS.Timeout | undefined
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${WRITE_TIMEOUT_MS}ms`)), WRITE_TIMEOUT_MS)
      }),
    ])
    shared.failures = 0
    return result
  } catch (err) {
    shared.failures += 1
    console.error(`trace: ${what} failed (run ${shared.runId}):`, err instanceof Error ? err.message : err)
    if (shared.failures >= MAX_CONSECUTIVE_FAILURES) {
      shared.disabled = true
      console.error(`trace: too many consecutive failures — tracing disabled for run ${shared.runId}`)
    }
    return undefined
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function redactDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactSecrets(value)
  if (depth > 6 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v, depth + 1)
  return out
}

function cleanMeta(meta: Record<string, unknown> | undefined): string | null {
  if (!meta || Object.keys(meta).length === 0) return null
  try {
    return JSON.stringify(redactDeep(meta))
  } catch {
    return null
  }
}

function errorParts(err: unknown): { message: string; stack: string | null } {
  const raw = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error && err.stack ? err.stack.split('\n').slice(0, MAX_STACK_LINES).join('\n') : null
  return { message: clamp(redactSecrets(raw), MAX_ERROR), stack: stack ? redactSecrets(stack) : null }
}

interface Row {
  id: number | null
  seq: number
}

async function insertStart(ctx: Ctx, kind: TraceKind, name: string, startedAt: Date, meta: Record<string, unknown> | undefined): Promise<Row> {
  const shared = ctx.shared
  const seq = ++shared.seq
  const rows = await safely(shared, `insert ${kind} "${name}"`, () =>
    query<{ id: number }>(
      `INSERT INTO trace_events (run_id, parent_id, seq, kind, name, status, started_at, meta)
       VALUES ($1, $2, $3, $4, $5, 'ok', $6, $7) RETURNING id`,
      [shared.runId, ctx.parentId, seq, kind, clamp(redactSecrets(name), 200), startedAt, cleanMeta(meta)]
    )
  )
  return { id: rows?.[0]?.id ?? null, seq }
}

async function finishRow(ctx: Ctx, id: number, startedAt: Date, f: Required<Pick<SpanFields, 'status'>> & SpanFields, meta: Record<string, unknown> | undefined, payloads: { role: PayloadRole; content: string }[]): Promise<void> {
  const endedAt = new Date()
  await safely(ctx.shared, `finish event ${id}`, () =>
    query(
      `UPDATE trace_events
       SET status = $2, ended_at = $3, duration_ms = $4, model = $5, tokens_in = $6, tokens_out = $7,
           cost_usd = $8, summary = $9, meta = $10, error_message = $11
       WHERE id = $1`,
      [
        id,
        f.status,
        endedAt,
        Math.max(0, endedAt.getTime() - startedAt.getTime()),
        f.model ?? null,
        f.tokensIn ?? null,
        f.tokensOut ?? null,
        f.costUsd ?? null,
        f.summary ? clamp(redactSecrets(f.summary), MAX_SUMMARY) : null,
        cleanMeta(meta),
        f.errorMessage ? clamp(redactSecrets(f.errorMessage), MAX_ERROR) : null,
      ]
    )
  )
  if (payloads.length === 0) return
  await safely(ctx.shared, `payloads for event ${id}`, async () => {
    for (const p of payloads) {
      const redacted = redactSecrets(p.content)
      const content = redacted.length > MAX_PAYLOAD ? `${redacted.slice(0, MAX_PAYLOAD)}\n[truncated at ${MAX_PAYLOAD} chars]` : redacted
      await query('INSERT INTO trace_payloads (event_id, role, content) VALUES ($1, $2, $3)', [id, p.role, content])
    }
  })
}

/** Runs `fn` as a traced step nested under whatever step is currently open.
 * With no traced run in scope it just runs `fn`. Errors are recorded (span
 * status 'error', plus one 'error' event at the innermost failing step) and
 * re-thrown unchanged. */
export async function span<T>(
  kind: TraceKind,
  name: string,
  fn: (s: Span) => Promise<T>,
  meta?: Record<string, unknown>
): Promise<T> {
  const ctx = store.getStore()
  if (!ctx || ctx.shared.disabled) return fn(NOOP_SPAN)

  const startedAt = new Date()
  const row = await insertStart(ctx, kind, name, startedAt, meta)
  const childCtx: Ctx = { shared: ctx.shared, parentId: row.id ?? ctx.parentId }

  const fields: SpanFields = {}
  let mergedMeta: Record<string, unknown> | undefined = meta ? { ...meta } : undefined
  const payloads: { role: PayloadRole; content: string }[] = []
  const handle: Span = {
    set(f) {
      const { meta: m, ...rest } = f
      Object.assign(fields, rest)
      if (m) mergedMeta = { ...(mergedMeta ?? {}), ...m }
    },
    payload(role, content) {
      payloads.push({ role, content })
    },
  }

  let status: TraceStatus | null = null
  let errorMessage: string | null = null
  try {
    return await store.run(childCtx, () => fn(handle))
  } catch (err) {
    status = 'error'
    const { message, stack } = errorParts(err)
    errorMessage = message
    if (typeof err === 'object' && err !== null && !ctx.shared.reportedErrors.has(err)) {
      ctx.shared.reportedErrors.add(err)
      await store.run(childCtx, () =>
        event('error', err instanceof Error ? err.name : 'Error', {
          status: 'error',
          summary: message,
          errorMessage: message,
          meta: stack ? { stack, in: `${kind}: ${name}` } : { in: `${kind}: ${name}` },
        })
      )
    }
    throw err
  } finally {
    if (row.id !== null) {
      const finalStatus: TraceStatus = status ?? fields.status ?? 'ok'
      await finishRow(ctx, row.id, startedAt, { ...fields, status: finalStatus, errorMessage: errorMessage ?? fields.errorMessage }, mergedMeta, payloads)
    }
  }
}

/** A step with no duration (a decision, an error) recorded in one write. */
export async function event(
  kind: TraceKind,
  name: string,
  fields: SpanFields & { payloads?: { role: PayloadRole; content: string }[] } = {}
): Promise<void> {
  const ctx = store.getStore()
  if (!ctx || ctx.shared.disabled) return
  const startedAt = new Date()
  const row = await insertStart(ctx, kind, name, startedAt, undefined)
  if (row.id === null) return
  const { payloads, meta, ...rest } = fields
  await finishRow(ctx, row.id, startedAt, { ...rest, status: rest.status ?? 'ok' }, meta, payloads ?? [])
}

function newShared(runId: number, startSeq = 0): Shared {
  return { runId, seq: startSeq, failures: 0, disabled: false, reportedErrors: new WeakSet() }
}

/** Opens a run's trace: the root 'run' step, under which everything else nests. */
export function traceRun<T>(runId: number, name: string, meta: Record<string, unknown>, fn: (s: Span) => Promise<T>): Promise<T> {
  return store.run({ shared: newShared(runId), parentId: null }, () => span('run', name, fn, meta))
}

/** Re-enters an existing run's trace after the run's own step has closed — for
 * work done afterwards by the caller (sending the report email). Continues seq
 * after what is already recorded and hangs new steps off the run's root. Never
 * throws; if the lookup fails, `fn` runs untraced. */
export async function withRunTrace<T>(runId: number | null | undefined, fn: () => Promise<T>): Promise<T> {
  if (runId == null || store.getStore()) return fn()
  const shared = newShared(runId)
  const last = await safely(shared, 'look up run trace', () =>
    queryOne<{ root_id: number | null; max_seq: number | null }>(
      `SELECT (SELECT id FROM trace_events WHERE run_id = $1 AND kind = 'run' ORDER BY seq LIMIT 1) AS root_id,
              (SELECT MAX(seq) FROM trace_events WHERE run_id = $1) AS max_seq`,
      [runId]
    )
  )
  if (!last || last.root_id == null) return fn()
  shared.seq = last.max_seq ?? 0
  return store.run({ shared, parentId: last.root_id }, fn)
}

/** Deletes payload text older than 30 days. The trace_events rows stay so the
 * run history keeps its shape; only the bulky prompts/responses/context go. */
export async function pruneTracePayloads(days = PAYLOAD_RETENTION_DAYS): Promise<number> {
  const rows = await query<{ n: number }>(
    `WITH gone AS (
       DELETE FROM trace_payloads p USING trace_events e
       WHERE p.event_id = e.id AND e.started_at < NOW() - ($1::int * INTERVAL '1 day')
       RETURNING 1
     ) SELECT COUNT(*)::int AS n FROM gone`,
    [days]
  )
  return rows[0]?.n ?? 0
}
