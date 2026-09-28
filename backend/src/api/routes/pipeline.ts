import { Router } from 'express'
import * as pipelineRuns from '../../pipeline/pipelineRuns.js'
import { runDaily, runWeekly } from '../../pipeline/orchestrator.js'
import { formatReportEmail, formatFailureAlert } from '../../reporting/reports.js'
import { deliverReport } from '../../platform/emailDelivery.js'
import { emitEvent, getRecentEvents, subscribe, type ConsoleEvent } from '../../platform/eventBus.js'
import { wibDate } from '../../platform/timezone.js'
import { safeEventText } from '../../platform/redact.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Backs the System Health Standout Feature. */
router.get(
  '/system-health',
  asyncHandler(async (_req, res) => {
    const lastDaily = await pipelineRuns.getLastSuccessfulRun('daily')
    const recentRuns = await pipelineRuns.getRecentRuns(undefined, 20)
    const demo = res.locals.role === 'demo'
    res.json({
      last_successful_daily_run: demo ? demoRun(lastDaily) : lastDaily,
      recent_runs: demo ? recentRuns.map(demoRun) : recentRuns,
    })
  })
)

/** Status-polling alternative to holding an SSE connection open — poll
 * this instead of /console/stream if you just want to know when a
 * specific run (returned as `runId` from POST /pipeline/run) finishes. */
router.get(
  '/pipeline/runs/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({ detail: 'id must be an integer' })
      return
    }
    const run = await pipelineRuns.getRunById(id)
    if (!run) {
      res.status(404).json({ detail: `No pipeline run with id ${id}` })
      return
    }
    res.json(res.locals.role === 'demo' ? demoRun(run) : run)
  })
)

/** A run's error_message can carry a stack trace or connection details; a demo
 * viewer gets one redacted line. */
function demoRun<T extends { error_message?: string | null }>(run: T): T {
  if (!run || !run.error_message) return run
  return { ...run, error_message: safeEventText(run.error_message) }
}

const HEARTBEAT_INTERVAL_MS = 20_000 // comfortably under Caddy's default proxy idle timeout

/** Backs the live console panel — replays recent history, then streams new
 * events as they're emitted. Plain SSE, no client library needed.
 * ?runId= filters to just one run's events (buffer replay + live). The
 * Last-Event-ID request header (sent automatically by EventSource on
 * reconnect) resumes from that point instead of replaying everything —
 * limited by the 200-event ring buffer, so a long enough gap still loses
 * the earliest events in it. */
router.get('/console/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders()

  const runIdFilter = req.query.runId !== undefined ? Number(req.query.runId) : undefined
  const lastEventIdHeader = req.get('Last-Event-ID')
  const resumeAfterSeq = lastEventIdHeader !== undefined ? Number(lastEventIdHeader) : undefined

  const matches = (event: ConsoleEvent) => runIdFilter === undefined || event.runId === runIdFilter
  // A demo viewer gets event text only: one redacted line, never a stack trace,
  // connection string or env value (errors are emitted as "message\n\nstack").
  const demo = res.locals.role === 'demo'
  const write = (event: ConsoleEvent) => {
    const out = demo ? { ...event, message: safeEventText(event.message) } : event
    res.write(`id: ${event.seq}\ndata: ${JSON.stringify(out)}\n\n`)
  }

  for (const event of getRecentEvents()) {
    if (!matches(event)) continue
    if (resumeAfterSeq !== undefined && event.seq <= resumeAfterSeq) continue
    write(event)
  }

  const unsubscribe = subscribe((event) => {
    if (matches(event)) write(event)
  })
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_INTERVAL_MS)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})

/** "Generate report now" — deliberately not wrapped in asyncHandler (which
 * awaits the whole handler): the run id is created synchronously so it can
 * be returned to the caller, but the real pipeline work runs in the
 * background after the response is sent, visible via the console stream
 * above. Bypasses runDaily.ts's "already ran today" scheduling guard on
 * purpose — an explicit manual trigger should always actually run. Emails
 * the result the same way the scheduled cron run does (deliverReport reads
 * the recipient from Settings), so manual triggers aren't a silent,
 * email-free side path. */
router.post('/pipeline/run', async (req, res) => {
  const period = req.body.period === 'weekly' ? 'weekly' : 'daily'
  const today = wibDate()

  let runId: number
  try {
    runId = await pipelineRuns.startRun(period)
  } catch (err) {
    if (err instanceof pipelineRuns.PipelineRunInProgressError) {
      res.status(409).json({ detail: err.message })
      return
    }
    // Not asyncHandler-wrapped, so nothing else catches this — must
    // respond here rather than rethrow into the void.
    res.status(500).json({ detail: err instanceof Error ? err.message : String(err) })
    return
  }

  res.json({ started: true, period, target_date: today, runId })

  ;(period === 'weekly' ? runWeekly(today, runId) : runDaily(today, undefined, undefined, runId))
    .then(async (result) => {
      try {
        const { subject, body } = await formatReportEmail(result, today, period)
        emitEvent(`Emil: emailing ${period} report…`, 'info', runId)
        await deliverReport(period, subject, body, runId)
      } catch (err) {
        // The pipeline run itself succeeded — a failed send here shouldn't
        // be reported as a pipeline failure, just its own separate warning.
        emitEvent(`Report generated but email failed to send: ${err instanceof Error ? err.message : String(err)}`, 'warn', runId)
      }
    })
    .catch(async (err: unknown) => {
      const message = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err)
      emitEvent(`Pipeline run failed: ${message}`, 'error', runId)
      const { subject, body } = formatFailureAlert(period, message)
      await deliverReport(period, subject, body, runId).catch(() => {})
    })
})
