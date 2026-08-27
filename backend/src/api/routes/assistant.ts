// "Ask Aska" general-assistant endpoints — not scoped to one report output,
// unlike /ask in outputs.ts. Mirrors outputs.ts's conversation-thread
// routes as closely as possible; the one difference is there's no
// per-output scoping, since Aska isn't tied to a single report — just one
// flat list of conversation threads.

import { Router } from 'express'
import * as assistantModule from '../../reporting/assistant.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Lists Aska's conversation threads, most-recently-active first — backs
 * the thread picker on the assistant page. */
router.get(
  '/assistant/conversations',
  asyncHandler(async (_req, res) => {
    res.json(await assistantModule.listConversations())
  })
)

/** Starts a new, empty conversation thread — no title until its first
 * question lands (see askAssistant() in reporting/assistant.ts). */
router.post(
  '/assistant/conversations',
  asyncHandler(async (_req, res) => {
    const id = await assistantModule.startConversation()
    res.json({ id })
  })
)

/** Messages within one conversation thread, oldest first. */
router.get(
  '/assistant/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    res.json(await assistantModule.getConversationMessages(Number(req.params.id)))
  })
)

router.post(
  '/assistant/ask',
  asyncHandler(async (req, res) => {
    const { conversation_id: conversationId, question, language } = req.body ?? {}
    if (typeof question !== 'string' || !question.trim()) {
      res.status(400).json({ detail: 'question is required' })
      return
    }
    try {
      const askId = await assistantModule.askAssistant(conversationId, question, language)
      const messages = await assistantModule.getConversationMessages(conversationId)
      res.json({ ask_id: askId, messages })
    } catch (err) {
      res.status(400).json({ detail: err instanceof Error ? err.message : String(err) })
    }
  })
)
