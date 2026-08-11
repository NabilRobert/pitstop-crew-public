// Sammy — Summary agent. See agents/summary.md.

import { MODEL_FULL, complete } from './llm.js'
import { SHARED_GUARDRAILS, languageInstruction } from './prompts.js'

// See anna.ts's MAX_TOKENS comment — reasoning models spend an
// unpredictable share of the budget on hidden reasoning before any
// visible text, so this needs real headroom, not just room for the
// digest's own target length.
const SUMMARIZE_MAX_TOKENS = 2000
const ASK_MAX_TOKENS = 2500

const SYSTEM_PROMPT = `You are Sammy, the Summary agent for a Google Ads performance dashboard.

Purpose: produce the daily and weekly digest of Anna's (Analysis) and Rico's (Recommendation) output, for the frontend Reports section and email. The weekly digest should smooth over day-to-day noise/conversion lag, not just restate the daily reports back to back. Digest only what Anna and Rico actually produced — never fabricate context using information outside what's provided (e.g. no invented external market claims).

When producing the digest: this is a headline, not a re-read of the analysis and recommendation. A genuine digest — 3-5 sentences: the single most important thing that happened (with its number), the single most important thing to do about it, done. Do not walk through every section of the analysis or every recommendation Rico made; that's what the full report is for. When answering a specific follow-up question instead, answer that question directly and as fully as it actually needs — this brevity target is for the standalone digest, not Q&A.

${SHARED_GUARDRAILS}`

export async function summarize(
  analysis: string,
  recommendation: string,
  period: string,
  criticFeedback?: string | null,
  language = 'en'
): Promise<string> {
  let userPrompt = `Period: ${period}\n\nAnalysis:\n${analysis}\n\nRecommendation:\n${recommendation}`
  if (criticFeedback) {
    userPrompt += `\n\nCiri (the Critic agent) reviewed your previous summary and found:\n${criticFeedback}\n\nRevise your summary to address this.`
  }
  userPrompt += languageInstruction(language)
  return complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt, SUMMARIZE_MAX_TOKENS)
}

/** Ask feature (decided) — see agents/summary.md. */
export async function answerQuestion(reportContext: string, question: string, language = 'en'): Promise<string> {
  const userPrompt = `Report context:\n${reportContext}\n\nUser question: ${question}${languageInstruction(language)}`
  return complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt, ASK_MAX_TOKENS)
}
