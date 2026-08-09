// OpenAI-SDK-shaped client wrapper, routed through Sumopod (OpenAI-
// compatible gateway) rather than OpenAI directly. Kept swappable so
// agent logic can be tested with a fake client, and so a model/provider
// change is a one-line edit.

import OpenAI from 'openai'
import { SUMOPOD_API_KEY, SUMOPOD_BASE_URL } from './config.js'

export const MODEL_MINI = 'gpt-5-mini' // Orca, Anna — see agents/*.md for the reasoning
export const MODEL_FULL = 'gpt-5.4' // Rico, Sammy, Critic

let client: OpenAI | null = null

export function getClient(): OpenAI {
  if (!client) {
    if (!SUMOPOD_API_KEY) throw new Error('sumopod-api-key not set — add it to .env')
    client = new OpenAI({ apiKey: SUMOPOD_API_KEY, baseURL: SUMOPOD_BASE_URL })
  }
  return client
}

export async function complete(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  overrideClient?: OpenAI
): Promise<string> {
  const c = overrideClient ?? getClient()
  const response = await c.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })
  return response.choices[0].message.content ?? ''
}

export async function completeJson<T = any>(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  overrideClient?: OpenAI
): Promise<T> {
  const c = overrideClient ?? getClient()
  const response = await c.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })
  return JSON.parse(response.choices[0].message.content ?? '{}') as T
}
