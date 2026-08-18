// OpenAI-SDK-shaped client wrapper, routed through Sumopod (OpenAI-
// compatible gateway) rather than OpenAI directly. Kept swappable so
// agent logic can be tested with a fake client, and so a model/provider
// change is a one-line edit.

import OpenAI from 'openai'
import { SUMOPOD_API_KEY, SUMOPOD_BASE_URL } from '../platform/config.js'

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

// A ceiling on completion length, not just a prompt-level "be concise"
// request — without one, nothing bounds how long a single call can run,
// and generation time scales with output tokens. Sized per call site
// (see agent files), not a single global number, since a JSON critic
// response with a rationale + several issues needs more room than a
// short analysis paragraph.
// Reasoning models (see MODEL_MINI's comment) can exhaust max_completion_tokens
// entirely on hidden reasoning before writing any visible text, returning an
// empty completion with no error — observed live, not a theoretical edge case.
// One retry is usually enough since it isn't deterministic; if it's still
// empty after that, the caller gets '' back and has to decide what to do,
// same as before this existed.
const EMPTY_COMPLETION_RETRIES = 1

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
  for (let attempt = 0; attempt <= EMPTY_COMPLETION_RETRIES; attempt++) {
    const response = await c.chat.completions.create({ model, max_completion_tokens: maxTokens, messages })
    const content = response.choices[0].message.content ?? ''
    if (content.trim() || attempt === EMPTY_COMPLETION_RETRIES) return content
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
  return JSON.parse(response.choices[0].message.content ?? '{}') as T
}
