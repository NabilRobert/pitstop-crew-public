// Formats ai_outputs/pipeline_runs data into (subject, body) email
// content. Content only — emailDelivery.ts handles actually sending it.

import { getOutput } from './outputs.js'
import type { RunResult } from './orchestrator.js'

export async function formatReportEmail(
  result: RunResult,
  targetDate: string,
  period: string
): Promise<{ subject: string; body: string }> {
  const analysis = await getOutput(result.analysisId)
  const recommendation = await getOutput(result.recommendationId)
  const summary = await getOutput(result.summaryId)

  const subject = `Google Ads ${period[0].toUpperCase()}${period.slice(1)} Report — ${targetDate}`
  const body = [
    `SUMMARY\n${summary?.content}`,
    `RECOMMENDATION\n${recommendation?.content}`,
    `ANALYSIS\n${analysis?.content}`,
  ].join('\n\n')
  return { subject, body }
}

export function formatFailureAlert(runType: string, errorMessage: string): { subject: string; body: string } {
  const subject = `[ALERT] Google Ads Dashboard — ${runType} run failed`
  const body = `The ${runType} pipeline run failed and did not complete.\n\nError:\n${errorMessage}\n\nThis needs attention — no report was generated for this run.`
  return { subject, body }
}

export function formatWeeklyFeedbackEmail(suggestion: string): { subject: string; body: string } {
  const subject = 'Google Ads Dashboard — Weekly Prompt Suggestion'
  const body = `The critic found a recurring pattern this week. Suggested prompt patch below — review and apply manually if it looks right. This is never auto-applied.\n\n${suggestion}`
  return { subject, body }
}
