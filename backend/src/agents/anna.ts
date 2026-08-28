// Anna — Analysis agent. See agents/analysis.md.

import { MODEL_MINI, MODEL_FULL, complete } from './llm.js'
import { SHARED_GUARDRAILS, CALIBRATION_STANDARD, VOICE_ANSWER_GUARDRAIL, languageInstruction } from './prompts.js'

// gpt-5-mini is a reasoning model, and confirmed live to be far heavier
// on hidden reasoning_tokens than gpt-5.4 (the other agents' model) —
// a real analytical prompt over this project's actual campaign data
// measured reasoning_tokens alone at ~3456 before any visible text, and
// finish_reason:"length" (truncated mid-reasoning, zero visible output)
// at both 1500 and 3000. Explicit reasoning_effort:"low" didn't change
// this. 8000 leaves real margin above the observed need, since reasoning
// token usage isn't fixed run-to-run for the same prompt.
const MAX_TOKENS = 8000

// Ask answers use MODEL_FULL, not MODEL_MINI, despite analyze() above using
// MODEL_MINI for cost reasons. At the budget Rico/Sammy's ask feature uses
// (2500 tokens), gpt-5-mini's hidden reasoning overhead — the same overhead
// that forced MAX_TOKENS to 8000 above — reproduces the same truncation
// (finish_reason:"length", zero visible output) seen with analyze(). gpt-5.4
// doesn't have that failure mode, so it's the safer choice for this budget.
const ASK_MAX_TOKENS = 2500

const SYSTEM_PROMPT = `You are Anna, the Analysis agent for a Google Ads performance dashboard.

Purpose: detect trends, anomalies, and standout audience segment performance from the campaign and segment performance data you're given. State findings and the specific data points that support each one. Do not phrase findings as recommendations — that's a different agent's job. You have no write access to live campaigns; you only read the data provided.

Be concise. Report the 3-4 most important findings, not an exhaustive campaign-by-campaign table — pick what actually matters (the biggest mover, the clearest anomaly, the most notable segment) and cite the specific numbers for those, rather than restating every metric for every campaign. Aim for a few short paragraphs, not a full report.

${CALIBRATION_STANDARD}

${SHARED_GUARDRAILS}`

export async function analyze(
  performanceData: string,
  criticFeedback?: string | null,
  language = 'en'
): Promise<string> {
  let userPrompt = performanceData
  if (criticFeedback) {
    userPrompt += `\n\nCiri (the Critic agent) reviewed your previous analysis and found:\n${criticFeedback}\n\nRevise your analysis to address this.`
  }
  userPrompt += languageInstruction(language)
  return complete(MODEL_MINI, SYSTEM_PROMPT, userPrompt, MAX_TOKENS)
}

/** Ask feature (decided) — see agents/analysis.md. */
export async function answerQuestion(reportContext: string, question: string, language = 'en'): Promise<string> {
  const userPrompt = `Report context:\n${reportContext}\n\nUser question: ${question}\n\n${VOICE_ANSWER_GUARDRAIL}${languageInstruction(language)}`
  return complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt, ASK_MAX_TOKENS)
}
