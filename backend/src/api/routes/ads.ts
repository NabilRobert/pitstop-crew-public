// v2 Stage 3 — ads/creatives. See docs/v2-backend-plan.md.

import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Backs the Ad Group -> Ads drill-down page. ?adGroupId= scopes to one ad
 * group; omitted returns ads across all ad groups. */
router.get(
  '/ads/performance',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    const adGroupId = req.query.adGroupId ? Number(req.query.adGroupId) : undefined
    res.json(await reporting.getAdPerformance(days, undefined, adGroupId))
  })
)
