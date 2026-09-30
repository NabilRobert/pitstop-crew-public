// Ciri — Critic agent, cross-cutting, not a pipeline step. See agents/critic.md.

import { MODEL_FULL, completeJson, LlmJsonError } from './llm.js'
import { SHARED_GUARDRAILS, languageInstruction } from './prompts.js'

// gpt-5.4 is a reasoning model (see anna.ts) — confirmed live: 500 tokens
// was enough for hidden reasoning_tokens alone to consume the whole
// budget on a real prompt and leave the visible JSON empty (which fails
// JSON.parse and crashes the run). This is the highest-stakes call to
// get wrong for exactly that reason, so it gets the most headroom.
const MAX_TOKENS = 3000

// Anna's critic runs at medium reasoning effort (see critique()), which
// measured ~2.0k hidden reasoning tokens on top of ~0.5k visible output —
// too close to a 3000 cap, and a truncated response is invalid JSON. Only
// Anna's critic gets the larger cap; Rico's and Sammy's stay as they were.
const ANNA_CRITIC_MAX_TOKENS = 8000

// This rubric is this project's own design principles turned into a
// literal, strict checklist — not new criteria. Kept word-for-word in
// sync with the "Grading criteria" reference on the frontend's Learning
// page (frontend/src/pages/LearningPage.vue) so the model and the human
// reading its grades see the exact same standard.
const GRADING_RUBRIC = `Grade every report strictly against this rubric — do not soften it:

A — Rigorous. Every material claim is grounded in specific numbers from the supplied data. Trend claims are hedged to match sample size (a 2-point or 7-day comparison is called "directional," never "a trend"). Recommendations are phrased as suggestions ("worth reviewing," "consider"), never as commands. No unacknowledged contradiction with the historical comparison data.
B — Solid, minor gaps. Mostly evidence-grounded. At most one overstatement — e.g. a claim missing its exact supporting figure, or a trend stated slightly more confidently than the sample size supports — that doesn't change the substance of the conclusion.
C — Noticeable gaps. Multiple claims lack a specific supporting figure, or a pattern is stated with more confidence than the sample size or historical comparison actually supports. Still fundamentally honest, but a reader could come away more certain than the data warrants.
D — Unreliable. Contains a claim not supported by the supplied data (fabricated, or extrapolated well beyond what the numbers show), a recommendation phrased as a directive rather than a suggestion, or a contradiction with the historical comparison that isn't acknowledged.
F — Untrustworthy. Multiple fabricated/unsupported claims, or the core conclusion itself isn't supported by the data.`

const SYSTEM_PROMPT = `You are Ciri, the Critic agent for a Google Ads performance dashboard.

Purpose: review another agent's output against the data it was based on, looking for holes — weak evidence, thin sample sizes, overconfident claims, contradictions. You do not generate new analysis or recommendations, only critique existing ones. Apply the same scrutiny to confident-sounding output as to hedged output — don't rubber-stamp something just because it reads well.

When the agent works directly from campaign data, you'll also be given a longer historical window than the agent itself used — deliberately, so you can catch things the agent's narrower window couldn't see. Compare the agent's claims against that history and explain contradictions or anomalies in those terms when relevant (e.g. "this reads as a spike, but the last 60 days show swings this size aren't unusual for this campaign").

${GRADING_RUBRIC}

grade_rationale must be a short (2-3 sentence), specific walkthrough of why this grade and not one tier up or down — name which rubric criteria were met or missed. Do not just restate feedback in different words.

feedback itself should be a tight paragraph naming the specific problems found (or empty if none) — not an exhaustive line-by-line review. If you're listing more than 3-4 distinct issues, you're being too thorough for what a human needs to act on; group related ones.

issues is a list of the specific problems (empty if none). Every issues[].quote MUST be an exact, verbatim substring copied from the reviewed content — not a paraphrase or summary. A quote that doesn't match the text exactly is useless, since it's used to highlight the exact flagged phrase for a human reader. If you can't quote something verbatim, describe it in feedback instead and leave it out of issues.

Every issue must also carry a severity, taken from the rubric's own tiers: "high" for D-tier problems — a claim not supported by, or contradicting, the supplied data; a fabricated figure; a recommendation phrased as a directive; an unacknowledged contradiction with the historical comparison. "medium" for C-tier problems — a claim missing its specific supporting figure, or a pattern stated with more confidence than the sample size or history supports. "low" for stylistic points that don't affect whether a reader could be misled. Severity says how serious each issue is; it does not change how you grade — assign the grade strictly against the rubric exactly as before.

grade must always stay the literal English letter A, B, C, D, or F, regardless of what language the rest of your response is in — the frontend's color-mapping and a database constraint both depend on that exact value. Only feedback, grade_rationale, and issues[].reason switch language; issues[].quote is a verbatim substring of the reviewed content, so it naturally comes out in whatever language that content is in.

Respond as JSON: {"has_issues": true or false, "feedback": "...", "grade": "A"|"B"|"C"|"D"|"F", "grade_rationale": "...", "issues": [{"quote": "...", "reason": "...", "severity": "high"|"medium"|"low"}]}. If has_issues is false, feedback must be an empty string and issues must be empty.

${SHARED_GUARDRAILS}`

export type Severity = 'high' | 'medium' | 'low'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface CriticIssue {
  quote: string
  reason: string
  /** Optional in the type because ai_outputs rows written before severity
   * existed have none — readers must handle its absence. Newly produced
   * verdicts always have it (normalizeVerdict fills a missing one with 'high'). */
  severity?: Severity
}

export interface CriticVerdict {
  has_issues: boolean
  feedback: string
  /** null only when the review was unavailable or the model returned no valid grade. */
  grade: Grade | null
  grade_rationale: string
  issues: CriticIssue[]
  /** Set when no review could be produced (empty/unparseable response after retries). */
  unavailable?: boolean
}

const GRADES: readonly string[] = ['A', 'B', 'C', 'D', 'F']
const SEVERITIES: readonly string[] = ['high', 'medium', 'low']

/** Makes any verdict safe to act on, whatever the model (or a test double)
 * returned. A missing or invalid severity becomes 'high', so a malformed
 * response fails safe into a revision instead of a false approval; a missing
 * or invalid grade becomes null, which blocks approval (see decideApproval).
 * Idempotent. */
export function normalizeVerdict(raw: Partial<CriticVerdict> | null | undefined): CriticVerdict {
  const v = raw ?? {}
  const issues: CriticIssue[] = (Array.isArray(v.issues) ? v.issues : [])
    .filter((i): i is CriticIssue => !!i && typeof i.quote === 'string' && typeof i.reason === 'string')
    .map((i) => ({ quote: i.quote, reason: i.reason, severity: SEVERITIES.includes(i.severity as string) ? (i.severity as Severity) : 'high' }))
  return {
    has_issues: !!v.has_issues,
    feedback: typeof v.feedback === 'string' ? v.feedback : '',
    grade: GRADES.includes(v.grade as string) ? (v.grade as Grade) : null,
    grade_rationale: typeof v.grade_rationale === 'string' ? v.grade_rationale : '',
    issues,
    ...(v.unavailable ? { unavailable: true } : {}),
  }
}

/** The rubric requires every issues[].quote to be an exact, verbatim
 * substring of the reviewed content — but that requirement is only ever a
 * prompt instruction, never checked. The frontend (markdown.ts) already
 * fails soft on a non-matching quote (it just skips highlighting that one
 * issue), so this isn't a crash-prevention fix — it's an observability one:
 * without it, there's no way to know if or how often the critic is
 * hallucinating quotes instead of copying them. Deliberately does not
 * mutate the verdict or drop the issue — a bad quote doesn't mean the
 * underlying finding (reason, severity) is wrong, only that its highlight
 * anchor won't match. An empty quote is never flagged: that's the model
 * choosing not to quote, per its own instructions (see critic.md), not a
 * failure to quote. Called from criticLoop.ts right after normalizeVerdict;
 * kept separate (and pure) rather than folded into normalizeVerdict so that
 * function stays a simple, side-effect-free fail-safe. */
export function findUnverifiedQuotes(issues: CriticIssue[], content: string): CriticIssue[] {
  return issues.filter((i) => i.quote !== '' && !content.includes(i.quote))
}

export interface ApprovalDecision {
  approved: boolean
  /** Short human-readable why, for the console event. */
  reason: string
}

/** The approval rule, derived from severities and grade — deliberately NOT
 * from the model's has_issues boolean. Approve only when there is no
 * high-severity issue and the grade is A, B or C. A D or F (or missing)
 * grade always blocks, even if the model mislabelled its issues. Medium and
 * low issues don't block: the output is "approved with notes" and every
 * issue is still stored and shown. `gradeForcesRevision` is the existing
 * grade_forces_revision setting; D/F already block unconditionally now, so
 * it is redundant for them but still honoured. */
export function decideApproval(verdict: CriticVerdict, gradeForcesRevision = false): ApprovalDecision {
  if (verdict.unavailable) return { approved: false, reason: 'review unavailable' }
  if (verdict.grade === null) return { approved: false, reason: 'no valid grade' }
  if (verdict.grade === 'D' || verdict.grade === 'F') return { approved: false, reason: `grade ${verdict.grade}` }
  if (gradeForcesRevision && ['D', 'F'].includes(verdict.grade)) return { approved: false, reason: `grade ${verdict.grade} (grade_forces_revision)` }
  const high = verdict.issues.filter((i) => i.severity === 'high').length
  if (high > 0) return { approved: false, reason: `${high} high-severity issue${high > 1 ? 's' : ''}` }
  const medium = verdict.issues.filter((i) => i.severity === 'medium').length
  const low = verdict.issues.filter((i) => i.severity === 'low').length
  const notes = [medium && `${medium} medium`, low && `${low} low`].filter(Boolean).join(', ')
  return { approved: true, reason: notes ? `grade ${verdict.grade}, approved with notes (${notes})` : `grade ${verdict.grade}` }
}

function unavailableVerdict(detail: string): CriticVerdict {
  return {
    has_issues: false,
    feedback: `(critic review unavailable: ${detail})`,
    grade: null,
    grade_rationale: '',
    issues: [],
    unavailable: true,
  }
}

export async function critique(
  agentType: string,
  content: string,
  supportingData: string,
  historicalContext: string,
  language = 'en'
): Promise<CriticVerdict> {
  // Anna works directly from campaign data, so she's graded against that data
  // plus the longer history. Rico and Sammy never see either — they only get
  // upstream agents' text — so they're graded against exactly that (the
  // orchestrator passes it as supportingData, with no historicalContext).
  // Grading them against data they were never shown made revision impossible
  // and cost ~19k critic-input tokens per call for no benefit.
  const basis =
    historicalContext.trim() !== ''
      ? `Underlying data it was based on:\n${supportingData}\n\nHistorical context (longer window, for comparison only — not the data the agent generated from):\n${historicalContext}`
      : `Material it was based on — this is everything the agent was given; it never saw raw campaign data or any longer history:\n${supportingData}\n\nGrade this output only against that material: a figure or claim faithful to it is grounded, and one that goes beyond it or contradicts it is unsupported. Do not fault it for facts that exist only outside this material. The rubric's historical-comparison criterion does not apply here because no historical context was supplied.`
  // basis (the underlying data, ~15-20k tokens for Anna) comes before content
  // (the draft being reviewed), not after — basis is byte-identical between a
  // revision's pass-1 and pass-2 critique within the same run (only content
  // changes), and most providers' prompt caching only covers the matching
  // PREFIX of a request. This was meant to make that repeat cacheable and
  // cut cost on the expensive pass-2 re-grade — measured live, it doesn't:
  // gpt-5.4 through Sumopod has never shown a nonzero cached_tokens across
  // 26 calls in 5 runs, including a same-prefix pair 42s apart that should
  // have cached ~1.3k tokens and didn't. gpt-5-mini caching does come
  // through Sumopod (confirmed nonzero on Anna's own draft/revision calls),
  // so this looks like a gpt-5.4-tier gap in Sumopod's caching, not a dead
  // feature everywhere. Keeping this order anyway — no cost benefit, but no
  // cost either, and it's a more natural reading order: the data to check
  // against, then the claim being checked.
  const userPrompt = `Agent being reviewed: ${agentType}\n\n${basis}\n\nIts output to review:\n${content}${languageInstruction(language)}`
  // Anna's critic verifies cross-table numbers and gets medium reasoning
  // effort (measured: catches real contradictions the default effort
  // missed). Rico's and Sammy's critics check faithfulness against ~2k
  // tokens of upstream text and stay at the default.
  const isAnna = agentType === 'analysis'
  try {
    const raw = await completeJson<Partial<CriticVerdict>>(
      MODEL_FULL,
      SYSTEM_PROMPT,
      userPrompt,
      isAnna ? ANNA_CRITIC_MAX_TOKENS : MAX_TOKENS,
      undefined,
      isAnna ? { reasoningEffort: 'medium' } : {}
    )
    return normalizeVerdict(raw)
  } catch (err) {
    // A blank or truncated response (already retried with a raised cap) must
    // not kill the whole run. Genuine API/network errors still propagate.
    if (err instanceof LlmJsonError) return unavailableVerdict(err.message)
    throw err
  }
}
