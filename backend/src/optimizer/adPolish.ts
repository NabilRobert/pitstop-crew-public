// Contract 3.6 step c — Kai's polish of new ads' copy
// (docs/overhaul-v3-backend.md section 11.9). Pure: the input Kai is sent,
// the validation of what she returns, and the text Ciri grades.
//
// Kai may only rewrite headlines and descriptions. Every returned ad must
// be one she was sent and must pass all of AdCheckFlags (adCopy.ts) against
// its own facts; any other keeps its template copy, whole. Paths, URL, facts
// and everything else stay as the engine computed them.

import { checkAd, fromTexts, passes, problemList, type CopyContext } from './adCopy.js'
import type { AdCheckFlags, NewAdPayload } from './types.js'

/** A new_ad row stored in this run, by its suggestion id. */
export interface PolishAd {
  id: number
  payload: NewAdPayload
}

export interface PolishedAd {
  id: number
  headlines: string[]
  descriptions: string[]
  checks: AdCheckFlags
}

export interface PolishValidation {
  accepted: PolishedAd[]
  rejected: { candidateId: unknown; reason: string }[] // keeps the template (an unknown id has no row)
  missing: number[] // sent but not returned: keeps the template
}

const CLAIM_LABELS: Record<NewAdPayload['facts']['claims_used'][number], string> = {
  installments: 'financing (cicilan, DP, kredit, leasing)',
  trade_in: 'trade-in (tukar tambah)',
  test_drive: 'test drive',
  inspection: 'inspection, only in the exact inspection_wording',
}

const where = (p: NewAdPayload) =>
  p.target.kind === 'proposed_campaign' ? { proposal_id: p.target.campaign_suggestion_id, ad_group: p.target.ad_group_name } : { ad_group_id: p.target.ad_group_id }

/** What Kai gets: per ad, its facts, the claims it may make (and the exact
 * inspection wording), its winners and the template copy. */
export function buildPolishInput(ads: readonly PolishAd[], ctx: CopyContext): string {
  return JSON.stringify(
    {
      inspection_wording: ctx.inspectionWording,
      ads: ads.map(({ id, payload: p }) => ({
        candidate_id: id,
        basis: p.basis,
        target: where(p),
        facts: p.facts,
        allowed_claims: p.facts.claims_used.map((c) => CLAIM_LABELS[c]),
        winner_keywords: p.winner_keywords.map((w) => w.text),
        template: { headlines: fromTexts(p.headlines), descriptions: fromTexts(p.descriptions) },
      })),
    },
    null,
    1
  )
}

const strings = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((s) => typeof s === 'string') ? v.map((s: string) => s.trim().replace(/\s+/g, ' ')) : null

/** Kai's reply against the ads she was sent: `{"ads": [{"candidate_id",
 * "headlines", "descriptions"}]}`, the copy as plain strings. */
export function validatePolish(raw: unknown, ads: readonly PolishAd[], ctx: CopyContext): PolishValidation {
  const byId = new Map(ads.map((a) => [a.id, a]))
  const accepted: PolishedAd[] = []
  const rejected: PolishValidation['rejected'] = []
  const seen = new Set<number>()
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { ads?: unknown }).ads) ? (raw as { ads: unknown[] }).ads : null
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
    const result = checkAd({ headlines, descriptions, path1: ad.payload.path1, path2: ad.payload.path2 }, ad.payload.facts, ctx)
    if (!passes(result)) {
      rejected.push({ candidateId: ad.id, reason: problemList(result).join('; ') })
      continue
    }
    accepted.push({ id: ad.id, headlines, descriptions, checks: result.flags })
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
      const copy = a ?? { headlines: fromTexts(p.headlines), descriptions: fromTexts(p.descriptions) }
      const source = a ? 'polished by Kai' : `template kept (${reasons.get(id) ?? 'not returned'})`
      const target = p.target.kind === 'proposed_campaign' ? `proposal #${p.target.campaign_suggestion_id} › ${p.target.ad_group_name}` : `ad group #${p.target.ad_group_id}`
      return [`Ad #${id}: ${target} (${p.basis}), ${source}`, `Headlines: ${copy.headlines.join(' | ')}`, ...copy.descriptions.map((d) => `- ${d}`)].join('\n')
    })
    .join('\n\n')
}
