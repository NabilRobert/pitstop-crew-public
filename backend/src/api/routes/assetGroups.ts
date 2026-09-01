// v2 Stage 6 — PMax asset groups. See docs/v2-backend-plan.md.

import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Backs the PMax -> Asset Groups drill-down page. Every row is
 * implicitly pmax-only — no campaignId filter needed. */
router.get(
  '/asset-groups/performance',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    res.json(await reporting.getAssetGroupPerformance(days))
  })
)
