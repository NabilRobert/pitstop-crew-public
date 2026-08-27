// Ask Aska feature (docs/VOICE_ASSISTANT.md) — general Q&A not scoped to
// one report output, backing the dedicated assistant page. Parallel to
// reporting/ask.ts's per-report Q&A, but gathers account-wide context
// (performance, pipeline health, report history) instead of one output's
// content — a new table (assistant_ask_log) logs it, since ask_log's
// output_id is NOT NULL and a general question has no single output to
// point at.

import * as aska from '../agents/assistant.js'
import { buildPerformanceContext } from '../data/context.js'
import * as pipelineRuns from '../pipeline/pipelineRuns.js'
import { listReportDates } from './reporting.js'
import { getSettings, isValidLanguage } from '../platform/settings.js'
import { query } from '../data/db.js'

const RECENT_REPORTS_LIMIT = 5
const PERFORMANCE_WINDOW_DAYS = 30

async function buildAssistantContext(): Promise<string> {
  const performanceData = await buildPerformanceContext({ days: PERFORMANCE_WINDOW_DAYS })

  const lastDaily = await pipelineRuns.getLastSuccessfulRun('daily')
  const recentRuns = await pipelineRuns.getRecentRuns(undefined, 10)
  const systemHealth = `Last successful daily run: ${JSON.stringify(lastDaily)}\nRecent pipeline runs: ${JSON.stringify(recentRuns)}`

  const recentDaily = (await listReportDates('daily')).slice(0, RECENT_REPORTS_LIMIT)
  const recentWeekly = (await listReportDates('weekly')).slice(0, RECENT_REPORTS_LIMIT)
  const reportHistory = `Recent daily reports:\n${JSON.stringify(recentDaily)}\n\nRecent weekly reports:\n${JSON.stringify(recentWeekly)}`

  return `Campaign/segment performance (last ${PERFORMANCE_WINDOW_DAYS} days):\n${performanceData}\n\nSystem/pipeline health:\n${systemHealth}\n\nRecent report history:\n${reportHistory}`
}

// language is the live UI's current locale, same rationale as ask.ts's
// ask() — falls back to the report_language Settings value only when the
// caller doesn't provide one.
export async function askAssistant(question: string, language?: string): Promise<number> {
  const context = await buildAssistantContext()
  const validLanguage = language !== undefined && isValidLanguage(language) ? language : undefined
  const resolvedLanguage = validLanguage ?? (await getSettings()).report_language
  const answer = await aska.answerQuestion(context, question, resolvedLanguage)
  const rows = await query<{ id: number }>(
    'INSERT INTO assistant_ask_log (question, answer) VALUES ($1, $2) RETURNING id',
    [question, answer]
  )
  return rows[0].id
}

export async function getAssistantAskHistory() {
  return query('SELECT * FROM assistant_ask_log ORDER BY created_at DESC LIMIT 50')
}
