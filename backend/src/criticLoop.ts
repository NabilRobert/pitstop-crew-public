// Ties an agent's generate function to the Critic, enforcing the max-2-
// revisions-per-agent-per-run cap from PROJECT.md's cost guardrails.

import { critique as realCritique, type CriticVerdict } from './critic.js'
import { insertOutput, updateStatus } from './outputs.js'
import { getSettings } from './settings.js'
import { emitEvent } from './eventBus.js'

export const MAX_REVISIONS = 2

export interface RunWithCriticArgs {
  agentType: string
  generate: (criticFeedback: string | null) => Promise<string>
  supportingData: string
  historicalContext: string
  reportDate: string
  period: string
  campaignId?: number | null
  segmentId?: number | null
  /** Injectable for tests — ESM named-export bindings are read-only, so
   * unlike the Python version this can't be monkeypatched from outside;
   * defaults to the real Critic agent. */
  critiqueFn?: (
    agentType: string,
    content: string,
    supportingData: string,
    historicalContext: string
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
    reportDate,
    period,
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
  })

  for (let i = 0; i < MAX_REVISIONS; i++) {
    emitEvent(`Critic reviewing ${agentType}…`)
    const verdict = await critiqueFn(agentType, content, supportingData, historicalContext)
    await insertOutput({
      agentType: 'critic',
      content: verdict.feedback || '(no issues found)',
      critiquesId: currentId,
      reportDate,
      period,
      grade: verdict.grade,
      gradeRationale: verdict.grade_rationale,
      issues: verdict.issues,
    })

    const forcedByGrade = gradeForcesRevision && ['D', 'F'].includes(verdict.grade)
    if (!verdict.has_issues && !forcedByGrade) {
      emitEvent(`Critic: ${agentType} approved — grade ${verdict.grade}`)
      await updateStatus(currentId, 'approved')
      return currentId
    }

    emitEvent(`Critic: ${agentType} flagged (grade ${verdict.grade}) — revising (pass ${i + 1}/${MAX_REVISIONS})`, 'warn')
    content = await generate(verdict.feedback)
    currentId = await insertOutput({
      agentType,
      content,
      status: 'revised',
      reportDate,
      period,
      campaignId,
      segmentId,
      revisesId: currentId,
    })
  }

  emitEvent(`Critic: ${agentType} still flagged after ${MAX_REVISIONS} revisions — leaving as flagged`, 'warn')
  await updateStatus(currentId, 'flagged')
  return currentId
}
