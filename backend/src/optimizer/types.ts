// Keyword optimizer shared types — API contract 3.0 (docs/overhaul-v3.md
// section 13). One definition for the demo data, the engine and the API, so
// a contract change is a compile error everywhere it matters.

export type Intent = 'buyer' | 'researcher' | 'job_seeker' | 'student' | 'competitor' | 'consumer' | 'unknown'

export type SuggestionType =
  | 'negative_keyword'
  | 'promote_search_term'
  | 'change_match_type'
  | 'pause_keyword'
  | 'spin_out_campaign'
  | 'new_keyword'
  | 'raise_bid_candidate'
  | 'new_campaign' // 3.3: a whole new campaign proposal
  | 'new_ad' // 3.6: a new responsive search ad

export type SuggestionStatus = 'open' | 'planned' | 'applied' | 'dismissed' | 'superseded' // 3.3 adds 'planned' (3.6: new_campaign and new_ad)
// 3.3 — why the engine proposes a new campaign.
export type CampaignBasis = 'uncovered_stock' | 'aging_stock' | 'proven_cluster' | 'theme'
// 3.6 — why the engine proposes a new ad.
export type AdBasis = 'new_campaign' | 'weak_ad' | 'uncovered_winner'
export type Basis = 'evidence' | 'prior' // 'prior' = not yet backed by this account's data
export type Confidence = 'high' | 'medium' | 'low'
export type MatchType = 'exact' | 'phrase' | 'broad'
export type ValueTier = 'micro' | 'lead' | 'visit' | 'sale'
// Contract 3.1 — one label per keyword on /keywords/summary (verdict.ts).
export type KeywordVerdict = 'winner' | 'wasting' | 'no_stock' | 'testing' | 'needs_data' | 'steady'

export type SuggestionPayload =
  | {
      kind: 'negative_keyword'
      text: string
      match_type: MatchType
      scope: 'campaign' | 'ad_group'
      collisions: { search_term: string; conversions: number }[] // converting terms the negative would block
    }
  | { kind: 'promote_search_term'; text: string; to_match_type: 'exact'; ad_group_id: number }
  | { kind: 'change_match_type'; from: MatchType; to: MatchType }
  | { kind: 'pause_keyword' }
  | { kind: 'spin_out_campaign'; keyword_ids: number[]; suggested_name: string; make: string | null; model: string | null }
  | {
      kind: 'new_keyword'
      text: string
      match_type: MatchType
      ad_group_id: number | null
      source: 'stock' | 'search_term' | 'keyword_ideas'
      vehicle_ids: number[]
      is_test: boolean
    }
  | { kind: 'raise_bid_candidate'; current_bid_micros: number | null; rank_lost_share: number }
  | NewCampaignPayload
  | NewAdPayload

/** Contract 3.3 — a whole new campaign proposal, computed in code
 * (src/optimizer/campaigns.ts). */
export interface NewCampaignPayload {
  kind: 'new_campaign'
  basis: CampaignBasis
  name: string // also what links a planned proposal to the real campaign later
  theme: string | null
  ad_groups: {
    name: string
    keywords: { text: string; match_type: MatchType; source: 'stock' | 'existing_keyword' | 'keyword_ideas' }[]
    vehicle_ids: number[]
  }[]
  starter_negatives: { text: string; match_type: MatchType }[]
  budget: {
    daily_micros: number
    target_cpa_micros: number | null
    assumptions: { allowed_spend_share: number; lead_to_sale_rate: number }
    bound: 'floor' | 'ceiling' | null // 3.4: daily_micros was held at that setting
  }
  stock: { units: number; avg_days_listed: number | null; avg_margin_idr: number | null; total_value_idr: number | null; snapshot_on: string }
  overlaps: { campaign_id: number; name: string; shared_keywords: number }[]
}

/** Contract 3.6 — a claim the dealer profile can allow (settings
 * ads_claim_*). */
export type AdClaim = 'installments' | 'trade_in' | 'test_drive' | 'inspection'
export const AD_CLAIMS: readonly AdClaim[] = ['installments', 'trade_in', 'test_drive', 'inspection']

/** Contract 3.6 — computed in code (src/optimizer/adCopy.ts), shown by the
 * UI; never the model's opinion. A stored ad has all three true. */
export interface AdCheckFlags {
  limits_ok: boolean // counts, lengths and format: 3-15 headlines of at most 30, 2-4 descriptions of at most 90, paths of at most 15
  numbers_from_facts: boolean // every number in the copy comes from `facts`
  claims_allowed: boolean // no claim the dealer profile does not allow
}

/** Contract 3.6 — everything an ad's copy is allowed to say, from the
 * available units of the target make/model and the dealer profile. */
export interface AdFacts {
  make: string | null
  model: string | null
  units: number
  year_from: number | null
  year_to: number | null
  price_from_idr: number | null
  price_to_idr: number | null
  mileage_from_km: number | null
  dealer: string
  city: string | null
  area: string | null
  whatsapp: string | null
  claims_used: AdClaim[] // only claims whose setting is 'true'
  snapshot_on: string
}

export type AdTarget =
  | { kind: 'existing_ad_group'; ad_group_id: number }
  | { kind: 'proposed_campaign'; campaign_suggestion_id: number; ad_group_name: string }

/** Contract 3.6 — a new responsive search ad, computed in code
 * (src/optimizer/ads.ts); only headlines/descriptions may come from the
 * model's polish, and only when they pass every check. */
export interface NewAdPayload {
  kind: 'new_ad'
  target: AdTarget
  basis: AdBasis
  headlines: { text: string }[]
  descriptions: { text: string }[]
  path1: string | null
  path2: string | null
  final_url: string | null // null until the dealer profile has a landing page
  facts: AdFacts
  winner_keywords: { keyword_id: number | null; text: string }[]
  replaces_ad: { id: number; label: string; ad_strength: 'poor' | 'average' | 'good' | 'excellent' | null } | null
  checks: AdCheckFlags
  polished: boolean // true when the model reworded the template copy and it passed validation
}

export interface SuggestionEvidence {
  window_start: string
  window_end: string
  clicks: number | null
  impressions: number | null
  cost_micros: number | null
  conversions: number | null
  conversions_value_micros: number | null
  min_clicks_required: number | null // the n_min threshold used
  [extra: string]: unknown // type-specific numbers, e.g. parent_keyword_cpa_micros
}

export interface ExpectedImpact {
  wasted_spend_micros_per_week?: number
  extra_conversions_per_week?: number
}
