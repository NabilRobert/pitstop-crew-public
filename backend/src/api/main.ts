// REST API — what the Vue frontend calls. Gated by a single-account login
// (see platform/auth.ts) — /health, /config, and /auth/* are the only
// public routes; everything else requires a valid session token via
// authMiddleware. CORS locked to FRONTEND_ORIGINS (one or more, from
// FRONTEND_ORIGIN). Error responses use {detail: "..."} to match the
// FastAPI version's shape, so the frontend's error handling (which reads
// body.detail) didn't need to change for this port.
//
// Routes live in routes/, one file per resource area — this file is just
// setup, mounting, and the two trivial routes not worth their own file.

import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'

import { DATA_SOURCE, FRONTEND_ORIGINS } from '../platform/config.js'
import { reconcileOrphanedRuns } from '../pipeline/pipelineRuns.js'
import { authMiddleware } from './authMiddleware.js'
import { router as authRoutes } from './routes/auth.js'
import { router as settingsRoutes } from './routes/settings.js'
import { router as learningRoutes } from './routes/learning.js'
import { router as campaignsRoutes } from './routes/campaigns.js'
import { router as reportsRoutes } from './routes/reports.js'
import { router as outputsRoutes } from './routes/outputs.js'
import { router as timeMachineRoutes } from './routes/timeMachine.js'
import { router as pipelineRoutes } from './routes/pipeline.js'
import { router as voiceRoutes } from './routes/voice.js'
import { router as assistantRoutes } from './routes/assistant.js'
import { router as adGroupsRoutes } from './routes/adGroups.js'
import { router as keywordsRoutes } from './routes/keywords.js'

const app = express()
app.use(express.json())
app.use(
  cors({
    origin: FRONTEND_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/** Backs the Demo Mode badge — always visible when active, per PROJECT.md. */
app.get('/config', (_req, res) => {
  res.json({ data_source: DATA_SOURCE })
})

app.use(authRoutes)
app.use(authMiddleware)

app.use(settingsRoutes)
app.use(learningRoutes)
app.use(campaignsRoutes)
app.use(reportsRoutes)
app.use(outputsRoutes)
app.use(timeMachineRoutes)
app.use(pipelineRoutes)
app.use(voiceRoutes)
app.use(assistantRoutes)
app.use(adGroupsRoutes)
app.use(keywordsRoutes)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ detail: err instanceof Error ? err.message : String(err) })
})

// Fire-and-forget — not awaited, so a DB hiccup here doesn't block /health
// from coming up. Cleans up any pipeline_runs row left status='running' by
// a prior crash/restart (see reconcileOrphanedRuns' own docstring).
reconcileOrphanedRuns()
  .then((count) => {
    if (count > 0) console.log(`Reconciled ${count} orphaned pipeline run(s) from a prior crash/restart`)
  })
  .catch((err) => console.error('Failed to reconcile orphaned pipeline runs at startup:', err))

const port = Number(process.env.PORT) || 8000
app.listen(port, () => {
  console.log(`Google Ads AI Performance Dashboard API listening on :${port}`)
})
