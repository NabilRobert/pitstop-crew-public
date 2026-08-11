import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

router.get(
  '/campaigns',
  asyncHandler(async (_req, res) => {
    res.json(await reporting.listCampaigns())
  })
)

router.get(
  '/performance',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    res.json(await reporting.getPerformanceSeries(days))
  })
)

router.get(
  '/segments/performance',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    res.json(await reporting.getSegmentBreakdown(days))
  })
)
