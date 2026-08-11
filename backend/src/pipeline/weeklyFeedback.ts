// Weekly feedback job — reads the past week's critic critiques and drafts
// a suggested prompt patch. NOT auto-applied; the returned text is meant
// to be surfaced via the reporting channels (frontend + email) for manual
// review. See PROJECT.md → "Critic feedback loop" and agents/critic.md →
// "Feedback loop".

import { query } from '../data/db.js'
import { MODEL_FULL, complete } from '../agents/llm.js'
import { trackRun } from './pipelineRuns.js'

// See anna.ts's MAX_TOKENS comment — reasoning models spend an
// unpredictable share of the budget on hidden reasoning tokens first.
const MAX_TOKENS = 2500

const SYSTEM_PROMPT = `You are drafting a weekly prompt-improvement suggestion for a Google Ads AI dashboard's agent team (Anna/analysis, Rico/recommendation, Sammy/summary).

You'll be given this week's critic critiques, each tagged with which agent it was about. Look for recurring patterns — the same kind of issue flagged more than once for the same agent — and draft a specific, concrete suggested edit to that agent's system prompt to address it. If an agent has no recurring pattern (only one-off critiques, or none), say so and suggest nothing for it. Do not invent patterns that aren't actually there across multiple critiques.

This is a suggestion for a human to review and apply manually — never phrase it as something you're doing yourself.`

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface WeekCritique {
  content: string
  reviewed_agent_type: string
}

async function getWeekCritiques(asOf: string): Promise<WeekCritique[]> {
  const start = addDays(asOf, -7)
  return query<WeekCritique>(
    `SELECT critic.content, reviewed.agent_type AS reviewed_agent_type
     FROM ai_outputs critic
     JOIN ai_outputs reviewed ON reviewed.id = critic.critiques_id
     WHERE critic.agent_type = 'critic'
       AND critic.content != '(no issues found)'
       AND critic.created_at >= $1
     ORDER BY critic.created_at`,
    [start]
  )
}

/** Returns the suggestion text, or null if there were no critiques this
 * week to learn from. Persists the suggestion (see weekly_feedback_suggestions
 * in schema.sql) so the Learning page can show a history of what's been
 * suggested over time — previously this was only ever emailed and discarded. */
export async function runWeeklyFeedback(asOf?: string): Promise<string | null> {
  const target = asOf ?? new Date().toISOString().slice(0, 10)
  return trackRun('weekly_feedback', async () => {
    const critiques = await getWeekCritiques(target)
    if (critiques.length === 0) return null
    const userPrompt = critiques.map((c) => `[${c.reviewed_agent_type}] ${c.content}`).join('\n\n')
    const suggestion = await complete(MODEL_FULL, SYSTEM_PROMPT, userPrompt, MAX_TOKENS)
    await query('INSERT INTO weekly_feedback_suggestions (week_of, content) VALUES ($1, $2)', [
      target,
      suggestion,
    ])
    return suggestion
  })
}
