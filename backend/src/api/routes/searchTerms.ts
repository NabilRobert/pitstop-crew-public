// v2 Stage 2 — search terms. See docs/v2-backend-plan.md.

import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Backs the Keyword -> Search Terms drill-down page. ?keywordId= scopes to
 * one keyword; omitted returns search terms across all keywords. */
router.get(
  '/search-terms/performance',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30
    const keywordId = req.query.keywordId ? Number(req.query.keywordId) : undefined
    res.json(await reporting.getSearchTermPerformance(days, undefined, keywordId))
  })
)
