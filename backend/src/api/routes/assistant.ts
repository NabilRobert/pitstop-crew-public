// "Ask Aska" general-assistant endpoints (docs/VOICE_ASSISTANT.md) — not
// scoped to one report output, unlike /ask in outputs.ts.

import { Router } from 'express'
import * as assistantModule from '../../reporting/assistant.js'
import { asyncHandler } from '../asyncHandler.js'

export const router = Router()

/** Loads prior Q&A without asking a new question — backs the assistant
 * page's history view. */
router.get(
  '/assistant/ask-history',
  asyncHandler(async (_req, res) => {
    res.json(await assistantModule.getAssistantAskHistory())
  })
)

router.post(
  '/assistant/ask',
  asyncHandler(async (req, res) => {
    const { question, language } = req.body ?? {}
    if (typeof question !== 'string' || !question.trim()) {
      res.status(400).json({ detail: 'question is required' })
      return
    }
    const askId = await assistantModule.askAssistant(question, language)
    const history = await assistantModule.getAssistantAskHistory()
    res.json({ ask_id: askId, history })
  })
)
