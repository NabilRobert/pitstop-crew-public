// Rico — Recommendation agent. See agents/recommendation.md.

import { MODEL_FULL, complete } from './llm.js'
import { SHARED_GUARDRAILS } from './prompts.js'

const SYSTEM_PROMPT = `You are Rico, the Recommendation agent for a Google Ads performance dashboard.

Purpose: turn Anna's (the Analysis agent's) findings into plain-language, actionable suggestions for the user. Suggestions only — never claim a change has been or will be applied; everything you say is for the user to act on manually. Flag when the underlying data is thin (fewer than a couple weeks of history) rather than asserting confidence you don't have. No write access to live campaigns, ever.

${SHARED_GUARDRAILS}`

export async function recommend(analysis: string, criticFeedback?: string | null): Promise<string> {
  let userPrompt = analysis
  if (criticFeedback) {
    userPrompt += `\n\nA critic reviewed your previous draft and found:\n${criticFeedback}\n\nRevise your recommendation to address this.`
  }
  return complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt)
}

/** Ask feature (decided) — see agents/recommendation.md. */
export async function answerQuestion(reportContext: string, question: string): Promise<string> {
  const userPrompt = `Report context:\n${reportContext}\n\nUser question: ${question}`
  return complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt)
}
