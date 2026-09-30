// Formats ai_outputs/pipeline_runs data into (subject, body) email
// content. Content only — emailDelivery.ts (Emil) handles actually sending it.

import { getOutput } from './outputs.js'
import type { RunResult } from '../pipeline/orchestrator.js'

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

/** formatFailureAlert's wording ("no report was generated") doesn't quite
 * fit a backup run — this is the same shape with backup-accurate wording. */
export function formatBackupFailureAlert(errorMessage: string): { subject: string; body: string } {
  const subject = '[ALERT] Pitstop — backup run failed'
  const body = `The database backup run failed and did not complete.\n\nError:\n${errorMessage}\n\nThis needs attention — no backup was created for this run.`
  return { subject, body }
}

/** The dead-man's-switch alert (runDaily.ts) — fires once when a pipeline
 * (daily report generation, or the DB backup) goes stale past its
 * threshold, per-runType alert-state dedupe so it doesn't refire every 15
 * minutes for the same outage. See platform/alertState.ts. */
export function formatDeadMansSwitchAlert(
  runType: string,
  staleHours: number,
  lastRunFinishedAt: string | null
): { subject: string; body: string } {
  const subject = `[ALERT] Pitstop — ${runType} pipeline hasn't run in over ${staleHours}h`
  const body = `The dead-man's-switch has tripped for the ${runType} pipeline. Last successful ${runType} run: ${lastRunFinishedAt ?? 'never'}.\n\nCheck crontab (crontab -l) and logs/run_daily.log on the VPS — the pipeline itself may be fine but never firing (this is exactly what happened on Aug 19-28: crontab was never installed).`
  return { subject, body }
}

/** Deliberately not "[ALERT] ... failed" like the failure formatters above —
 * hitting the monthly spend cap (Settings page, monthly_cost_cap_usd) is the
 * safety mechanism doing its job, not an outage. Still worth an email: a
 * silently-stopped pipeline defeats half the point of having the cap. */
export function formatSpendCeilingAlert(runType: string, capUsd: number, monthToDateUsd: number): { subject: string; body: string } {
  const subject = `Pitstop — ${runType} run skipped (monthly spend cap reached)`
  const body = `The ${runType} run was skipped because the monthly spend cap of $${capUsd.toFixed(2)} has been reached (month to date: $${monthToDateUsd.toFixed(2)}).\n\nThis is the safety limit working as intended, not a failure — no report was generated for this run. Raise the cap from the Settings page if you want reports to resume before the next calendar month.`
  return { subject, body }
}

export function formatWeeklyFeedbackEmail(suggestion: string): { subject: string; body: string } {
  const subject = 'Google Ads Dashboard — Weekly Prompt Suggestion'
  const body = `Ciri found a recurring pattern this week. Suggested prompt patch below — review and apply manually if it looks right. This is never auto-applied.\n\n${suggestion}`
  return { subject, body }
}
