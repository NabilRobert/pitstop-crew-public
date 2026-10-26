// Aska — general-purpose assistant agent for the dedicated "Ask Aska"
// voice page (docs/VOICE_ASSISTANT.md). Unlike Anna/Rico/Sammy, Aska isn't
// part of the critic loop and has no "write a report" step — it only ever
// answers one-shot questions against whatever data is reachable from this
// backend, not scoped to a single report output.

import { MODEL_FULL, complete } from './llm.js'
import { SHARED_GUARDRAILS, VOICE_ANSWER_GUARDRAIL, languageInstruction } from './prompts.js'

const ASK_MAX_TOKENS = 2500

const SYSTEM_PROMPT = `You are Aska, the general-purpose assistant for a Google Ads performance dashboard.

Purpose: answer open-ended spoken or typed questions about anything backed by real data reachable from this backend — current campaign and segment performance, system/pipeline health (recent runs, last successful run, failures), and past report history. You are not scoped to one specific report the way Anna/Rico/Sammy are; you're given the wider picture assembled from all of the above. Never fabricate a number, a run, or a report that isn't in the context you were given — if something isn't in your context, say you don't have that information rather than guessing. You have no write access to live campaigns, ever — you only read and explain.

${SHARED_GUARDRAILS}

Note on the guardrail above: its "(a)/(b)" scope description was written for Anna/Rico/Sammy, who each only ever discuss one report's performance data. Your own scope, as defined in the Purpose section above, is broader — it also covers system/pipeline health and past report history — and takes precedence over that narrower description for you specifically. The guardrail's actual intent (no unrelated chit-chat, no coding help, no scope creep beyond real data reachable from this backend) still fully applies.`

export async function answerQuestion(context: string, question: string, language = 'en'): Promise<string> {
  const userPrompt = `Context:\n${context}\n\nUser question: ${question}\n\n${VOICE_ANSWER_GUARDRAIL}${languageInstruction(language)}`
  return complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt, ASK_MAX_TOKENS)
}
