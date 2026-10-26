// What a launch would create, worked out from the plan itself (contract 3.6). Pure: no Vue, no network.
// The Review and create panel shows this immediately, for the demo account too (which cannot call the server),
// and the server's validate-only answer is shown next to it. Everything is created PAUSED.

import type {
  KeywordMatchType,
  LaunchObject,
  NewAdPayload,
  NewCampaignPayload,
  Suggestion,
} from '../../shared/api/types'
import { formatMicrosAsIDR } from '../../shared/utils/format'

const matchWord = (m: KeywordMatchType) => m

/** The target a planned suggestion would be launched into, by its kind. null = this suggestion cannot be launched on its own. */
export type LaunchKind = 'campaign' | 'ad'

export function launchKind(s: Suggestion): LaunchKind | null {
  if (s.status !== 'planned') return null
  if (s.payload.kind === 'new_campaign') return 'campaign'
  // An ad for a proposed campaign is created WITH it; only an ad for an existing ad group launches alone.
  if (s.payload.kind === 'new_ad' && s.payload.target.kind === 'existing_ad_group') return 'ad'
  return null
}

/** The name the owner must type to confirm: the campaign (campaigns) or the ad group (ads). */
export function confirmNameOf(s: Suggestion): string | null {
  const p = s.payload
  if (p.kind === 'new_campaign') return p.name
  if (p.kind === 'new_ad' && s.ad_group) return s.ad_group.name
  return null
}

/** Planned ads that go out with a planned campaign proposal. */
export function adsToLaunchWith(all: Suggestion[], campaignSuggestionId: number): Suggestion[] {
  return all.filter(
    (s) =>
      s.status === 'planned' &&
      s.payload.kind === 'new_ad' &&
      s.payload.target.kind === 'proposed_campaign' &&
      s.payload.target.campaign_suggestion_id === campaignSuggestionId
  )
}

function adObject(p: NewAdPayload, groupName: string): LaunchObject {
  return {
    kind: 'ad',
    name: `${groupName}: ${p.headlines[0]?.text ?? ''}`,
    detail: `${p.headlines.length} headlines, ${p.descriptions.length} descriptions`,
  }
}

/** The exact objects a launch would create, in the order they are created. */
export function plannedObjects(s: Suggestion, ads: Suggestion[]): LaunchObject[] {
  const p = s.payload
  if (p.kind === 'new_campaign') return campaignObjects(p, ads)
  if (p.kind === 'new_ad') return [adObject(p, s.ad_group?.name ?? '—')]
  return []
}

function campaignObjects(p: NewCampaignPayload, ads: Suggestion[]): LaunchObject[] {
  const out: LaunchObject[] = [
    { kind: 'budget', name: `${formatMicrosAsIDR(p.budget.daily_micros)} a day`, detail: null },
    { kind: 'campaign', name: p.name, detail: 'paused' },
  ]
  for (const g of p.ad_groups) {
    out.push({ kind: 'ad_group', name: g.name, detail: `${g.keywords.length} keywords` })
    for (const k of g.keywords) out.push({ kind: 'keyword', name: k.text, detail: matchWord(k.match_type) })
    for (const a of ads) {
      const ap = a.payload
      if (ap.kind === 'new_ad' && ap.target.kind === 'proposed_campaign' && ap.target.ad_group_name === g.name) out.push(adObject(ap, g.name))
    }
  }
  for (const n of p.starter_negatives) out.push({ kind: 'negative', name: n.text, detail: `${matchWord(n.match_type)}, campaign level` })
  return out
}

/** Counts per kind, for the summary line ("1 campaign, 1 budget, 2 ad groups, 7 keywords, ..."). */
export function countByKind(objects: LaunchObject[]): Record<LaunchObject['kind'], number> {
  const c: Record<LaunchObject['kind'], number> = { budget: 0, campaign: 0, ad_group: 0, ad: 0, keyword: 0, negative: 0 }
  for (const o of objects) c[o.kind]++
  return c
}

/** The exact-name confirmation: trimmed on neither side, case-sensitive, like the server (a typo must not launch). */
export function confirmationMatches(typed: string, expected: string | null): boolean {
  return expected !== null && typed === expected
}

/** Whether the Create button is enabled. Every condition must hold; unknown settings count as off, never as on. */
export function canCreateLaunch(a: {
  canEdit: boolean
  writeEnabled: boolean | null
  launchable: boolean
  alreadyCreated: boolean
  creating: boolean
  typed: string
  expected: string | null
}): boolean {
  return a.canEdit && a.writeEnabled === true && a.launchable && !a.alreadyCreated && !a.creating && confirmationMatches(a.typed, a.expected)
}
