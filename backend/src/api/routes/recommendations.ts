// v2 Stage 7 — Google Ads' own Recommendations. See docs/v2-backend-plan.md.

import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Backs the Recommendations list page. No /performance suffix — this
 * isn't a performance metric, it's a list of suggestion objects. */
router.get(
  '/recommendations',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    res.json(await reporting.getRecommendations(days))
  })
)
