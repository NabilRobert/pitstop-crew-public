// v2 Stage 1 — keywords + Quality Score. See docs/v2-*-plan.md.

import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { getKeywordsSummary } from '../../reporting/keywordSuggestions.js'
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

/** v3 — window aggregates per keyword that the per-day rows above can't
 * give: intent mix and coverage, conversions by action, stock link, waste
 * exposure (contract 3.0 KeywordSummary). Same window as
 * /keywords/performance for the same ?days=. */
router.get(
  '/keywords/summary',
  asyncHandler(async (req, res) => {
    const days = req.query.days === undefined ? 30 : Number(req.query.days)
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      res.status(400).json({ detail: 'days must be an integer from 1 to 366' })
      return
    }
    const adGroupId = req.query.adGroupId === undefined ? undefined : Number(req.query.adGroupId)
    if (adGroupId !== undefined && (!Number.isInteger(adGroupId) || adGroupId < 1)) {
      res.status(400).json({ detail: 'adGroupId must be a positive integer' })
      return
    }
    res.json(await getKeywordsSummary(days, adGroupId))
  })
)
