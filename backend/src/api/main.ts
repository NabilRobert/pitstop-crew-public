// REST API — what the Vue frontend calls. Every route except /health, /config
// and /auth/login needs a session token (owner, or the optional read-only demo
// account — see platform/auth.ts and authMiddleware.ts). CORS is locked to
// FRONTEND_ORIGINS (one or more, from FRONTEND_ORIGIN). Error responses use
// {detail: "..."} to match the FastAPI version's shape, so the frontend's
// error handling (which reads body.detail) didn't need to change for this port.
//
// Routes live in routes/, one file per resource area — this file is just
// setup, mounting, and the two trivial routes not worth their own file.

import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'

import { DATA_SOURCE, FRONTEND_ORIGINS } from '../platform/config.js'
import { reconcileOrphanedRuns } from '../pipeline/pipelineRuns.js'
import { authMiddleware, demoReadOnly } from './authMiddleware.js'
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
import { router as searchTermsRoutes } from './routes/searchTerms.js'
import { router as adsRoutes } from './routes/ads.js'
import { router as conversionActionsRoutes } from './routes/conversionActions.js'
import { router as assetGroupsRoutes } from './routes/assetGroups.js'
import { router as recommendationsRoutes } from './routes/recommendations.js'
import { router as changeEventsRoutes } from './routes/changeEvents.js'
import { router as keywordOptimizerRoutes } from './routes/keywordOptimizer.js'
import { router as launchesRoutes, auditDemoLaunch } from './routes/launches.js'

const app = express()
// Caddy is the only proxy in front of the API (and the API only listens on
// loopback, below), so the one hop it adds is trusted: req.ip is then the real
// client, which the login lockout is keyed on. Without this every visitor
// shares the proxy's address and five bad logins by anyone lock out everyone.
app.set('trust proxy', 1)
app.use(express.json())
app.use(
  cors({
    origin: FRONTEND_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Download names, and the 3.3 brief's "columns not yet verified" flag.
    exposedHeaders: ['Content-Disposition', 'X-Editor-Columns'],
  })
)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/** Backs the Demo Mode badge — always visible when active, per docs/PROJECT.md. */
app.get('/config', (_req, res) => {
  res.json({ data_source: DATA_SOURCE })
})

app.use(authRoutes)
app.use(authMiddleware)
app.use(auditDemoLaunch()) // 3.6: a demo launch attempt is audited, then refused below
app.use(demoReadOnly)

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
app.use(searchTermsRoutes)
app.use(adsRoutes)
app.use(conversionActionsRoutes)
app.use(assetGroupsRoutes)
app.use(recommendationsRoutes)
app.use(changeEventsRoutes)
app.use(keywordOptimizerRoutes)
app.use(launchesRoutes)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ detail: err instanceof Error ? err.message : String(err) })
})

// Fire-and-forget, not awaited at module top level: a DB hiccup here
// shouldn't block /health from coming up. Cleans up any pipeline_runs row
// left status='running' by a crash/restart before this boot.
reconcileOrphanedRuns()
  .then((count) => {
    if (count > 0) console.log(`Reconciled ${count} orphaned pipeline run(s) from a prior crash/restart`)
  })
  .catch((err) => console.error('Failed to reconcile orphaned pipeline runs at startup:', err))

const port = Number(process.env.PORT) || 8000
// Loopback only: Caddy proxies to it, and a direct connection from outside
// would bypass Caddy and could spoof X-Forwarded-For past 'trust proxy'.
app.listen(port, '127.0.0.1', () => {
  console.log(`Google Ads AI Performance Dashboard API listening on 127.0.0.1:${port}`)
})
