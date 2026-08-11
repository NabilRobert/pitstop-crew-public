// CRUD helpers over ai_outputs.

import { query, queryOne } from '../data/db.js'

export interface AiOutput {
  id: number
  agent_type: string
  campaign_id: number | null
  segment_id: number | null
  critiques_id: number | null
  revises_id: number | null
  report_date: string | null
  period: string | null
  content: string
  status: string
  outcome: string | null
  outcome_checked_at: string | null
  grade: string | null
  grade_rationale: string | null
  issues: { quote: string; reason: string }[] | null
  pipeline_run_id: number | null
  created_at: string
}

export interface InsertOutputArgs {
  agentType: string
  content: string
  status?: string
  campaignId?: number | null
  segmentId?: number | null
  critiquesId?: number | null
  revisesId?: number | null
  reportDate?: string | null
  period?: string | null
  /** Set only on critic rows — see schema.sql. */
  grade?: string | null
  gradeRationale?: string | null
  issues?: { quote: string; reason: string }[] | null
  /** Which pipeline_runs row this output belongs to — lets a report be
   * looked up by exact generation, not just report_date. See schema.sql. */
  pipelineRunId?: number | null
}

export async function insertOutput(args: InsertOutputArgs): Promise<number> {
  const rows = await query<{ id: number }>(
    `INSERT INTO ai_outputs
        (agent_type, content, status, campaign_id, segment_id, critiques_id, revises_id, report_date, period,
         grade, grade_rationale, issues, pipeline_run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      args.agentType,
      args.content,
      args.status ?? 'draft',
      args.campaignId ?? null,
      args.segmentId ?? null,
      args.critiquesId ?? null,
      args.revisesId ?? null,
      args.reportDate ?? null,
      args.period ?? null,
      args.grade ?? null,
      args.gradeRationale ?? null,
      args.issues ? JSON.stringify(args.issues) : null,
      args.pipelineRunId ?? null,
    ]
  )
  return rows[0].id
}

export async function updateStatus(outputId: number, status: string): Promise<void> {
  await query('UPDATE ai_outputs SET status = $1 WHERE id = $2', [status, outputId])
}

export async function getOutput(outputId: number): Promise<AiOutput | null> {
  return queryOne<AiOutput>('SELECT * FROM ai_outputs WHERE id = $1', [outputId])
}

export async function getLatestByAgent(agentType: string, period: string): Promise<AiOutput | null> {
  return queryOne<AiOutput>(
    `SELECT * FROM ai_outputs
     WHERE agent_type = $1 AND period = $2 AND status IN ('approved', 'flagged')
     ORDER BY report_date DESC, created_at DESC
     LIMIT 1`,
    [agentType, period]
  )
}

/** Like getLatestByAgent, but pinned to an exact report_date instead of
 * "most recent" — fallback for ai_outputs rows from before pipeline_run_id
 * existed (see getByAgentAndRunId), where date is all we have to go on. */
export async function getByAgentAndDate(
  agentType: string,
  period: string,
  date: string
): Promise<AiOutput | null> {
  return queryOne<AiOutput>(
    `SELECT * FROM ai_outputs
     WHERE agent_type = $1 AND period = $2 AND report_date = $3 AND status IN ('approved', 'flagged')
     ORDER BY created_at DESC
     LIMIT 1`,
    [agentType, period, date]
  )
}

/** Pinned to the exact pipeline run that produced it — the correct way to
 * find "the analysis that belongs with this summary", since two runs on
 * the same report_date (e.g. a manual re-run) each have their own
 * analysis/recommendation/summary trio that must not cross-match. */
export async function getByAgentAndRunId(agentType: string, runId: number): Promise<AiOutput | null> {
  return queryOne<AiOutput>(
    `SELECT * FROM ai_outputs
     WHERE agent_type = $1 AND pipeline_run_id = $2 AND status IN ('approved', 'flagged')
     ORDER BY created_at DESC
     LIMIT 1`,
    [agentType, runId]
  )
}

/** The most recent critique of a given output — backs the grade badge
 * and inline highlight-on-hover UI. Reuses the same lookup getWhyTrail
 * already does inline, factored out since reporting.ts needs it too. */
export async function getLatestCritique(outputId: number): Promise<AiOutput | null> {
  return queryOne<AiOutput>(
    'SELECT * FROM ai_outputs WHERE critiques_id = $1 ORDER BY created_at DESC LIMIT 1',
    [outputId]
  )
}

export interface WhyTrailEntry extends AiOutput {
  critique?: AiOutput
}

/** Walk backward through revises_id/critiques_id to reconstruct the full
 * chain for a given output — backs the "why trail" Standout Feature. */
export async function getWhyTrail(outputId: number): Promise<WhyTrailEntry[]> {
  const trail: WhyTrailEntry[] = []
  let currentId: number | null = outputId
  while (currentId !== null) {
    const row = await getOutput(currentId)
    if (row === null) break
    const entry: WhyTrailEntry = { ...row }
    const critique = await queryOne<AiOutput>('SELECT * FROM ai_outputs WHERE critiques_id = $1', [currentId])
    if (critique) entry.critique = critique
    trail.push(entry)
    currentId = row.revises_id
  }
  return trail.reverse()
}
