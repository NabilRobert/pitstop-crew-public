import { Router } from 'express'
import * as pipelineRuns from '../../pipeline/pipelineRuns.js'
import { runDaily, runWeekly } from '../../pipeline/orchestrator.js'
import { formatReportEmail, formatFailureAlert } from '../../reporting/reports.js'
import { deliverReport } from '../../platform/emailDelivery.js'
import { emitEvent, getRecentEvents, subscribe } from '../../platform/eventBus.js'
import { wibDate } from '../../platform/timezone.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Backs the System Health Standout Feature. */
router.get(
  '/system-health',
  asyncHandler(async (_req, res) => {
    const lastDaily = await pipelineRuns.getLastSuccessfulRun('daily')
    const recentRuns = await pipelineRuns.getRecentRuns(undefined, 20)
    res.json({ last_successful_daily_run: lastDaily, recent_runs: recentRuns })
  })
)

/** Backs the live console panel — replays recent history, then streams
 * new events as they're emitted. Plain SSE, no client library needed. */
router.get('/console/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  for (const event of getRecentEvents()) {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  const unsubscribe = subscribe((event) => res.write(`data: ${JSON.stringify(event)}\n\n`))
  req.on('close', unsubscribe)
})

let runInProgress = false

/** "Generate report now" — deliberately not wrapped in asyncHandler
 * (which awaits the whole handler): responds immediately, then runs the
 * real pipeline in the background, visible via the console stream above.
 * Bypasses runDaily.ts's "already ran today" scheduling guard on purpose
 * — an explicit manual trigger should always actually run. Emails the
 * result the same way the scheduled cron run does (deliverReport reads
 * the recipient from Settings), so manual triggers aren't a silent,
 * email-free side path. */
router.post('/pipeline/run', (req, res) => {
  if (runInProgress) {
    res.status(409).json({ detail: 'A pipeline run is already in progress' })
    return
  }
  const period = req.body.period === 'weekly' ? 'weekly' : 'daily'
  const today = wibDate()
  runInProgress = true
  res.json({ started: true, period, target_date: today })
  ;(period === 'weekly' ? runWeekly(today) : runDaily(today))
    .then(async (result) => {
      try {
        const { subject, body } = await formatReportEmail(result, today, period)
        emitEvent(`Emil: emailing ${period} report…`)
        await deliverReport(period, subject, body)
      } catch (err) {
        // The pipeline run itself succeeded — a failed send here shouldn't
        // be reported as a pipeline failure, just its own separate warning.
        emitEvent(`Report generated but email failed to send: ${err instanceof Error ? err.message : String(err)}`, 'warn')
      }
    })
    .catch(async (err: unknown) => {
      const message = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err)
      emitEvent(`Pipeline run failed: ${message}`, 'error')
      const { subject, body } = formatFailureAlert(period, message)
      await deliverReport(period, subject, body).catch(() => {})
    })
    .finally(() => {
      runInProgress = false
    })
})
