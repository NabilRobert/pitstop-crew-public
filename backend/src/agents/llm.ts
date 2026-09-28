// OpenAI-SDK-shaped client wrapper, routed through Sumopod (OpenAI-
// compatible gateway) rather than OpenAI directly. Kept swappable so
// agent logic can be tested with a fake client, and so a model/provider
// change is a one-line edit.

import OpenAI from 'openai'
import { SUMOPOD_API_KEY, SUMOPOD_BASE_URL } from '../platform/config.js'
import { recordUsage } from '../platform/llmUsage.js'

export const MODEL_MINI = 'gpt-5-mini' // Orca, Anna — see agents/*.md for the reasoning
export const MODEL_FULL = 'gpt-5.4' // Rico, Sammy, Ciri (Critic)

let client: OpenAI | null = null

export function getClient(): OpenAI {
  if (!client) {
    if (!SUMOPOD_API_KEY) throw new Error('sumopod-api-key not set — add it to .env')
    client = new OpenAI({ apiKey: SUMOPOD_API_KEY, baseURL: SUMOPOD_BASE_URL })
  }
  return client
}

const RAISED_CAP_FACTOR = 2
const RAISED_CAP_MAX = 32_000

/** The cap for the last-resort attempt. Undefined when the caller set no
 * cap (nothing to raise) or when it's already at the ceiling. */
function raisedCap(maxTokens: number | undefined): number | undefined {
  if (maxTokens === undefined) return undefined
  const raised = Math.min(maxTokens * RAISED_CAP_FACTOR, RAISED_CAP_MAX)
  return raised > maxTokens ? raised : undefined
}

// A ceiling on completion length, not just a prompt-level "be concise"
// request — without one, nothing bounds how long a single call can run,
// and generation time scales with output tokens. Sized per call site
// (see agent files), not a single global number, since a JSON critic
// response with a rationale + several issues needs more room than a
// short analysis paragraph.
export async function complete(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens?: number,
  overrideClient?: OpenAI
): Promise<string> {
  const c = overrideClient ?? getClient()
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ]
  // Reasoning models can burn the whole max_completion_tokens budget on
  // hidden reasoning before writing any visible text, returning an empty
  // string with no error (see anna.ts). Attempts 1-2 use the caller's cap
  // (re-running the same prompt usually lands under budget). If both come
  // back empty because the budget ran out, attempt 3 uses a raised cap —
  // otherwise a prompt that legitimately needs more room fails identically
  // every time. Still returns '' if all attempts are empty; callers that
  // persist the result must not store a blank (see criticLoop.ts).
  for (let attempt = 0; attempt < 3; attempt++) {
    const cap = attempt < 2 ? maxTokens : raisedCap(maxTokens)
    if (attempt === 2 && cap === undefined) break
    const response = await c.chat.completions.create({ model, max_completion_tokens: cap, messages })
    // Recorded per attempt, not per return — every empty-content retry is
    // a separate billed call.
    recordUsage(model, response.usage)
    const choice = response.choices[0]
    const content = choice.message.content ?? ''
    if (content.trim() !== '') return content
    // finish_reason 'length' is the budget-exhaustion signature. Anything
    // else explicitly reported (e.g. content_filter) won't be fixed by a
    // bigger cap, so don't pay for a third attempt.
    if (attempt === 1 && choice.finish_reason && choice.finish_reason !== 'length') break
    console.warn(`complete(${model}): empty output on attempt ${attempt + 1} (finish_reason=${choice.finish_reason}, cap=${cap})`)
  }
  return ''
}

export async function completeJson<T = any>(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens?: number,
  overrideClient?: OpenAI
): Promise<T> {
  const c = overrideClient ?? getClient()
  const response = await c.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })
  recordUsage(model, response.usage)
  return JSON.parse(response.choices[0].message.content ?? '{}') as T
}
