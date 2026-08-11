import { Router } from 'express'
import * as askModule from '../../reporting/ask.js'
import * as outputs from '../../reporting/outputs.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

router.get(
  '/outputs/:id',
  asyncHandler(async (req, res) => {
    const result = await outputs.getOutput(Number(req.params.id))
    if (result === null) {
      res.status(404).json({ detail: 'Output not found' })
      return
    }
    res.json(result)
  })
)

/** Backs the "why trail" Standout Feature. */
router.get(
  '/outputs/:id/why-trail',
  asyncHandler(async (req, res) => {
    const trail = await outputs.getWhyTrail(Number(req.params.id))
    if (trail.length === 0) {
      res.status(404).json({ detail: 'Output not found' })
      return
    }
    res.json(trail)
  })
)

/** Loads prior Q&A for a report without asking a new question — backs
 * the Ask panel on report detail pages. */
router.get(
  '/outputs/:id/ask-history',
  asyncHandler(async (req, res) => {
    res.json(await askModule.getAskHistory(Number(req.params.id)))
  })
)

router.post(
  '/ask',
  asyncHandler(async (req, res) => {
    const { output_id: outputId, question } = req.body
    try {
      const askId = await askModule.ask(outputId, question)
      const history = await askModule.getAskHistory(outputId)
      res.json({ ask_id: askId, history })
    } catch (err) {
      res.status(400).json({ detail: err instanceof Error ? err.message : String(err) })
    }
  })
)
