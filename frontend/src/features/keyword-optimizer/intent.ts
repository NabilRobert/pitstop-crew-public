// Presentation helpers for search-term intent (contract 3.0). The intent
// labels are a PROXY computed by the backend (rules + a small model); the UI
// never claims more than that, and `unknown` is a real, honest label.

import type { Intent } from '../../shared/api/types'

export const INTENT_ORDER: Intent[] = ['buyer', 'researcher', 'competitor', 'job_seeker', 'student', 'consumer', 'unknown']

/** Segment fill per intent, from semantic tokens only so it works in every theme. Color is
 * never the only cue: the dominant label and percentages are always printed as text. */
export const INTENT_COLOR: Record<Intent, string> = {
  buyer: 'var(--color-flag-good)',
  researcher: 'var(--color-ink-soft)',
  competitor: 'var(--color-ink-faint)',
  job_seeker: 'var(--color-flag-critical)',
  student: 'var(--color-flag-caution)',
  consumer: 'color-mix(in srgb, var(--color-flag-critical) 50%, var(--color-flag-caution))',
  unknown: 'var(--color-border-strong)',
}

export interface MixPart {
  intent: Intent
  share: number
}

/** Non-zero parts in display order, shares normalized to sum to 1 (the contract says "~1"). */
export function mixParts(mix: Partial<Record<Intent, number>> | null | undefined): MixPart[] {
  if (!mix) return []
  const parts = INTENT_ORDER.map((intent) => ({ intent, share: Math.max(0, mix[intent] ?? 0) })).filter((p) => p.share > 0)
  const total = parts.reduce((sum, p) => sum + p.share, 0)
  return total > 0 ? parts.map((p) => ({ ...p, share: p.share / total })) : []
}

export function dominantIntent(parts: MixPart[]): MixPart | null {
  return parts.length ? parts.reduce((best, p) => (p.share > best.share ? p : best)) : null
}
