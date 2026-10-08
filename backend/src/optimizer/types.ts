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

/** Contract 3.6 — one check over an ad's copy (src/optimizer/adCopy.ts). */
export interface AdCheck {
  ok: boolean
  problems: string[]
}

/** Contract 3.6 — the only source of any number or claim in an ad's copy,
 * computed from one inventory snapshot and the dealer settings. */
export interface AdFacts {
  make: string
  model: string | null // null = a make-level ad group (several models)
  models: string[]
  units: number
  year_min: number
  year_max: number
  price_min_idr: number
  price_max_idr: number
  vehicle_ids: number[]
  dealer: { name: string; city: string; area: string | null; whatsapp: string | null }
  claims: { installments: boolean; trade_in: boolean; test_drive: boolean; inspection: boolean }
  inspection_wording: string | null // set when claims.inspection
  snapshot_on: string
}

/** Contract 3.6 — a new responsive search ad, computed in code
 * (src/optimizer/ads.ts); only headlines/descriptions may come from the
 * model's polish, and only when they pass every check. */
export interface NewAdPayload {
  kind: 'new_ad'
  basis: AdBasis
  ad_target: string // where the ad goes, stable across runs
  campaign_suggestion_id: number | null // basis new_campaign: the proposal it belongs to
  campaign_name: string
  ad_group_name: string
  replaces_ad_id: number | null // weak_ad
  final_url: string | null
  final_url_source: 'setting' | 'ad_group' | 'account' | null
  path1: string | null
  path2: string | null
  headlines: string[]
  descriptions: string[]
  copy_source: 'template' | 'model'
  template: { headlines: string[]; descriptions: string[] }
  facts: AdFacts
  winner_keywords: { text: string; source: 'keyword' | 'search_term'; keyword_id: number | null; search_term_id: number | null }[]
  checks: { limits: AdCheck; facts: AdCheck; style: AdCheck }
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
