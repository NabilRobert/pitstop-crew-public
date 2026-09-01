// v2 Stage 5 — named conversion actions. See docs/v2-backend-plan.md.

import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Account-wide breakdown of conversions by named action — mirrors
 * /segments/performance's shape, since conversion actions aren't scoped
 * under a campaign/ad-group hierarchy the way keywords/ads are. */
router.get(
  '/conversion-actions/performance',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    res.json(await reporting.getConversionActionBreakdown(days))
  })
)
