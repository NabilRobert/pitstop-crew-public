// Contract 3.6 step c — Kai's polish of new ads' copy
// (docs/overhaul-v3-backend.md section 11.9). Pure: the input Kai is sent,
// the validation of what she returns, and the text Ciri grades.
//
// Kai may only rewrite headlines and descriptions. Every returned ad must
// be one she was sent and must pass all three checks (adCopy.ts checkAd)
// against its own facts; any other keeps its template. Paths, URL, facts
// and everything else stay as the engine computed them.

import { checkAd, passes, type AdChecks, type AdCopy } from './adCopy.js'
import type { NewAdPayload } from './types.js'

/** A new_ad row stored in this run, by its suggestion id. */
export interface PolishAd {
  id: number
  payload: NewAdPayload
}

export interface PolishedAd {
  id: number
  headlines: string[]
  descriptions: string[]
  checks: AdChecks
}

export interface PolishValidation {
  accepted: PolishedAd[]
  rejected: { candidateId: unknown; reason: string }[] // keeps the template (an unknown id has no row)
  missing: number[] // sent but not returned: keeps the template
}

const CLAIM_LABELS: Record<keyof NewAdPayload['facts']['claims'], string> = {
  installments: 'credit / instalments (kredit, cicilan, DP)',
  trade_in: 'trade-in (tukar tambah)',
  test_drive: 'test drive',
  inspection: 'inspected units',
}

/** What Kai gets: per ad, its facts, the claims it may make and the
 * template. `vehicle_ids` and `snapshot_on` never reach the copy. */
export function buildPolishInput(ads: readonly PolishAd[]): string {
  return JSON.stringify(
    {
      ads: ads.map(({ id, payload: p }) => {
        const { vehicle_ids: _v, snapshot_on: _s, ...facts } = p.facts
        return {
          candidate_id: id,
          basis: p.basis,
          campaign_name: p.campaign_name,
          ad_group_name: p.ad_group_name,
          facts,
          allowed_claims: (Object.keys(CLAIM_LABELS) as (keyof typeof CLAIM_LABELS)[]).filter((k) => p.facts.claims[k]).map((k) => CLAIM_LABELS[k]),
          winner_keywords: p.winner_keywords.map((w) => w.text),
          template: p.template,
        }
      }),
    },
    null,
    1
  )
}

const strings = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((s) => typeof s === 'string') ? v.map((s: string) => s.trim().replace(/\s+/g, ' ')) : null

/** Kai's reply against the ads she was sent: `{"ads": [{"candidate_id",
 * "headlines", "descriptions"}]}`. */
export function validatePolish(raw: unknown, ads: readonly PolishAd[]): PolishValidation {
  const byId = new Map(ads.map((a) => [a.id, a]))
  const accepted: PolishedAd[] = []
  const rejected: PolishValidation['rejected'] = []
  const seen = new Set<number>()
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { ads?: unknown }).ads) ? ((raw as { ads: unknown[] }).ads) : null
  if (items === null) rejected.push({ candidateId: null, reason: 'the reply has no "ads" list' })
  for (const item of items ?? []) {
    const id = item && typeof item === 'object' ? (item as { candidate_id?: unknown }).candidate_id : undefined
    const ad = typeof id === 'number' ? byId.get(id) : undefined
    if (!ad) {
      rejected.push({ candidateId: id ?? null, reason: 'not an ad that was sent' })
      continue
    }
    if (seen.has(ad.id)) {
      rejected.push({ candidateId: ad.id, reason: 'returned twice' })
      continue
    }
    seen.add(ad.id)
    const headlines = strings((item as { headlines?: unknown }).headlines)
    const descriptions = strings((item as { descriptions?: unknown }).descriptions)
    if (!headlines || !descriptions) {
      rejected.push({ candidateId: ad.id, reason: 'headlines and descriptions must be lists of text' })
      continue
    }
    const copy: AdCopy = { headlines, descriptions, path1: ad.payload.path1, path2: ad.payload.path2 }
    const checks = checkAd(copy, ad.payload.facts)
    if (!passes(checks)) {
      rejected.push({ candidateId: ad.id, reason: [...checks.limits.problems, ...checks.facts.problems, ...checks.style.problems].join('; ') })
      continue
    }
    accepted.push({ id: ad.id, headlines, descriptions, checks })
  }
  return { accepted, rejected, missing: ads.filter((a) => !seen.has(a.id)).map((a) => a.id) }
}

/** The copy each ad would end up with, as text for Ciri: the polish where
 * it passed the checks, else the template (and why). */
export function renderPolish(v: PolishValidation, ads: readonly PolishAd[]): string {
  const polished = new Map(v.accepted.map((a) => [a.id, a]))
  const reasons = new Map(v.rejected.map((r) => [r.candidateId, r.reason]))
  return ads
    .map(({ id, payload: p }) => {
      const a = polished.get(id)
      const copy = a ?? p.template
      const source = a ? 'polished by Kai' : `template kept (${reasons.get(id) ?? 'not returned'})`
      return [
        `Ad #${id}: ${p.campaign_name} › ${p.ad_group_name} (${p.basis}), ${source}`,
        `Headlines: ${copy.headlines.join(' | ')}`,
        ...copy.descriptions.map((d) => `- ${d}`),
      ].join('\n')
    })
    .join('\n\n')
}
