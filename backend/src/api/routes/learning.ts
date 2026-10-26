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
  '/learning/grade-trend',
  asyncHandler(async (req, res) => {
    const weeks = req.query.weeks === undefined ? 8 : Number(req.query.weeks)
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 104) {
      res.status(400).json({ detail: 'weeks must be an integer from 1 to 104' })
      return
    }
    res.json(await learning.getGradeTrend(weeks))
  })
)

router.get(
  '/learning/suggestions',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20
    res.json(await learning.getSuggestionHistory(limit))
  })
)
