// Per-run LLM usage accounting. llm.ts reports every response's `usage` here;
// trackRun (pipeline/pipelineRuns.ts) wraps a run in a tracker so those calls
// are attributed to that pipeline_runs row. Calls made outside a tracked run
// (Ask, Aska, voice) find no accumulator and are simply not recorded.
//
// Token counts are always recorded. Dollars are only computed when the model
// has a rate in LLM_PRICES_JSON — deliberately empty by default, so nothing
// here depends on a guessed rate card.

import { AsyncLocalStorage } from 'node:async_hooks'

export interface ModelUsage {
  calls: number
  input_tokens: number
  /** Subset of input_tokens served from the provider's prompt cache. */
  cached_input_tokens: number
  /** Includes reasoning_tokens — providers bill them as output. */
  output_tokens: number
  reasoning_tokens: number
}

export type UsageByModel = Record<string, ModelUsage>

/** The subset of an OpenAI-SDK `response.usage` this module reads. */
export interface RawUsage {
  prompt_tokens?: number | null
  completion_tokens?: number | null
  prompt_tokens_details?: { cached_tokens?: number | null } | null
  completion_tokens_details?: { reasoning_tokens?: number | null } | null
}

/** USD per 1,000,000 tokens. cached_input falls back to the input rate. */
export interface ModelPrice {
  input: number
  output: number
  cached_input?: number
}

const store = new AsyncLocalStorage<UsageByModel>()

export function createUsageTracker() {
  const usage: UsageByModel = {}
  return { usage, run: <T>(fn: () => Promise<T>): Promise<T> => store.run(usage, fn) }
}

export function recordUsage(model: string, raw: RawUsage | null | undefined): void {
  const acc = store.getStore()
  if (!acc || !raw) return
  const m = (acc[model] ??= { calls: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0 })
  m.calls += 1
  m.input_tokens += raw.prompt_tokens ?? 0
  m.cached_input_tokens += raw.prompt_tokens_details?.cached_tokens ?? 0
  m.output_tokens += raw.completion_tokens ?? 0
  m.reasoning_tokens += raw.completion_tokens_details?.reasoning_tokens ?? 0
}

let cachedPrices: Record<string, ModelPrice> | null = null

function isModelPrice(v: unknown): v is ModelPrice {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return (
    typeof p.input === 'number' &&
    typeof p.output === 'number' &&
    (p.cached_input === undefined || typeof p.cached_input === 'number')
  )
}

/** Parsed once from LLM_PRICES_JSON, e.g.
 *   {"gpt-5-mini":{"input":0.25,"cached_input":0.025,"output":2}}
 * Keys are the exact model names passed to the API. A missing/invalid
 * entry means "no rate" — that model's cost stays null. */
export function getPriceTable(): Record<string, ModelPrice> {
  if (cachedPrices) return cachedPrices
  const table: Record<string, ModelPrice> = {}
  const raw = process.env.LLM_PRICES_JSON
  if (raw) {
    try {
      for (const [model, price] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) {
        if (isModelPrice(price)) table[model] = price
        else console.warn(`LLM_PRICES_JSON: ignoring malformed entry for "${model}"`)
      }
    } catch {
      console.warn('LLM_PRICES_JSON is not valid JSON — treating every model as unpriced')
    }
  }
  cachedPrices = table
  return table
}

export interface PricedUsage {
  /** Per-model usage plus that model's cost in USD micros (null = no rate). */
  models: Record<string, ModelUsage & { cost_usd_micros: number | null }>
  /** Sum across models — null if there was no usage or ANY model is unpriced,
   * since a partial total would silently understate the run's cost. */
  totalUsdMicros: number | null
}

// USD-per-1M-tokens × tokens = USD micros exactly (the 1e6s cancel).
export function priceUsage(usage: UsageByModel, prices: Record<string, ModelPrice> = getPriceTable()): PricedUsage {
  const models: PricedUsage['models'] = {}
  let total = 0
  let allPriced = Object.keys(usage).length > 0
  for (const [model, u] of Object.entries(usage)) {
    const p = prices[model]
    let cost: number | null = null
    if (p) {
      const uncached = Math.max(0, u.input_tokens - u.cached_input_tokens)
      cost = Math.round(uncached * p.input + u.cached_input_tokens * (p.cached_input ?? p.input) + u.output_tokens * p.output)
      total += cost
    } else {
      allPriced = false
    }
    models[model] = { ...u, cost_usd_micros: cost }
  }
  return { models, totalUsdMicros: allPriced ? total : null }
}
