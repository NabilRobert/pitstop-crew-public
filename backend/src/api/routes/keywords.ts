// v2 Stage 1 — keywords + Quality Score. See docs/v2-*-plan.md.

import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Backs the Ad Group -> Keywords drill-down page, including per-day
 * Quality Score + its 3 diagnostic sub-scores. ?adGroupId= scopes to one
 * ad group; omitted returns keywords across all ad groups. */
router.get(
  '/keywords/performance',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    const adGroupId = req.query.adGroupId ? Number(req.query.adGroupId) : undefined
    res.json(await reporting.getKeywordPerformance(days, undefined, adGroupId))
  })
)
