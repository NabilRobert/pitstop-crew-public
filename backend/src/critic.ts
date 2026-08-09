// Critic agent — cross-cutting, not a pipeline step. See agents/critic.md.
// Not yet named (see PROJECT.md sub-agents list).

import { MODEL_FULL, completeJson } from './llm.js'
import { SHARED_GUARDRAILS } from './prompts.js'

const SYSTEM_PROMPT = `You are the Critic agent for a Google Ads performance dashboard.

Purpose: review another agent's output against the data it was based on, looking for holes — weak evidence, thin sample sizes, overconfident claims, contradictions. You do not generate new analysis or recommendations, only critique existing ones. Apply the same scrutiny to confident-sounding output as to hedged output — don't rubber-stamp something just because it reads well.

Respond as JSON: {"has_issues": true or false, "feedback": "..."}. If has_issues is false, feedback must be an empty string.

${SHARED_GUARDRAILS}`

export interface CriticVerdict {
  has_issues: boolean
  feedback: string
}

export async function critique(
  agentType: string,
  content: string,
  supportingData: string
): Promise<CriticVerdict> {
  const userPrompt = `Agent being reviewed: ${agentType}\n\nIts output:\n${content}\n\nUnderlying data it was based on:\n${supportingData}`
  return completeJson<CriticVerdict>(MODEL_FULL, SYSTEM_PROMPT, userPrompt)
}
