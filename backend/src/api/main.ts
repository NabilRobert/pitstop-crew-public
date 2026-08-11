// REST API — what the Vue frontend calls. Per PROJECT.md's Deployment
// decision: no auth on this boundary (single-user), CORS locked to
// FRONTEND_ORIGIN. Error responses use {detail: "..."} to match the
// FastAPI version's shape, so the frontend's error handling (which reads
// body.detail) didn't need to change for this port.
//
// Routes live in routes/, one file per resource area — this file is just
// setup, mounting, and the two trivial routes not worth their own file.

import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'

import { DATA_SOURCE, FRONTEND_ORIGIN } from '../platform/config.js'
import { router as settingsRoutes } from './routes/settings.js'
import { router as learningRoutes } from './routes/learning.js'
import { router as campaignsRoutes } from './routes/campaigns.js'
import { router as reportsRoutes } from './routes/reports.js'
import { router as outputsRoutes } from './routes/outputs.js'
import { router as timeMachineRoutes } from './routes/timeMachine.js'
import { router as pipelineRoutes } from './routes/pipeline.js'

const app = express()
app.use(express.json())
app.use(cors({ origin: FRONTEND_ORIGIN, methods: ['GET', 'POST', 'PUT', 'DELETE'] }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/** Backs the Demo Mode badge — always visible when active, per PROJECT.md. */
app.get('/config', (_req, res) => {
  res.json({ data_source: DATA_SOURCE })
})

app.use(settingsRoutes)
app.use(learningRoutes)
app.use(campaignsRoutes)
app.use(reportsRoutes)
app.use(outputsRoutes)
app.use(timeMachineRoutes)
app.use(pipelineRoutes)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ detail: err instanceof Error ? err.message : String(err) })
})

const port = Number(process.env.PORT) || 8000
app.listen(port, () => {
  console.log(`Google Ads AI Performance Dashboard API listening on :${port}`)
})
