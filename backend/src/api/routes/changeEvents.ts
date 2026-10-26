// v2 Stage 8 — change history. See docs/v2-backend-plan.md.

import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Backs the Change History list page. No /performance suffix — same
 * reasoning as /recommendations, this isn't a performance metric. */
router.get(
  '/change-events',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    res.json(await reporting.getChangeEvents(days))
  })
)
