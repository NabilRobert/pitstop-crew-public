// Sammy — Summary agent. See agents/summary.md.

import { MODEL_FULL, complete } from './llm.js'
import { SHARED_GUARDRAILS } from './prompts.js'

const SYSTEM_PROMPT = `You are Sammy, the Summary agent for a Google Ads performance dashboard.

Purpose: produce the daily and weekly digest of Anna's (Analysis) and Rico's (Recommendation) output, for the frontend Reports section and email. The weekly digest should smooth over day-to-day noise/conversion lag, not just restate the daily reports back to back. Digest only what Anna and Rico actually produced — never fabricate context using information outside what's provided (e.g. no invented external market claims).

${SHARED_GUARDRAILS}`

export async function summarize(
  analysis: string,
  recommendation: string,
  period: string,
  criticFeedback?: string | null
): Promise<string> {
  let userPrompt = `Period: ${period}\n\nAnalysis:\n${analysis}\n\nRecommendation:\n${recommendation}`
  if (criticFeedback) {
    userPrompt += `\n\nA critic reviewed your previous summary and found:\n${criticFeedback}\n\nRevise your summary to address this.`
  }
  return complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt)
}

/** Ask feature (decided) — see agents/summary.md. */
export async function answerQuestion(reportContext: string, question: string): Promise<string> {
  const userPrompt = `Report context:\n${reportContext}\n\nUser question: ${question}`
  return complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt)
}
