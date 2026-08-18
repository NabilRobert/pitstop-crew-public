// Ties an agent's generate function to the Critic, enforcing the max-2-
// revisions-per-agent-per-run cap from PROJECT.md's cost guardrails.

import { critique as realCritique, type CriticVerdict } from './critic.js'
import { insertOutput, updateStatus } from '../reporting/outputs.js'
import { getSettings } from '../platform/settings.js'
import { emitEvent } from '../platform/eventBus.js'

export const MAX_REVISIONS = 2

export interface RunWithCriticArgs {
  agentType: string
  generate: (criticFeedback: string | null) => Promise<string>
  supportingData: string
  historicalContext: string
  language: string
  reportDate: string
  period: string
  pipelineRunId: number
  campaignId?: number | null
  segmentId?: number | null
  /** Injectable for tests — ESM named-export bindings are read-only, so
   * unlike the Python version this can't be monkeypatched from outside;
   * defaults to the real Critic agent. */
  critiqueFn?: (
    agentType: string,
    content: string,
    supportingData: string,
    historicalContext: string,
    language: string
  ) => Promise<CriticVerdict>
}

/** `generate(criticFeedback)` is the agent's own call — null on the first
 * pass, the critic's feedback text on every revision. `reportDate` is the
 * demo/live "as-of" date this output concerns (deliberately not derived
 * from wall-clock created_at). `period` is "daily" or "weekly", stored so
 * the frontend can ask for "today's report" without already knowing its
 * id. Returns the id of the final ai_outputs row (status 'approved' or
 * 'flagged'). */
export async function runWithCritic(args: RunWithCriticArgs): Promise<number> {
  const {
    agentType,
    generate,
    supportingData,
    historicalContext,
    language,
    reportDate,
    period,
    pipelineRunId,
    campaignId,
    segmentId,
    critiqueFn = realCritique,
  } = args

  const settings = await getSettings()
  const gradeForcesRevision = settings.grade_forces_revision === 'true'

  let content = await generate(null)
  let currentId = await insertOutput({
    agentType,
    content,
    status: 'draft',
    period,
    campaignId,
    segmentId,
    reportDate,
    pipelineRunId,
  })

  // <= MAX_REVISIONS, not <, so the final revision generated on the last
  // pass through this loop still gets its own critique before we give up —
  // otherwise it goes out flagged with no critique of its own, and the
  // frontend falls back to displaying a stale critique of an earlier,
  // different draft next to it (misleading when the two have diverged,
  // e.g. the final revision came back empty but the stale grade didn't).
  for (let attempt = 0; attempt <= MAX_REVISIONS; attempt++) {
    emitEvent(`Ciri reviewing ${agentType}…`)
    const verdict = await critiqueFn(agentType, content, supportingData, historicalContext, language)
    await insertOutput({
      agentType: 'critic',
      content: verdict.feedback || '(no issues found)',
      critiquesId: currentId,
      reportDate,
      period,
      pipelineRunId,
      grade: verdict.grade,
      gradeRationale: verdict.grade_rationale,
      issues: verdict.issues,
    })

    const forcedByGrade = gradeForcesRevision && ['D', 'F'].includes(verdict.grade)
    if (!verdict.has_issues && !forcedByGrade) {
      emitEvent(`Ciri: ${agentType} approved — grade ${verdict.grade}`)
      await updateStatus(currentId, 'approved')
      return currentId
    }

    if (attempt === MAX_REVISIONS) break // out of revisions — the critique above is final

    emitEvent(`Ciri: ${agentType} flagged (grade ${verdict.grade}) — revising (pass ${attempt + 1}/${MAX_REVISIONS})`, 'warn')
    content = await generate(verdict.feedback)
    currentId = await insertOutput({
      agentType,
      content,
      status: 'revised',
      reportDate,
      period,
      pipelineRunId,
      campaignId,
      segmentId,
      revisesId: currentId,
    })
  }

  emitEvent(`Ciri: ${agentType} still flagged after ${MAX_REVISIONS} revisions — leaving as flagged`, 'warn')
  await updateStatus(currentId, 'flagged')
  return currentId
}
