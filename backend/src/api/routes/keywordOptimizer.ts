// v3 — keyword optimizer API, contract 3.0 (docs/overhaul-v3.md section
// 13): the suggestion list, status changes, the negative-keyword export,
// the campaign brief (3.3), the inventory summary and the on-demand run.
// The demo account can read everything here and gets 403 on every write
// (demoReadOnly in main.ts).

import { Router } from 'express'
import * as pipelineRuns from '../../pipeline/pipelineRuns.js'
import { runKeywordOptimizer } from '../../pipeline/keywordOptimizer.js'
import * as suggestions from '../../reporting/keywordSuggestions.js'
import { formatFailureAlert } from '../../reporting/reports.js'
import { deliverReport } from '../../platform/emailDelivery.js'
import { emitEvent } from '../../platform/eventBus.js'
import { wibDate } from '../../platform/timezone.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

router.get(
  '/keyword-suggestions',
  asyncHandler(async (req, res) => {
    const q = suggestions.parseListQuery(req.query)
    if (!q.ok) {
      res.status(400).json({ detail: q.detail })
      return
    }
    res.json(await suggestions.listSuggestions(q.value))
  })
)

router.get(
  '/keyword-suggestions/export',
  asyncHandler(async (req, res) => {
    const q = suggestions.parseExportQuery(req.query)
    if (!q.ok) {
      res.status(400).json({ detail: q.detail })
      return
    }
    const body = await suggestions.exportNegatives(q.value)
    const filename = `negative-keywords-${wibDate()}.${q.value.format}`
    res.setHeader('Content-Type', q.value.format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(body)
  })
)

/** 3.3 — the paste-ready brief for a campaign proposal. The CSV's Editor
 * columns are not yet checked against a real Editor export, and the
 * X-Editor-Columns header says so. */
router.get(
  '/keyword-suggestions/:id/brief',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ detail: 'id must be a positive integer' })
      return
    }
    const q = suggestions.parseBriefQuery(req.query)
    if (!q.ok) {
      res.status(400).json({ detail: q.detail })
      return
    }
    const brief = await suggestions.getCampaignBrief(id, q.value.format)
    if (!brief.ok) {
      res.status(brief.code).json({ detail: brief.detail })
      return
    }
    const csv = q.value.format === 'csv'
    res.setHeader('Content-Type', csv ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="campaign-brief-${id}.${q.value.format}"`)
    if (csv) res.setHeader('X-Editor-Columns', 'UNVERIFIED')
    res.send(brief.body)
  })
)

router.patch(
  '/keyword-suggestions/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ detail: 'id must be a positive integer' })
      return
    }
    const body = suggestions.parseStatusBody(req.body)
    if (!body.ok) {
      res.status(400).json({ detail: body.detail })
      return
    }
    const result = await suggestions.changeSuggestionStatus(id, body.value)
    if (!result.ok) {
      res.status(result.code).json({ detail: result.detail })
      return
    }
    res.json(result.suggestion)
  })
)

/** Always 200: a down inventory source comes back as source 'unavailable'
 * with a sanitized error, so the page degrades instead of breaking. */
router.get(
  '/inventory/summary',
  asyncHandler(async (_req, res) => {
    res.json(await suggestions.getInventorySummary())
  })
)

/** Same shape as POST /pipeline/run: the run row is created before the
 * response (so its id can be returned, and the lock and spend cap answer
 * 409 / 429 synchronously); the run itself continues in the background,
 * visible on the console stream and in the Run Inspector. */
router.post('/keyword-optimizer/run', async (_req, res) => {
  let runId: number
  try {
    runId = await pipelineRuns.startRun('keyword_optimizer')
  } catch (err) {
    if (err instanceof pipelineRuns.PipelineRunInProgressError) {
      res.status(409).json({ detail: err.message })
      return
    }
    if (err instanceof pipelineRuns.SpendCeilingExceededError) {
      res.status(429).json({ detail: err.message })
      return
    }
    res.status(500).json({ detail: err instanceof Error ? err.message : String(err) })
    return
  }

  res.status(202).json({ run_id: runId })

  runKeywordOptimizer({ existingRunId: runId })
    .then((r) => emitEvent(`Keyword optimizer run complete: ${r.inserted} new suggestions, Kai ${r.kai}`, 'info', runId))
    .catch(async (err: unknown) => {
      const message = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err)
      emitEvent(`Keyword optimizer run failed: ${message}`, 'error', runId)
      const { subject, body } = formatFailureAlert('keyword_optimizer', message)
      await deliverReport('keyword_optimizer', subject, body, runId).catch(() => {})
    })
})
