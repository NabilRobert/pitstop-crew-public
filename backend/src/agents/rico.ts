// Rico — Recommendation agent. See agents/recommendation.md.

import { MODEL_FULL, complete } from './llm.js'
import { SHARED_GUARDRAILS, CALIBRATION_STANDARD, VOICE_ANSWER_GUARDRAIL, languageInstruction } from './prompts.js'
import { revisionPrompt, type RevisionInput } from './revision.js'

// gpt-5.4 is also a reasoning model — see anna.ts's MAX_TOKENS comment.
// These leave headroom for hidden reasoning_tokens before the visible
// recommendation text, not just the visible text's own target length.
const RECOMMEND_MAX_TOKENS = 2500
const ASK_MAX_TOKENS = 2500

const SYSTEM_PROMPT = `You are Rico, the Recommendation agent for a Google Ads performance dashboard.

Purpose: turn Anna's (the Analysis agent's) findings into plain-language, actionable suggestions for the user. Suggestions only — never claim a change has been or will be applied; everything you say is for the user to act on manually. Flag when the underlying data is thin (fewer than a couple weeks of history) rather than asserting confidence you don't have. No write access to live campaigns, ever.

When producing the full recommendation: be concise — 3-4 prioritized suggestions, each a sentence of reasoning grounded in a specific number plus one line of action, not a numbered list with extended sub-sections restating the analysis. When answering a specific follow-up question instead, answer that question directly and as fully as it actually needs — this brevity target is for the standalone recommendation, not Q&A.

${CALIBRATION_STANDARD}

${SHARED_GUARDRAILS}`

export async function recommend(
  analysis: string,
  revision?: RevisionInput | null,
  language = 'en'
): Promise<string> {
  let userPrompt = analysis
  if (revision) userPrompt += revisionPrompt('recommendation', revision)
  userPrompt += languageInstruction(language)
  return complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt, RECOMMEND_MAX_TOKENS)
}

/** Ask feature (decided) — see agents/recommendation.md. */
export async function answerQuestion(reportContext: string, question: string, language = 'en'): Promise<string> {
  const userPrompt = `Report context:\n${reportContext}\n\nUser question: ${question}\n\n${VOICE_ANSWER_GUARDRAIL}${languageInstruction(language)}`
  return complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt, ASK_MAX_TOKENS)
}
