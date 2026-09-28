// Ties an agent's generate function to the Critic, enforcing the max-2-
// revisions-per-agent-per-run cap from PROJECT.md's cost guardrails.

import { critique as realCritique, type CriticVerdict } from './critic.js'
import { buildRevisionInput, type RevisionInput } from './revision.js'
import { insertOutput, updateStatus } from '../reporting/outputs.js'
import { getSettings } from '../platform/settings.js'
import { emitEvent } from '../platform/eventBus.js'

export const MAX_REVISIONS = 2

export interface RunWithCriticArgs {
  agentType: string
  generate: (revision: RevisionInput | null) => Promise<string>
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

/** `generate(revision)` is the agent's own call — null on the first pass;
 * on every revision, the previous draft plus the critic's structured issues
 * and feedback (see revision.ts). `reportDate` is the
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
  // A blank first draft (generate() already retried, including with a raised
  // cap) has nothing to fall back on and would otherwise be stored and then
  // graded F — fail the run loudly instead. Same for Rico/Sammy, which would
  // otherwise be fed a blank analysis.
  if (content.trim() === '') {
    emitEvent(`${agentType} returned an empty draft after retries — failing the run rather than storing a blank`, 'error', pipelineRunId)
    throw new Error(`runWithCritic: ${agentType} returned an empty draft after retries`)
  }
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

  // Runs through attempt === MAX_REVISIONS (not just up to it) so the
  // final revision gets critiqued too before the loop gives up — a
  // version that's never critiqued must never be the one left on
  // display, since the frontend falls back to showing an earlier draft's
  // critique next to it otherwise. Only the critique-then-generate half
  // of an iteration is skipped once attempt hits MAX_REVISIONS, so the
  // number of generate() calls is unchanged.
  for (let attempt = 0; attempt <= MAX_REVISIONS; attempt++) {
    emitEvent(`Ciri reviewing ${agentType}…`, 'info', pipelineRunId)
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
      emitEvent(`Ciri: ${agentType} approved — grade ${verdict.grade}`, 'info', pipelineRunId)
      await updateStatus(currentId, 'approved')
      return currentId
    }

    if (attempt === MAX_REVISIONS) {
      emitEvent(`Ciri: ${agentType} still flagged after ${MAX_REVISIONS} revisions — leaving as flagged`, 'warn', pipelineRunId)
      await updateStatus(currentId, 'flagged')
      return currentId
    }

    emitEvent(`Ciri: ${agentType} flagged (grade ${verdict.grade}) — revising (pass ${attempt + 1}/${MAX_REVISIONS})`, 'warn', pipelineRunId)
    const revised = await generate(buildRevisionInput(content, verdict))
    // Never replace a real draft with a blank. The draft being kept was just
    // critiqued (verdict inserted above) and has open issues, so it stays as
    // the flagged final output and we stop revising.
    if (revised.trim() === '') {
      emitEvent(`${agentType}: revision came back empty after retries — keeping the previous draft and stopping`, 'warn', pipelineRunId)
      await updateStatus(currentId, 'flagged')
      return currentId
    }
    content = revised
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

  // Unreachable: the attempt === MAX_REVISIONS branch above always
  // returns before the loop would otherwise exit.
  throw new Error(`runWithCritic: critic loop for ${agentType} exited without a verdict`)
}
