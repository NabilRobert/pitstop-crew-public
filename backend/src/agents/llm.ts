// OpenAI-SDK-shaped client wrapper, routed through Sumopod (OpenAI-
// compatible gateway) rather than OpenAI directly. Kept swappable so
// agent logic can be tested with a fake client, and so a model/provider
// change is a one-line edit.

import OpenAI from 'openai'
import { SUMOPOD_API_KEY, SUMOPOD_BASE_URL } from '../platform/config.js'
import { recordUsage, priceCallUsd } from '../platform/llmUsage.js'
import { span } from '../platform/trace.js'

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

type ChatRequest = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming

/** One API call, recorded as an 'llm_call' trace step: model, tokens, cost
 * (when a price is configured), the full prompt and the response text.
 * `problem` inspects the returned text and, when it is unusable (blank,
 * truncated JSON), returns why — the step is then marked as an error even
 * though the HTTP call itself succeeded. */
async function tracedCall(
  c: OpenAI,
  req: ChatRequest,
  attempt: number,
  problem: (content: string) => string | null
): Promise<OpenAI.Chat.ChatCompletion> {
  return span(
    'llm_call',
    req.model,
    async (s) => {
      const response = await c.chat.completions.create(req)
      const choice = response.choices[0]
      const content = choice.message.content ?? ''
      const usage = response.usage
      const issue = problem(content)
      s.set({
        model: req.model,
        tokensIn: usage?.prompt_tokens ?? null,
        tokensOut: usage?.completion_tokens ?? null,
        costUsd: priceCallUsd(req.model, usage),
        status: issue ? 'error' : 'ok',
        errorMessage: issue,
        summary: `${usage?.prompt_tokens ?? '?'} in → ${usage?.completion_tokens ?? '?'} out, finish_reason=${choice.finish_reason}${issue ? ` — ${issue}` : ''}`,
        meta: {
          attempt,
          max_completion_tokens: req.max_completion_tokens ?? null,
          reasoning_effort: (req as { reasoning_effort?: string }).reasoning_effort ?? null,
          json: req.response_format?.type === 'json_object',
          finish_reason: choice.finish_reason,
          cached_tokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
          reasoning_tokens: usage?.completion_tokens_details?.reasoning_tokens ?? null,
        },
      })
      s.payload('prompt', req.messages.map((m) => `[${m.role}]\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n'))
      s.payload('response', content)
      return response
    },
    { attempt }
  )
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
    const response = await tracedCall(c, { model, max_completion_tokens: cap, messages }, attempt + 1, (text) =>
      text.trim() === '' ? 'empty output' : null
    )
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

/** Thrown by completeJson when neither attempt produced parseable JSON.
 * Callers that can degrade gracefully (the critic) catch this; anything
 * else still fails loudly, as before. */
export class LlmJsonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmJsonError'
  }
}

export type ReasoningEffort = 'low' | 'medium' | 'high'

/** Recovers from an empty or truncated response instead of letting
 * JSON.parse throw and kill the run: one retry with a raised cap (the same
 * ceiling complete() uses), then LlmJsonError. A response cut off at the
 * cap is invalid JSON, so it lands here too. Usage is recorded for every
 * billed attempt. `reasoningEffort` is passed through when set. */
export async function completeJson<T = any>(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens?: number,
  overrideClient?: OpenAI,
  opts: { reasoningEffort?: ReasoningEffort } = {}
): Promise<T> {
  const c = overrideClient ?? getClient()
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ]
  let lastFinish: string | null | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    const cap = attempt === 0 ? maxTokens : (raisedCap(maxTokens) ?? maxTokens)
    const response = await tracedCall(
      c,
      {
        model,
        response_format: { type: 'json_object' },
        max_completion_tokens: cap,
        messages,
        ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
      },
      attempt + 1,
      (text) => {
        if (text.trim() === '') return 'empty output'
        try {
          JSON.parse(text)
          return null
        } catch {
          return 'unparseable JSON (likely truncated)'
        }
      }
    )
    recordUsage(model, response.usage)
    const choice = response.choices[0]
    lastFinish = choice.finish_reason
    const content = choice.message.content ?? ''
    if (content.trim() !== '') {
      try {
        return JSON.parse(content) as T
      } catch {
        // truncated or malformed — fall through to the retry
      }
    }
    console.warn(`completeJson(${model}): empty/unparseable output on attempt ${attempt + 1} (finish_reason=${choice.finish_reason}, cap=${cap})`)
  }
  throw new LlmJsonError(`${model} returned no parseable JSON after 2 attempts (last finish_reason=${lastFinish})`)
}
