import { Router } from 'express'
import * as reporting from '../../reporting/reporting.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const period = (req.query.period as string) || 'daily'
    if (period !== 'daily' && period !== 'weekly') {
      res.status(400).json({ detail: "period must be 'daily' or 'weekly'" })
      return
    }
    res.json(await reporting.listReportDates(period))
  })
)

router.get(
  '/reports/latest',
  asyncHandler(async (req, res) => {
    const period = (req.query.period as string) || 'daily'
    if (period !== 'daily' && period !== 'weekly') {
      res.status(400).json({ detail: "period must be 'daily' or 'weekly'" })
      return
    }
    res.json(await reporting.getLatestReport(period))
  })
)

/** Registered after /reports/latest so that literal path isn't shadowed
 * by this :id param. `:id` is the summary output's own ai_outputs.id, not
 * a date — pinning the lookup to the exact generation is what lets two
 * runs on the same report_date (e.g. a manual re-run) each be reachable
 * as their own report instead of one shadowing the other. */
router.get(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      res.status(400).json({ detail: 'id must be an integer' })
      return
    }
    const result = await reporting.getReportById(id)
    if (!result.analysis && !result.recommendation && !result.summary) {
      res.status(404).json({ detail: 'Report not found' })
      return
    }
    res.json(result)
  })
)
