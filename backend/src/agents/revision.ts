// What a revision call receives from the critic loop. Shared so Anna, Rico
// and Sammy get identical treatment — previously each only got the critic's
// feedback paragraph, not their own previous draft, so a "revision" was a
// from-scratch rewrite guided by a summary of what was wrong. That rewrite
// tended to fix the flagged item and introduce new ones (only ~7% of a
// chain's final-pass issues resembled its first-pass issues).

import type { CriticIssue, CriticVerdict } from './critic.js'

export interface RevisionInput {
  /** The draft the critic just reviewed — the thing being edited. */
  previousDraft: string
  /** The critic's short summary paragraph. */
  feedback: string
  /** The structured issues: the exact phrase flagged and why. */
  issues: CriticIssue[]
}

export function buildRevisionInput(previousDraft: string, verdict: CriticVerdict): RevisionInput {
  return { previousDraft, feedback: verdict.feedback, issues: verdict.issues ?? [] }
}

/** Appended to an agent's normal user prompt on a revision pass. `subject`
 * is how the agent refers to its own output ("analysis", "recommendation",
 * "summary"). */
export function revisionPrompt(subject: string, r: RevisionInput): string {
  const issues = r.issues.length
    ? r.issues.map((i, n) => `${n + 1}. Flagged: "${i.quote}" — ${i.reason}`).join('\n')
    : '(the critic gave no itemized issues — see its overall feedback below)'
  return (
    `\n\nCiri (the Critic agent) reviewed your previous ${subject} and found problems. Your previous draft, ` +
    `then the specific issues with the exact phrase flagged and why, follow.\n\n` +
    `Previous draft:\n${r.previousDraft}\n\n` +
    `Issues to fix:\n${issues}\n\n` +
    `Overall feedback: ${r.feedback}\n\n` +
    `Revise the draft: fix every issue above and leave everything that wasn't flagged as it is — this is an edit ` +
    `of your previous draft, not a fresh rewrite, so do not add new claims. Only use figures and facts that appear ` +
    `in the material provided in this conversation. Respond with the full revised ${subject} only.`
  )
}
