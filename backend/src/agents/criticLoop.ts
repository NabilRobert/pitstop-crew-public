// Ties an agent's generate function to the Critic, enforcing the max-2-
// revisions-per-agent-per-run cap from PROJECT.md's cost guardrails.

import { critique as realCritique, decideApproval, normalizeVerdict, findUnverifiedQuotes, type CriticVerdict } from './critic.js'
import { buildRevisionInput, type RevisionInput } from './revision.js'
import { insertOutput, updateStatus } from '../reporting/outputs.js'
import { getSettings } from '../platform/settings.js'
import { emitEvent } from '../platform/eventBus.js'
import { span, event, type Span } from '../platform/trace.js'

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
export function runWithCritic(args: RunWithCriticArgs): Promise<number> {
  const label = AGENT_LABELS[args.agentType] ?? args.agentType
  return span('agent', `${label} (${args.agentType})`, (agentSpan) => runCriticLoop(args, agentSpan), {
    agent_type: args.agentType,
    report_date: args.reportDate,
    period: args.period,
  })
}

const AGENT_LABELS: Record<string, string> = { analysis: 'Anna', recommendation: 'Rico', summary: 'Sammy' }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** What the trace records about one critic verdict. */
function describeReview(v: CriticVerdict) {
  const count = (sev: string) => v.issues.filter((i) => i.severity === sev).length
  const high = count('high')
  const medium = count('medium')
  const low = count('low')
  return {
    status: v.unavailable ? ('error' as const) : ('ok' as const),
    errorMessage: v.unavailable ? 'critic review unavailable (no parseable response after retries)' : null,
    summary: v.unavailable
      ? 'review unavailable'
      : `grade ${v.grade ?? '?'} · ${v.issues.length === 0 ? 'no issues' : `${high} high, ${medium} medium, ${low} low`}`,
    meta: {
      grade: v.grade,
      has_issues: v.has_issues,
      unavailable: !!v.unavailable,
      issue_counts: { high, medium, low },
      issues: v.issues.map((i) => ({ quote: clip(i.quote, 500), reason: clip(i.reason, 500), severity: i.severity })),
      feedback: clip(v.feedback, 1000),
      grade_rationale: clip(v.grade_rationale, 1000),
    },
  }
}

async function runCriticLoop(args: RunWithCriticArgs, agentSpan: Span): Promise<number> {
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

  let reviews = 0
  // Records the outcome on the trace (a 'decision' step + the agent's summary)
  // and sets the draft's final status.
  const conclude = async (status: 'approved' | 'flagged', name: string, reason: string, verdict: CriticVerdict): Promise<number> => {
    await updateStatus(currentId, status)
    await event('decision', name, { summary: reason, meta: { outcome: status, reason, grade: verdict.grade, review: reviews } })
    agentSpan.set({
      summary: `${status} after ${reviews} review${reviews === 1 ? '' : 's'}`,
      meta: { output_id: currentId, final_status: status, reviews, revisions: reviews - 1 },
    })
    return currentId
  }

  // Runs through attempt === MAX_REVISIONS (not just up to it) so the
  // final revision gets critiqued too before the loop gives up — a
  // version that's never critiqued must never be the one left on
  // display, since the frontend falls back to showing an earlier draft's
  // critique next to it otherwise. Only the critique-then-generate half
  // of an iteration is skipped once attempt hits MAX_REVISIONS, so the
  // number of generate() calls is unchanged.
  for (let attempt = 0; attempt <= MAX_REVISIONS; attempt++) {
    emitEvent(`Ciri reviewing ${agentType}…`, 'info', pipelineRunId)
    reviews = attempt + 1
    const verdict = await span(
      'critic_review',
      `Ciri reviews ${agentType} (pass ${reviews})`,
      async (reviewSpan) => {
        // Normalized here too (idempotent) so a raw verdict from any critiqueFn
        // is fail-safe: missing severity -> high, missing grade -> blocks approval.
        const v = normalizeVerdict(await critiqueFn(agentType, content, supportingData, historicalContext, language))
        // Purely observational: the rubric requires every quote to be a
        // verbatim substring, but that's only ever a prompt instruction. The
        // frontend already fails soft on a non-matching quote (skips that
        // one highlight, doesn't break rendering), so this doesn't change
        // grading or drop the issue — it just makes a silent quality signal
        // visible in the logs instead of invisible.
        const unverified = findUnverifiedQuotes(v.issues, content)
        if (unverified.length > 0) {
          console.warn(
            `criticLoop: Ciri's review of ${agentType} (pass ${reviews}) has ${unverified.length} issue(s) whose quote isn't a verbatim substring of the reviewed content`
          )
        }
        reviewSpan.set(describeReview(v))
        return v
      },
      { agent_type: agentType, pass: reviews, draft_id: currentId, draft_chars: content.length }
    )
    await insertOutput({
      agentType: 'critic',
      // Fall back to the issue reasons rather than '(no issues found)' when
      // there are issues but the model left its feedback paragraph empty.
      content: verdict.feedback || (verdict.issues.length ? verdict.issues.map((i) => i.reason).join(' ') : '(no issues found)'),
      critiquesId: currentId,
      reportDate,
      period,
      pipelineRunId,
      grade: verdict.grade,
      gradeRationale: verdict.grade_rationale,
      issues: verdict.issues,
    })

    // No review could be produced (blank/unparseable after retries): nothing
    // to act on, so don't revise and don't approve — leave the draft flagged.
    if (verdict.unavailable) {
      emitEvent(`Ciri: review of ${agentType} unavailable — leaving the draft flagged without revising`, 'warn', pipelineRunId)
      return conclude('flagged', 'Flag: review unavailable', 'critic review unavailable — draft left flagged without revising', verdict)
    }

    // Approval is derived from severities and grade, not the model's
    // has_issues boolean — see critic.ts decideApproval. Medium/low issues
    // don't block: the output is approved with notes, and every issue is
    // still stored and shown.
    const decision = decideApproval(verdict, gradeForcesRevision)
    if (decision.approved) {
      emitEvent(`Ciri: ${agentType} approved — ${decision.reason}`, 'info', pipelineRunId)
      return conclude('approved', 'Approve', decision.reason, verdict)
    }

    if (attempt === MAX_REVISIONS) {
      emitEvent(`Ciri: ${agentType} still flagged after ${MAX_REVISIONS} revisions (${decision.reason}) — leaving as flagged`, 'warn', pipelineRunId)
      return conclude('flagged', 'Flag: revision cap reached', `${decision.reason} — still blocked after ${MAX_REVISIONS} revisions`, verdict)
    }

    emitEvent(`Ciri: ${agentType} flagged (${decision.reason}) — revising (pass ${attempt + 1}/${MAX_REVISIONS})`, 'warn', pipelineRunId)
    await event('decision', 'Revise', {
      summary: `${decision.reason} — revising (pass ${attempt + 1}/${MAX_REVISIONS})`,
      meta: { outcome: 'revise', reason: decision.reason, grade: verdict.grade, review: reviews },
    })
    const revised = await span(
      'revision',
      `${agentType} revision ${attempt + 1}`,
      async (revisionSpan) => {
        const r = await generate(buildRevisionInput(content, verdict))
        const blank = r.trim() === ''
        revisionSpan.set({
          status: blank ? 'skipped' : 'ok',
          summary: blank ? 'blank revision discarded' : `${r.length} chars (was ${content.length}), addressing ${verdict.issues.length} issue(s)`,
          meta: { issues_addressed: verdict.issues.length, previous_chars: content.length, new_chars: r.length },
        })
        return r
      },
      { agent_type: agentType, pass: attempt + 1 }
    )
    // Never replace a real draft with a blank. The draft being kept was just
    // critiqued (verdict inserted above) and has open issues, so it stays as
    // the flagged final output and we stop revising.
    if (revised.trim() === '') {
      emitEvent(`${agentType}: revision came back empty after retries — keeping the previous draft and stopping`, 'warn', pipelineRunId)
      return conclude('flagged', 'Flag: blank revision', 'revision came back empty after retries — kept the previous draft', verdict)
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
