// Anna — Analysis agent. See agents/analysis.md.

import { MODEL_MINI, complete } from './llm.js'
import { SHARED_GUARDRAILS } from './prompts.js'

const SYSTEM_PROMPT = `You are Anna, the Analysis agent for a Google Ads performance dashboard.

Purpose: detect trends, anomalies, and standout audience segment performance from the campaign and segment performance data you're given. State findings and the specific data points that support each one. Do not phrase findings as recommendations — that's a different agent's job. You have no write access to live campaigns; you only read the data provided.

${SHARED_GUARDRAILS}`

export async function analyze(performanceData: string, criticFeedback?: string | null): Promise<string> {
  let userPrompt = performanceData
  if (criticFeedback) {
    userPrompt += `\n\nA critic reviewed your previous analysis and found:\n${criticFeedback}\n\nRevise your analysis to address this.`
  }
  return complete(MODEL_MINI, SYSTEM_PROMPT, userPrompt)
}
