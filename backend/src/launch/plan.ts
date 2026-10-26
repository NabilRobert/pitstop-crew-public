// Contract 3.6 — what a simulated launch would write, and whether it may
// (docs/overhaul-v3-backend.md section 11.9). Pure: the plan for a planned
// new_campaign (with its planned ads) or a planned new_ad on an existing ad
// group, its validation against the current settings, the objects and
// messages a Launch reports, and the order of the refusals POST /launches
// answers.

import { checkAd, fromTexts, passes, problemList } from '../optimizer/adCopy.js'
import { claimsUsed, copyContext, type AdSettings } from '../optimizer/ads.js'
import { normalizeCampaignName } from '../optimizer/campaignName.js'
import type { AdFacts, MatchType, NewAdPayload, NewCampaignPayload } from '../optimizer/types.js'

export type LaunchObjectKind = 'budget' | 'campaign' | 'ad_group' | 'ad' | 'keyword' | 'negative'

/** The contract's Launch (scope doc 3.6). */
export interface Launch {
  id: number | null // null for validate_only (nothing created)
  created_at: string
  mode: string
  status: 'validated' | 'created' | 'failed'
  suggestion_id: number | null // null only when the body had no valid id (audit listing)
  campaign: { id: number; name: string } | null
  objects: { kind: LaunchObjectKind; name: string; detail: string | null }[]
  messages: string[]
}

/** GET /launches items: the audit row's own id, and validate_only. */
export interface LaunchListItem extends Launch {
  id: number
  validate_only: boolean
}

export interface PlannedAd {
  suggestion_id: number
  headlines: string[]
  descriptions: string[]
  final_url: string | null
  path1: string | null
  path2: string | null
  status: 'paused'
}

export type LaunchPlan =
  | {
      kind: 'new_campaign'
      campaign: { name: string; daily_budget_micros: number; status: 'paused' }
      ad_groups: { name: string; status: 'paused'; keywords: { text: string; match_type: MatchType; status: 'paused' }[]; ads: PlannedAd[] }[]
      negatives: { text: string; match_type: MatchType }[]
    }
  | {
      kind: 'new_ad'
      campaign: { id: number; name: string }
      ad_group: { id: number; name: string }
      ad: PlannedAd
    }

export interface LaunchCreated {
  campaign_id: number
  ad_group_ids: number[]
  keyword_ids: number[]
  ad_ids: number[]
  negative_keyword_ids: number[]
}

export interface LaunchAd {
  id: number
  payload: NewAdPayload
}

export const SWITCHED_OFF = 'Creating campaigns is switched off in Settings'
export const SIMULATED_NOTE = 'Simulated: nothing was sent to Google Ads; everything is paused in this app’s demo data.'

// --- the request body ----------------------------------------------------------

export interface LaunchBody {
  suggestionId: number | null // null when not a valid id
  confirmName: string | null
  validateOnly: boolean
  problems: string[]
}

const MAX_INT = 2_147_483_647

export function parseLaunchBody(body: unknown): LaunchBody {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const problems: string[] = []
  const id = b.suggestion_id
  const suggestionId = typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= MAX_INT ? id : null
  if (suggestionId === null) problems.push('suggestion_id must be a positive integer')
  const confirmName = typeof b.confirm_name === 'string' ? b.confirm_name : null
  if (confirmName === null) problems.push('confirm_name must be a string')
  if (b.validate_only !== undefined && typeof b.validate_only !== 'boolean') problems.push('validate_only must be a boolean')
  return { suggestionId, confirmName, validateOnly: b.validate_only === true, problems }
}

// --- the plan ------------------------------------------------------------------

const plannedAd = (a: LaunchAd): PlannedAd => ({
  suggestion_id: a.id,
  headlines: fromTexts(a.payload.headlines),
  descriptions: fromTexts(a.payload.descriptions),
  final_url: a.payload.final_url,
  path1: a.payload.path1,
  path2: a.payload.path2,
  status: 'paused',
})

const adGroupOf = (a: LaunchAd) => (a.payload.target.kind === 'proposed_campaign' ? a.payload.target.ad_group_name : null)

/** A planned campaign proposal with its planned ads: everything paused, the
 * starter negatives at campaign level, the proposal's daily budget. */
export function buildCampaignPlan(proposal: NewCampaignPayload, ads: readonly LaunchAd[]): LaunchPlan {
  return {
    kind: 'new_campaign',
    campaign: { name: proposal.name, daily_budget_micros: proposal.budget.daily_micros, status: 'paused' },
    ad_groups: proposal.ad_groups.map((g) => {
      const seen = new Set<string>()
      return {
        name: g.name,
        status: 'paused' as const,
        keywords: g.keywords
          .filter((k) => {
            const key = `${k.match_type}|${k.text.trim().toLowerCase()}`
            return !seen.has(key) && seen.add(key)
          })
          .map((k) => ({ text: k.text, match_type: k.match_type, status: 'paused' as const })),
        ads: ads.filter((a) => adGroupOf(a) === g.name).map(plannedAd),
      }
    }),
    negatives: proposal.starter_negatives.map((n) => ({ text: n.text, match_type: n.match_type })),
  }
}

/** A planned new_ad on an existing ad group: the one ad, paused. */
export function buildAdPlan(ad: LaunchAd, adGroup: { id: number; name: string; campaignId: number; campaignName: string }): LaunchPlan {
  return { kind: 'new_ad', campaign: { id: adGroup.campaignId, name: adGroup.campaignName }, ad_group: { id: adGroup.id, name: adGroup.name }, ad: plannedAd(ad) }
}

/** An ad's facts with the dealer profile and claims as the settings say now,
 * so a claim switched off since the ad was proposed fails its checks. */
export function factsWithSettings(f: AdFacts, s: AdSettings): AdFacts {
  return { ...f, dealer: s.dealerName, city: s.dealerCity, area: s.dealerArea, whatsapp: s.dealerWhatsapp, claims_used: claimsUsed(s) }
}

const rupiah = (idr: number) => `Rp ${Math.round(idr).toLocaleString('id-ID')}`

export interface PlanContext {
  existingCampaignNames: readonly string[]
  settings: AdSettings
  budgetFloorIdr: number
  budgetCeilingIdr: number
}

/** Why the plan can't be written (problems), and what was checked
 * (messages). */
export function validatePlan(plan: LaunchPlan, ads: readonly LaunchAd[], ctx: PlanContext): { problems: string[]; messages: string[] } {
  const problems: string[] = []
  const messages: string[] = []
  if (plan.kind === 'new_campaign') {
    const name = normalizeCampaignName(plan.campaign.name)
    if (ctx.existingCampaignNames.some((n) => normalizeCampaignName(n) === name)) problems.push(`a campaign named "${plan.campaign.name}" already exists`)
    else messages.push(`No campaign is named "${plan.campaign.name}" yet.`)
    // A ceiling below the floor means the floor wins (contract 3.4).
    const lo = ctx.budgetFloorIdr
    const hi = Math.max(ctx.budgetFloorIdr, ctx.budgetCeilingIdr)
    const budget = plan.campaign.daily_budget_micros / 1_000_000
    if (budget < lo || budget > hi) problems.push(`the daily budget ${rupiah(budget)} is outside the bounds ${rupiah(lo)}–${rupiah(hi)}`)
    else messages.push(`Daily budget ${rupiah(budget)} is within ${rupiah(lo)}–${rupiah(hi)}.`)
    for (const g of plan.ad_groups) if (g.keywords.length === 0) problems.push(`ad group "${g.name}" has no keyword`)
    const groups = new Set(plan.ad_groups.map((g) => g.name))
    for (const a of ads) if (!groups.has(adGroupOf(a) ?? '')) problems.push(`ad #${a.id} is not for an ad group of this proposal`)
    const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
    messages.push(
      `${count(plan.ad_groups.length, 'ad group')}, ${count(plan.ad_groups.reduce((n, g) => n + g.keywords.length, 0), 'keyword')}, ${count(ads.length, 'planned ad')} and ${count(plan.negatives.length, 'negative')}, all paused.`
    )
  }
  const copy = copyContext(ctx.settings)
  for (const a of ads) {
    const result = checkAd({ headlines: fromTexts(a.payload.headlines), descriptions: fromTexts(a.payload.descriptions), path1: a.payload.path1, path2: a.payload.path2 }, factsWithSettings(a.payload.facts, ctx.settings), copy)
    if (!passes(result)) problems.push(...problemList(result).map((p) => `ad #${a.id}: ${p}`))
    if (a.payload.final_url === null) messages.push(`Ad #${a.id} has no final URL yet: set dealer_landing_url before a live launch.`)
  }
  if (ads.length > 0 && problems.length === 0) messages.push(`${ads.length === 1 ? 'The ad passes' : `All ${ads.length} ads pass`} the checks against the current settings.`)
  return { problems, messages }
}

/** What the launch creates (or would), for the Launch's `objects`. */
export function planObjects(plan: LaunchPlan): Launch['objects'] {
  const adObject = (a: PlannedAd, where: string): Launch['objects'][number] => ({
    kind: 'ad',
    name: `Pitcrew ad #${a.suggestion_id}`,
    detail: `${a.headlines.length} headlines, ${a.descriptions.length} descriptions, paused, in ${where}`,
  })
  if (plan.kind === 'new_ad') return [adObject(plan.ad, `"${plan.ad_group.name}" (${plan.campaign.name})`)]
  return [
    { kind: 'budget', name: `${plan.campaign.name} budget`, detail: `${rupiah(plan.campaign.daily_budget_micros / 1_000_000)} a day` },
    { kind: 'campaign', name: plan.campaign.name, detail: 'paused, simulated' },
    ...plan.ad_groups.flatMap((g) => [
      { kind: 'ad_group' as const, name: g.name, detail: 'paused' },
      ...g.keywords.map((k) => ({ kind: 'keyword' as const, name: k.text, detail: `${k.match_type}, paused, in "${g.name}"` })),
      ...g.ads.map((a) => adObject(a, `"${g.name}"`)),
    ]),
    ...plan.negatives.map((n) => ({ kind: 'negative' as const, name: n.text, detail: `${n.match_type}, campaign level` })),
  ]
}

// --- the decision --------------------------------------------------------------

export interface LaunchState {
  body: LaunchBody
  writeEnabled: boolean
  suggestion: {
    type: string
    status: string
    targetKind: 'existing_ad_group' | 'proposed_campaign' | null // new_ad only
    confirmName: string | null // the campaign or ad group name; null when the ad group is gone
  } | null
  hasCreatedLaunch: boolean
  planProblems: string[] // [] when there is no plan
}

export type LaunchDecision =
  | { action: 'refuse'; http: 400 | 404 | 409; problems: string[]; planChecked: boolean } // planChecked: the plan existed (store it)
  | { action: 'validated' }
  | { action: 'write' }

/** The checks in section 11.9's order: the body, the kill switch, then the
 * suggestion (exists, planned, type, confirm_name), then the plan
 * (every object's checks, the budget bounds, no duplicate name). */
export function decideLaunch(s: LaunchState): LaunchDecision {
  const refuse = (http: 400 | 404 | 409, ...problems: string[]): LaunchDecision => ({ action: 'refuse', http, problems, planChecked: false })
  if (s.body.problems.length > 0) return refuse(400, ...s.body.problems)
  if (!s.writeEnabled) return refuse(409, SWITCHED_OFF)
  if (!s.suggestion) return refuse(404, `suggestion ${s.body.suggestionId} not found`)
  if (s.suggestion.status !== 'planned') return refuse(409, `the suggestion is ${s.suggestion.status}, not planned`)
  if (s.suggestion.type === 'new_ad' && s.suggestion.targetKind === 'proposed_campaign') {
    return refuse(400, 'an ad for a proposed campaign is created with its campaign: launch the campaign proposal')
  }
  if (s.suggestion.type !== 'new_campaign' && s.suggestion.type !== 'new_ad') {
    return refuse(400, `suggestion ${s.body.suggestionId} is a ${s.suggestion.type}, not a new_campaign or a new_ad`)
  }
  if (s.suggestion.confirmName === null) return refuse(400, 'the ad group this ad is for no longer exists')
  if (s.body.confirmName !== s.suggestion.confirmName) return refuse(400, `confirm_name must be exactly "${s.suggestion.confirmName}"`)
  if (s.hasCreatedLaunch) return refuse(409, 'the suggestion was already launched')
  if (s.planProblems.length > 0) return { action: 'refuse', http: 400, problems: s.planProblems, planChecked: true }
  if (s.body.validateOnly) return { action: 'validated' }
  return { action: 'write' }
}
