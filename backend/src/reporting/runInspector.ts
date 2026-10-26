// Read side of the Run Inspector (writer: platform/trace.ts). Lists runs, a
// run's trace as a flat list, and the prompt/response/context text of one step.
// Demo viewers get the same data with error detail reduced to one redacted line.

import { query, queryOne } from '../data/db.js'
import { safeEventText } from '../platform/redact.js'

const PAYLOAD_RETENTION_DAYS = 30

export interface RunListItem {
  id: number
  run_type: string
  status: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  cost_usd: number | null
  llm_calls: number | null
  tokens_in: number | null
  tokens_out: number | null
  trace_event_count: number
  error_message: string | null
}

const RUN_COLUMNS = `
  r.id, r.run_type, r.status, r.started_at, r.finished_at,
  CASE WHEN r.finished_at IS NULL THEN NULL
       ELSE (EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000)::int END AS duration_ms,
  CASE WHEN r.cost_usd_micros IS NULL THEN NULL ELSE r.cost_usd_micros / 1000000.0 END AS cost_usd,
  (SELECT SUM((m.value->>'calls')::int) FROM jsonb_each(r.llm_usage) m)::int AS llm_calls,
  (SELECT SUM((m.value->>'input_tokens')::int) FROM jsonb_each(r.llm_usage) m)::int AS tokens_in,
  (SELECT SUM((m.value->>'output_tokens')::int) FROM jsonb_each(r.llm_usage) m)::int AS tokens_out,
  (SELECT COUNT(*) FROM trace_events t WHERE t.run_id = r.id)::int AS trace_event_count,
  r.error_message`

/** Newest first. cost_usd and the token/call counts are null for runs that
 * recorded no LLM usage (older runs, backups) or have no price configured —
 * null means "unknown", never zero. */
export async function listRuns(limit: number, demo: boolean): Promise<RunListItem[]> {
  const rows = await query<RunListItem>(`SELECT ${RUN_COLUMNS} FROM pipeline_runs r ORDER BY r.started_at DESC, r.id DESC LIMIT $1`, [limit])
  return demo ? rows.map(demoRunError) : rows
}

function demoRunError<T extends { error_message: string | null }>(row: T): T {
  return row.error_message ? { ...row, error_message: safeEventText(row.error_message) } : row
}

export interface TraceEventRow {
  id: number
  parent_id: number | null
  seq: number
  kind: string
  name: string
  status: string
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  model: string | null
  tokens_in: number | null
  tokens_out: number | null
  cost_usd: number | null
  summary: string | null
  meta: Record<string, unknown> | null
  error_message: string | null
  /** How many prompt/response/context texts are stored for this step (see
   * GET /trace/events/:id/payloads). 0 also once they are past retention. */
  payload_count: number
}

/** A run and its trace as a flat list ordered by seq (a depth-first walk of
 * the tree; parent_id gives the nesting). No payload text. Null if there is no
 * such run; a run without a trace (recorded before tracing existed) has an
 * empty list. */
export async function getRunTrace(runId: number, demo: boolean): Promise<{ run: RunListItem; events: TraceEventRow[] } | null> {
  const run = await queryOne<RunListItem>(`SELECT ${RUN_COLUMNS} FROM pipeline_runs r WHERE r.id = $1`, [runId])
  if (!run) return null
  const events = await query<TraceEventRow>(
    `SELECT e.id, e.parent_id, e.seq, e.kind, e.name, e.status, e.started_at, e.ended_at, e.duration_ms,
            e.model, e.tokens_in, e.tokens_out, e.cost_usd, e.summary, e.meta, e.error_message,
            (SELECT COUNT(*) FROM trace_payloads p WHERE p.event_id = e.id)::int AS payload_count
     FROM trace_events e WHERE e.run_id = $1 ORDER BY e.seq`,
    [runId]
  )
  return { run: demo ? demoRunError(run) : run, events: demo ? events.map(demoEvent) : events }
}

/** For a demo viewer: no stack (or where it came from), and error text cut to
 * one redacted line. The rest of an event is the same as the owner sees. */
function demoEvent(e: TraceEventRow): TraceEventRow {
  const out = { ...e }
  if (out.error_message) out.error_message = safeEventText(out.error_message)
  if (out.kind === 'error') {
    out.summary = out.error_message
    out.meta = null
  } else if (out.meta && 'stack' in out.meta) {
    const { stack: _stack, ...rest } = out.meta
    out.meta = rest
  }
  return out
}

export interface EventPayloads {
  event_id: number
  /** True when the step has no stored text because it is past the retention
   * window (as opposed to a step that never had any). */
  expired: boolean
  retention_days: number
  payloads: { id: number; role: string; chars: number; content: string }[]
}

export async function getEventPayloads(eventId: number): Promise<EventPayloads | null> {
  const event = await queryOne<{ id: number; old: boolean }>(
    `SELECT id, started_at < NOW() - ($2::int * INTERVAL '1 day') AS old FROM trace_events WHERE id = $1`,
    [eventId, PAYLOAD_RETENTION_DAYS]
  )
  if (!event) return null
  const rows = await query<{ id: number; role: string; content: string }>(
    'SELECT id, role, content FROM trace_payloads WHERE event_id = $1 ORDER BY id',
    [eventId]
  )
  return {
    event_id: event.id,
    expired: rows.length === 0 && event.old,
    retention_days: PAYLOAD_RETENTION_DAYS,
    payloads: rows.map((r) => ({ id: r.id, role: r.role, chars: r.content.length, content: r.content })),
  }
}
