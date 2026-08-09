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
import { STATES } from './demo/markov.js'
import { DATA_SOURCE, FRONTEND_ORIGIN } from './config.js'

const app = express()
app.use(express.json())
app.use(cors({ origin: FRONTEND_ORIGIN, methods: ['GET', 'POST', 'DELETE'] }))

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ detail: err instanceof Error ? err.message : String(err) })
})

const port = Number(process.env.PORT) || 8000
app.listen(port, () => {
  console.log(`Google Ads AI Performance Dashboard API listening on :${port}`)
})
