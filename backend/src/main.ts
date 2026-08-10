// REST API — what the Vue frontend calls. Per PROJECT.md's Deployment
// decision: no auth on this boundary (single-user), CORS locked to
// FRONTEND_ORIGIN. Error responses use {detail: "..."} to match the
// FastAPI version's shape, so the frontend's error handling (which reads
// body.detail) didn't need to change for this port.

import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'

import * as askModule from './ask.js'
import * as outputs from './outputs.js'
import * as pipelineRuns from './pipelineRuns.js'
import * as reporting from './reporting.js'
import * as timeMachine from './demo/timeMachine.js'
import * as settings from './settings.js'
import * as learning from './learning.js'
import { runDaily, runWeekly } from './orchestrator.js'
import { formatReportEmail, formatFailureAlert } from './reports.js'
import { deliverReport } from './emailDelivery.js'
import { emitEvent, getRecentEvents, subscribe } from './eventBus.js'
import { STATES } from './demo/markov.js'
import { DATA_SOURCE, FRONTEND_ORIGIN } from './config.js'

const app = express()
app.use(express.json())
app.use(cors({ origin: FRONTEND_ORIGIN, methods: ['GET', 'POST', 'PUT', 'DELETE'] }))

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next)
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/** Backs the Demo Mode badge — always visible when active, per PROJECT.md. */
app.get('/config', (_req, res) => {
  res.json({ data_source: DATA_SOURCE })
})

/** Backs the System Health Standout Feature. */
app.get(
  '/system-health',
  asyncHandler(async (_req, res) => {
    const lastDaily = await pipelineRuns.getLastSuccessfulRun('daily')
    const recentRuns = await pipelineRuns.getRecentRuns(undefined, 20)
    res.json({ last_successful_daily_run: lastDaily, recent_runs: recentRuns })
  })
)

/** Pipeline run-time config — polled by runDaily.ts instead of the run
 * time being baked into the crontab line. */
app.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json(await settings.getSettings())
  })
)

/** Generic over settings.SETTING_KEYS so adding a new setting only ever
 * means touching settings.ts, never this route too — the previous
 * version required both, and drifted (report_recipient_email was added
 * to settings.ts and the frontend but silently never wired in here). */
app.put(
  '/settings',
  asyncHandler(async (req, res) => {
    try {
      for (const [key, value] of Object.entries(req.body ?? {})) {
        if (!settings.isSettingKey(key)) continue
        await settings.setSetting(key, String(value))
      }
    } catch (err) {
      res.status(400).json({ detail: err instanceof Error ? err.message : String(err) })
      return
    }
    res.json(await settings.getSettings())
  })
)

/** Backs the Learning page. */
app.get(
  '/learning/flag-rate',
  asyncHandler(async (req, res) => {
    const weeks = req.query.weeks ? Number(req.query.weeks) : 8
    res.json(await learning.getFlagRateTrend(weeks))
  })
)

app.get(
  '/learning/suggestions',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20
    res.json(await learning.getSuggestionHistory(limit))
  })
)

app.get(
  '/campaigns',
  asyncHandler(async (_req, res) => {
    res.json(await reporting.listCampaigns())
  })
)

app.get(
  '/performance',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    res.json(await reporting.getPerformanceSeries(days))
  })
)

app.get(
  '/segments/performance',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    res.json(await reporting.getSegmentBreakdown(days))
  })
)

app.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const period = (req.query.period as string) || 'daily'
    if (period !== 'daily' && period !== 'weekly') {
      res.status(400).json({ detail: "period must be 'daily' or 'weekly'" })
      return
    }
    res.json(await reporting.listReportDates(period))
  })
)

app.get(
  '/reports/latest',
  asyncHandler(async (req, res) => {
    const period = (req.query.period as string) || 'daily'
    if (period !== 'daily' && period !== 'weekly') {
      res.status(400).json({ detail: "period must be 'daily' or 'weekly'" })
      return
    }
    res.json(await reporting.getLatestReport(period))
  })
)

/** Registered after /reports/latest so that literal path isn't shadowed
 * by this :date param. */
app.get(
  '/reports/:date',
  asyncHandler(async (req, res) => {
    const period = (req.query.period as string) || 'daily'
    if (period !== 'daily' && period !== 'weekly') {
      res.status(400).json({ detail: "period must be 'daily' or 'weekly'" })
      return
    }
    const date = req.params.date as string
    const result = await reporting.getReportByDate(period, date)
    if (!result.analysis && !result.recommendation && !result.summary) {
      res.status(404).json({ detail: 'Report not found' })
      return
    }
    res.json(result)
  })
)

app.get(
  '/outputs/:id',
  asyncHandler(async (req, res) => {
    const result = await outputs.getOutput(Number(req.params.id))
    if (result === null) {
      res.status(404).json({ detail: 'Output not found' })
      return
    }
    res.json(result)
  })
)

/** Backs the "why trail" Standout Feature. */
app.get(
  '/outputs/:id/why-trail',
  asyncHandler(async (req, res) => {
    const trail = await outputs.getWhyTrail(Number(req.params.id))
    if (trail.length === 0) {
      res.status(404).json({ detail: 'Output not found' })
      return
    }
    res.json(trail)
  })
)

/** Loads prior Q&A for a report without asking a new question — backs
 * the Ask panel on report detail pages. */
app.get(
  '/outputs/:id/ask-history',
  asyncHandler(async (req, res) => {
    res.json(await askModule.getAskHistory(Number(req.params.id)))
  })
)

app.post(
  '/ask',
  asyncHandler(async (req, res) => {
    const { output_id: outputId, question } = req.body
    try {
      const askId = await askModule.ask(outputId, question)
      const history = await askModule.getAskHistory(outputId)
      res.json({ ask_id: askId, history })
    } catch (err) {
      res.status(400).json({ detail: err instanceof Error ? err.message : String(err) })
    }
  })
)

app.post(
  '/time-machine/override',
  asyncHandler(async (req, res) => {
    const { date, forced_state: forcedState } = req.body
    if (!STATES.includes(forcedState)) {
      res.status(400).json({ detail: `forced_state must be one of ${STATES.join(', ')}` })
      return
    }
    await timeMachine.setOverride(date, forcedState)
    res.json({ date, forced_state: forcedState })
  })
)

app.get(
  '/time-machine/overrides',
  asyncHandler(async (_req, res) => {
    const overrides = await timeMachine.getOverrides()
    res.json(Object.fromEntries(overrides))
  })
)

app.delete(
  '/time-machine/override/:date',
  asyncHandler(async (req, res) => {
    const date = req.params.date as string
    await timeMachine.clearOverride(date)
    res.json({ cleared: date })
  })
)

/** Backs the live console panel — replays recent history, then streams
 * new events as they're emitted. Plain SSE, no client library needed. */
app.get('/console/stream', (req, res) => {
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
app.post('/pipeline/run', (req, res) => {
  if (runInProgress) {
    res.status(409).json({ detail: 'A pipeline run is already in progress' })
    return
  }
  const period = req.body.period === 'weekly' ? 'weekly' : 'daily'
  const today = new Date().toISOString().slice(0, 10)
  runInProgress = true
  res.json({ started: true, period, target_date: today })
  ;(period === 'weekly' ? runWeekly(today) : runDaily(today))
    .then(async (result) => {
      try {
        const { subject, body } = await formatReportEmail(result, today, period)
        emitEvent(`Emailing ${period} report…`)
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ detail: err instanceof Error ? err.message : String(err) })
})

const port = Number(process.env.PORT) || 8000
app.listen(port, () => {
  console.log(`Google Ads AI Performance Dashboard API listening on :${port}`)
})
