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

/** Lists this report's Ask conversation threads, most-recently-active
 * first — backs the thread picker in the Ask panel. */
router.get(
  '/outputs/:id/ask-conversations',
  asyncHandler(async (req, res) => {
    const outputId = Number(req.params.id)
    const output = await outputs.getOutput(outputId)
    if (output === null) {
      res.status(404).json({ detail: 'Output not found' })
      return
    }
    res.json(await askModule.listConversations(outputId))
  })
)

/** Starts a new, empty conversation thread for this report — no title
 * until its first question lands (see ask() in reporting/ask.ts). */
router.post(
  '/outputs/:id/ask-conversations',
  asyncHandler(async (req, res) => {
    const outputId = Number(req.params.id)
    const output = await outputs.getOutput(outputId)
    if (output === null) {
      res.status(404).json({ detail: 'Output not found' })
      return
    }
    const id = await askModule.startConversation(outputId)
    res.json({ id })
  })
)

/** Messages within one conversation thread, oldest first. */
router.get(
  '/ask-conversations/:id/messages',
  asyncHandler(async (req, res) => {
    res.json(await askModule.getConversationMessages(Number(req.params.id)))
  })
)

router.post(
  '/ask',
  asyncHandler(async (req, res) => {
    const { output_id: outputId, conversation_id: conversationId, question, language } = req.body
    try {
      const askId = await askModule.ask(outputId, conversationId, question, language)
      const messages = await askModule.getConversationMessages(conversationId)
      res.json({ ask_id: askId, messages })
    } catch (err) {
      res.status(400).json({ detail: err instanceof Error ? err.message : String(err) })
    }
  })
)
