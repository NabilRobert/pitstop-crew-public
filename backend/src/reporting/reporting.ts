// Structured data queries backing the frontend dashboard — distinct from
// context.ts, which formats the same data as prompt text for agents.

import { query } from '../data/db.js'
import {
  getByAgentAndDate,
  getByAgentAndRunId,
  getLatestByAgent,
  getLatestCritique,
  getOutput,
  type AiOutput,
} from './outputs.js'

/** Attaches the output's most recent critique (grade, rationale, issues)
 * so the frontend gets everything a report section needs in one request —
 * backs the grade badge and inline highlight-on-hover UI.
 *
 * A 'flagged' status can mean two different things: the critic approved
 * on a later pass that still left it flagged (uncommon), or — far more
 * commonly — the revision loop hit MAX_REVISIONS and exited without ever
 * re-critiquing the last revision it generated (see criticLoop.ts: the
 * final `currentId` after the last revision is never itself critiqued
 * before the loop ends). In that case there's no critique row with
 * critiques_id = output.id at all — only one pointing at output.revises_id,
 * the draft that prompted that last revision. Fall back to that. */
async function attachCritique(output: AiOutput | null) {
  if (!output) return null
  let critique = await getLatestCritique(output.id)
  if (!critique && output.revises_id) {
    critique = await getLatestCritique(output.revises_id)
  }
  return {
    ...output,
    critique: critique
      ? {
          grade: critique.grade,
          grade_rationale: critique.grade_rationale,
          issues: critique.issues,
          content: critique.content,
        }
      : null,
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function listCampaigns() {
  return query('SELECT id, name, status, data_source FROM campaigns ORDER BY name')
}

/** Aggregate segment_performance over a window — backs the dashboard's
 * segment breakdown chart (device/geography/custom). */
export async function getSegmentBreakdown(days = 30, endDate?: string) {
  const end = endDate ?? new Date().toISOString().slice(0, 10)
  const start = addDays(end, -days)
  return query(
    `SELECT s.segment_type, s.segment_value,
            SUM(sp.impressions) AS impressions, SUM(sp.clicks) AS clicks,
            SUM(sp.cost_micros) AS cost_micros, SUM(sp.conversions) AS conversions
     FROM segment_performance sp
     JOIN segments s ON s.id = sp.segment_id
     WHERE sp.date BETWEEN $1 AND $2
     GROUP BY s.segment_type, s.segment_value
     ORDER BY s.segment_type, conversions DESC`,
    [start, end]
  )
}

export async function getPerformanceSeries(days = 30, endDate?: string) {
  const end = endDate ?? new Date().toISOString().slice(0, 10)
  const start = addDays(end, -days)
  return query(
    `SELECT cp.date, c.id AS campaign_id, c.name AS campaign,
            cp.impressions, cp.clicks, cp.cost_micros, cp.conversions
     FROM campaign_performance cp
     JOIN campaigns c ON c.id = cp.campaign_id
     WHERE cp.date BETWEEN $1 AND $2
     ORDER BY cp.date, c.name`,
    [start, end]
  )
}

/** Finds the analysis/recommendation that belong with a given summary —
 * pinned to the exact pipeline run that produced all three when available
 * (pipeline_run_id), falling back to "latest for this report_date" only
 * for rows from before that column existed. Without this, two runs on the
 * same report_date (e.g. a manual re-run) could each report "the latest
 * analysis" independently and mismatch — a new analysis paired with a
 * stale recommendation/summary from a different run entirely. */
async function getSiblings(summary: AiOutput | null) {
  if (!summary) return { analysis: null, recommendation: null }
  if (summary.pipeline_run_id != null) {
    return {
      analysis: await getByAgentAndRunId('analysis', summary.pipeline_run_id),
      recommendation: await getByAgentAndRunId('recommendation', summary.pipeline_run_id),
    }
  }
  if (summary.period && summary.report_date) {
    return {
      analysis: await getByAgentAndDate('analysis', summary.period, summary.report_date),
      recommendation: await getByAgentAndDate('recommendation', summary.period, summary.report_date),
    }
  }
  return { analysis: null, recommendation: null }
}

/** The most recent finalized analysis/recommendation/summary trio for a
 * period — backs "today's report" on the dashboard without the frontend
 * needing to already know specific ai_outputs ids. */
export async function getLatestReport(period: string) {
  const summary = await getLatestByAgent('summary', period)
  const { analysis, recommendation } = await getSiblings(summary)
  return {
    analysis: await attachCritique(analysis),
    recommendation: await attachCritique(recommendation),
    summary: await attachCritique(summary),
  }
}

/** One row per generated report, keyed off the summary agent since every
 * pipeline run produces exactly one Sammy summary — backs the report
 * history list page. Every generation is its own entry now, including
 * same-day re-runs — see getSiblings for why that's now safe to do
 * without creating an unreachable/ambiguous entry. */
export async function listReportDates(period: string) {
  return query(
    `SELECT id, report_date, status, created_at, LEFT(content, 200) AS preview
     FROM ai_outputs
     WHERE agent_type = 'summary' AND period = $1 AND status IN ('approved', 'flagged')
       AND report_date IS NOT NULL
     ORDER BY created_at DESC`,
    [period]
  )
}

/** Same shape as getLatestReport, but pinned to the exact summary row's
 * id — backs the report detail page. Keying off the summary's own id
 * (rather than report_date) is what makes same-day re-runs individually
 * reachable, since ai_outputs.id is always unique per row. */
export async function getReportById(summaryId: number) {
  const summaryRow = await getOutput(summaryId)
  const summary = summaryRow && summaryRow.agent_type === 'summary' ? summaryRow : null
  const { analysis, recommendation } = await getSiblings(summary)
  return {
    analysis: await attachCritique(analysis),
    recommendation: await attachCritique(recommendation),
    summary: await attachCritique(summary),
  }
}
