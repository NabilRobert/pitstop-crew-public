// Contract 3.6 step d — what a launch would write, and whether it may
// (docs/overhaul-v3-backend.md section 11.9). Pure: the plan built from a
// planned new_campaign proposal and its ads, its validation against the
// current settings, and the order of the refusals POST /launches answers.

import { checkAd, passes } from '../optimizer/adCopy.js'
import type { AdSettings } from '../optimizer/ads.js'
import { normalizeCampaignName } from '../optimizer/campaignName.js'
import type { AdFacts, MatchType, NewAdPayload, NewCampaignPayload } from '../optimizer/types.js'

export interface LaunchPlan {
  campaign: { name: string; daily_budget_micros: number; status: 'paused' }
  ad_groups: {
    name: string
    status: 'paused'
    keywords: { text: string; match_type: MatchType; status: 'paused' }[]
    ads: { suggestion_id: number; headlines: string[]; descriptions: string[]; final_url: string; path1: string | null; path2: string | null; status: 'paused' }[]
  }[]
  negatives: { text: string; match_type: MatchType }[]
}

export interface LaunchCreated {
  campaign_id: number
  ad_group_ids: number[]
  keyword_ids: number[]
  ad_ids: number[]
  negative_keyword_ids: number[]
}

export type LaunchStatus = 'validated' | 'created' | 'rejected' | 'failed'

export interface Launch {
  id: number
  suggestion_id: number | null
  campaign_name: string | null
  mode: string
  validate_only: boolean
  status: LaunchStatus
  http_status: number
  problems: string[]
  plan: LaunchPlan | null
  created: LaunchCreated | null
  requested_by: 'owner' | 'demo'
  requested_at: string
}

export interface LaunchAd {
  id: number
  payload: NewAdPayload
}

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

/** What the launch would write: everything paused, the starter negatives at
 * campaign level. An ad joins the proposal's ad group it names. */
export function buildPlan(proposal: NewCampaignPayload, ads: readonly LaunchAd[]): LaunchPlan {
  return {
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
        ads: ads
          .filter((a) => a.payload.ad_group_name === g.name && a.payload.final_url !== null)
          .map((a) => ({
            suggestion_id: a.id,
            headlines: a.payload.headlines,
            descriptions: a.payload.descriptions,
            final_url: a.payload.final_url!,
            path1: a.payload.path1,
            path2: a.payload.path2,
            status: 'paused' as const,
          })),
      }
    }),
    negatives: proposal.starter_negatives.map((n) => ({ text: n.text, match_type: n.match_type })),
  }
}

/** An ad's facts with the dealer and claims as the settings say now, so a
 * claim switched off since the ad was proposed fails its checks. */
export function factsWithSettings(f: AdFacts, s: AdSettings): AdFacts {
  return {
    ...f,
    dealer: { name: s.dealerName, city: s.dealerCity, area: s.dealerArea, whatsapp: s.dealerWhatsapp },
    claims: { ...s.claims },
    inspection_wording: s.claims.inspection ? s.inspectionWording : null,
  }
}

/** Why the plan can't be written; [] when it can. */
export function validatePlan(plan: LaunchPlan, ads: readonly LaunchAd[], ctx: { existingCampaignNames: readonly string[]; settings: AdSettings }): string[] {
  const problems: string[] = []
  const name = normalizeCampaignName(plan.campaign.name)
  if (ctx.existingCampaignNames.some((n) => normalizeCampaignName(n) === name)) problems.push(`a campaign named "${plan.campaign.name}" already exists`)
  for (const g of plan.ad_groups) if (g.keywords.length === 0) problems.push(`ad group "${g.name}" has no keyword`)
  const groups = new Set(plan.ad_groups.map((g) => g.name))
  for (const a of ads) {
    const label = `ad #${a.id} (${a.payload.ad_group_name})`
    if (!groups.has(a.payload.ad_group_name)) problems.push(`${label}: not an ad group of this proposal`)
    if (a.payload.final_url === null) problems.push(`${label}: no final URL (set dealer_landing_url)`)
    const copy = { headlines: a.payload.headlines, descriptions: a.payload.descriptions, path1: a.payload.path1, path2: a.payload.path2 }
    const checks = checkAd(copy, factsWithSettings(a.payload.facts, ctx.settings))
    if (!passes(checks)) problems.push(...[...checks.limits.problems, ...checks.facts.problems, ...checks.style.problems].map((p) => `${label}: ${p}`))
  }
  return problems
}

// --- the decision --------------------------------------------------------------

export interface LaunchState {
  body: LaunchBody
  suggestion: { type: string; status: string; name: string | null } | null
  hasCreatedLaunch: boolean
  planProblems: string[] // [] when there is no plan yet
  writeEnabled: boolean
}

export type LaunchDecision =
  | { action: 'refuse'; http: 400 | 404 | 409; problems: string[]; planChecked: boolean } // planChecked: the plan existed (store it)
  | { action: 'validated' }
  | { action: 'write' }

/** The checks in the contract's order: body → exists → type → confirm_name
 * → planned → not launched yet → plan → validate_only stops → kill switch. */
export function decideLaunch(s: LaunchState): LaunchDecision {
  const refuse = (http: 400 | 404 | 409, ...problems: string[]): LaunchDecision => ({ action: 'refuse', http, problems, planChecked: false })
  const refusePlan = (http: 400 | 409, ...problems: string[]): LaunchDecision => ({ action: 'refuse', http, problems, planChecked: true })
  if (s.body.problems.length > 0) return refuse(400, ...s.body.problems)
  if (!s.suggestion) return refuse(404, `suggestion ${s.body.suggestionId} not found`)
  if (s.suggestion.type !== 'new_campaign') return refuse(400, `suggestion ${s.body.suggestionId} is a ${s.suggestion.type}, not a new_campaign`)
  if (s.body.confirmName !== s.suggestion.name) return refuse(400, `confirm_name must be exactly "${s.suggestion.name}"`)
  if (s.suggestion.status !== 'planned') return refuse(409, `the proposal is ${s.suggestion.status}, not planned`)
  if (s.hasCreatedLaunch) return refuse(409, 'the proposal was already launched')
  if (s.planProblems.length > 0) return refusePlan(400, ...s.planProblems)
  if (s.body.validateOnly) return { action: 'validated' }
  if (!s.writeEnabled) return refusePlan(409, 'ads_write_enabled is off')
  return { action: 'write' }
}
