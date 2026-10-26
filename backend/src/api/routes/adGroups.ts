// v2 Stage 1 — ad groups. See docs/v2-*-plan.md.

import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Backs the Campaign -> Ad Groups drill-down page. ?campaignId= scopes to
 * one campaign; omitted returns ad groups across all campaigns that have
 * them (the 3 Search-type campaigns — see profile.ts's AD_GROUPS). */
router.get(
  '/ad-groups/performance',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    const campaignId = req.query.campaignId ? Number(req.query.campaignId) : undefined
    res.json(await reporting.getAdGroupPerformance(days, undefined, campaignId))
  })
)
