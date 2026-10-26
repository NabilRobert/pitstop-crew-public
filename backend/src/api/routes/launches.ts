// Contract 3.6 — the simulated launch (docs/overhaul-v3.md section 13,
// docs/overhaul-v3-backend.md 11.9). POST is owner only: a demo POST is
// audited by auditDemoLaunch (mounted before demoReadOnly in main.ts) and
// then refused with the usual 403. GET is readable by both.

import { Router, type NextFunction, type Request, type Response } from 'express'
import { listLaunches, parseLaunchListQuery, performLaunch, recordDemoRefusal } from '../../launch/launches.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

router.post(
  '/launches',
  asyncHandler(async (req, res) => {
    const { http, launch, detail } = await performLaunch(req.body)
    if (launch) res.status(http).json(launch)
    else res.status(http).json({ detail })
  })
)

router.get(
  '/launches',
  asyncHandler(async (req, res) => {
    const q = parseLaunchListQuery(req.query)
    if (!q.ok) {
      res.status(400).json({ detail: q.detail })
      return
    }
    res.json(await listLaunches(q.value))
  })
)

/** Mounted after authMiddleware and before demoReadOnly: every demo POST
 * /launches leaves its audit row, then demoReadOnly answers 403. */
export function auditDemoLaunch(record = recordDemoRefusal) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (res.locals.role !== 'demo' || req.method !== 'POST' || req.path !== '/launches') return next()
    record(req.body).then(
      () => next(),
      (err) => next(err)
    )
  }
}
