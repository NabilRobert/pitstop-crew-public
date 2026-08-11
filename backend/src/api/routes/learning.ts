import { Router } from 'express'
import * as learning from '../../reporting/learning.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Backs the Learning page. */
router.get(
  '/learning/flag-rate',
  asyncHandler(async (req, res) => {
    const weeks = req.query.weeks ? Number(req.query.weeks) : 8
    res.json(await learning.getFlagRateTrend(weeks))
  })
)

router.get(
  '/learning/suggestions',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20
    res.json(await learning.getSuggestionHistory(limit))
  })
)
