// Used-car-dealer demo profile — see dummy.md for the sourcing/reasoning.
// Every number here traces back to dummy.md; change the profile there
// first, then mirror it here.

export const START_DATE = '2026-06-01' // ~10 weeks of history by "today"

// Blended daily baseline across all 5 campaigns (dummy.md → Budget & Daily Volume).
export const BASELINE_IMPRESSIONS = 1500
export const BASELINE_CLICKS = 57
export const BASELINE_CONVERSIONS = 4.5
export const BASELINE_CPC_MICROS = 1_600 * 1_000_000 // ~Rp1,600, mid-point of the Rp1,200-2,000 range

export interface CampaignProfile {
  key: string
  name: string
  weight: number
  sensitivity: number
}

// name, share of the daily baseline, sensitivity to the day's Markov state
// (see PROJECT.md → Standout Features: PMax/in-market swing hardest, Brand stays stable).
export const CAMPAIGNS: CampaignProfile[] = [
  { key: 'brand', name: 'Brand', weight: 0.1, sensitivity: 0.2 },
  { key: 'search_generic', name: 'Search — Used Cars Generic', weight: 0.2, sensitivity: 0.8 },
  { key: 'search_model', name: 'Search — Model + Suburb', weight: 0.25, sensitivity: 0.9 },
  { key: 'pmax', name: 'Performance Max — Vehicle Inventory', weight: 0.35, sensitivity: 1.2 },
  { key: 'display', name: 'Display Remarketing', weight: 0.1, sensitivity: 0.7 },
]

// The deliberate "clear declining trend" required by PROJECT.md's synthetic
// dataset spec — applied as a linear multiplier drift on top of the Markov
// state, isolated to one campaign so it reads as a real, specific problem.
export const DECLINING_CAMPAIGN = 'search_model'
export const DECLINE_START_DAY = 25 // days since START_DATE
export const DECLINE_DURATION_DAYS = 30
export const DECLINE_TOTAL_DROP = 0.35 // down to 65% of baseline by the end of the decline

// The deliberate "seasonal spike" — a short promo window, independent of state.
export const SEASONAL_SPIKE_START_DAY = 45
export const SEASONAL_SPIKE_DURATION_DAYS = 5
export const SEASONAL_SPIKE_MULTIPLIER = 1.6

export interface DeviceProfile {
  value: string
  share: number
}
export const DEVICES: DeviceProfile[] = [
  { value: 'Mobile', share: 0.55 },
  { value: 'Desktop', share: 0.35 },
  { value: 'Tablet', share: 0.1 },
]

export interface GeographyProfile {
  value: string
  share: number
  sensitivityBoost: number
}
// One geography deliberately outperforms — the "subtle insight": it never
// shows up in campaign-level totals, only if you drill into segment data.
export const GEOGRAPHIES: GeographyProfile[] = [
  { value: 'Bandung, ID', share: 0.22, sensitivityBoost: 1.6 },
  { value: 'Bekasi, ID', share: 0.18, sensitivityBoost: 1.0 },
  { value: 'Depok, ID', share: 0.16, sensitivityBoost: 1.0 },
  { value: 'Tangerang, ID', share: 0.16, sensitivityBoost: 1.0 },
  { value: 'Bogor, ID', share: 0.14, sensitivityBoost: 1.0 },
  { value: 'Jakarta, ID', share: 0.14, sensitivityBoost: 1.0 },
]
export const OUTPERFORMING_GEOGRAPHY = 'Bandung, ID'

export interface RemarketingProfile {
  value: string
  share: number
}
// Display Remarketing's own behavior segments (dummy.md → custom segment_type).
export const REMARKETING_SEGMENTS: RemarketingProfile[] = [
  { value: 'Viewed VDP', share: 0.4 },
  { value: 'Started Credit App', share: 0.2 },
  { value: 'Visited Financing Page', share: 0.25 },
  { value: 'Viewed Trade-In Value', share: 0.15 },
]

// Campaigns that get a geography breakdown (kept to 2 to bound row count).
export const GEOGRAPHY_CAMPAIGNS = ['search_generic', 'pmax']

// v2 Stage 1 — ad groups + keywords + Quality Score. See docs/v2-*-plan.md.
// Only the 3 Search-type campaigns get ad groups: PMax has no ad-group
// level in the real API (it's asset-group based, see Stage 6), and Display
// is deliberately excluded too to bound row count.
export interface AdGroupProfile {
  key: string
  campaignKey: string
  name: string
  share: number // share of the parent campaign's daily totals
}

export const AD_GROUPS: AdGroupProfile[] = [
  { key: 'brand_dealer_name', campaignKey: 'brand', name: 'Brand — Dealer Name', share: 0.6 },
  { key: 'brand_location', campaignKey: 'brand', name: 'Brand — Location Variants', share: 0.4 },
  { key: 'generic_used_cars', campaignKey: 'search_generic', name: 'Used Cars Generic', share: 0.55 },
  { key: 'generic_used_suvs', campaignKey: 'search_generic', name: 'Used SUVs Generic', share: 0.45 },
  { key: 'model_toyota', campaignKey: 'search_model', name: 'Model — Toyota', share: 0.35 },
  { key: 'model_honda', campaignKey: 'search_model', name: 'Model — Honda', share: 0.3 },
  { key: 'model_suzuki', campaignKey: 'search_model', name: 'Model — Suzuki', share: 0.2 },
  { key: 'model_daihatsu', campaignKey: 'search_model', name: 'Model — Daihatsu', share: 0.15 },
]

export interface KeywordProfile {
  key: string
  adGroupKey: string
  text: string
  matchType: 'exact' | 'phrase' | 'broad'
  share: number // share of the parent ad group's daily totals
  baseQualityScore: number // 1-10; search_model's keywords erode from this as the decline progresses
}

// 3 keywords per ad group, share of the parent ad group's totals. Base
// QS 6-8 — realistic mid-to-good range, not universally excellent (leaves
// room for the decline-tied erosion on search_model to read as a real drop
// rather than a floor being hit).
export const KEYWORDS: KeywordProfile[] = [
  // Brand — Dealer Name
  { key: 'kw_brand_name_exact', adGroupKey: 'brand_dealer_name', text: '[dealer name]', matchType: 'exact', share: 0.5, baseQualityScore: 8 },
  { key: 'kw_brand_name_phrase', adGroupKey: 'brand_dealer_name', text: '"dealer name used cars"', matchType: 'phrase', share: 0.3, baseQualityScore: 8 },
  { key: 'kw_brand_name_broad', adGroupKey: 'brand_dealer_name', text: 'dealer name', matchType: 'broad', share: 0.2, baseQualityScore: 7 },
  // Brand — Location Variants
  { key: 'kw_brand_loc_exact', adGroupKey: 'brand_location', text: '[dealer name jakarta]', matchType: 'exact', share: 0.45, baseQualityScore: 8 },
  { key: 'kw_brand_loc_phrase', adGroupKey: 'brand_location', text: '"dealer name near me"', matchType: 'phrase', share: 0.35, baseQualityScore: 7 },
  { key: 'kw_brand_loc_broad', adGroupKey: 'brand_location', text: 'dealer name location', matchType: 'broad', share: 0.2, baseQualityScore: 7 },
  // Used Cars Generic
  { key: 'kw_generic_cars_broad', adGroupKey: 'generic_used_cars', text: 'used cars for sale', matchType: 'broad', share: 0.4, baseQualityScore: 6 },
  { key: 'kw_generic_cars_phrase', adGroupKey: 'generic_used_cars', text: '"used cars jakarta"', matchType: 'phrase', share: 0.35, baseQualityScore: 7 },
  { key: 'kw_generic_cars_exact', adGroupKey: 'generic_used_cars', text: '[used cars near me]', matchType: 'exact', share: 0.25, baseQualityScore: 7 },
  // Used SUVs Generic
  { key: 'kw_generic_suvs_broad', adGroupKey: 'generic_used_suvs', text: 'used suvs for sale', matchType: 'broad', share: 0.45, baseQualityScore: 6 },
  { key: 'kw_generic_suvs_phrase', adGroupKey: 'generic_used_suvs', text: '"used suv near me"', matchType: 'phrase', share: 0.3, baseQualityScore: 6 },
  { key: 'kw_generic_suvs_exact', adGroupKey: 'generic_used_suvs', text: '[used suv jakarta]', matchType: 'exact', share: 0.25, baseQualityScore: 7 },
  // Model — Toyota
  { key: 'kw_toyota_exact', adGroupKey: 'model_toyota', text: '[used toyota jakarta]', matchType: 'exact', share: 0.4, baseQualityScore: 7 },
  { key: 'kw_toyota_phrase', adGroupKey: 'model_toyota', text: '"used toyota for sale"', matchType: 'phrase', share: 0.35, baseQualityScore: 7 },
  { key: 'kw_toyota_broad', adGroupKey: 'model_toyota', text: 'used toyota near me', matchType: 'broad', share: 0.25, baseQualityScore: 6 },
  // Model — Honda
  { key: 'kw_honda_exact', adGroupKey: 'model_honda', text: '[used honda jakarta]', matchType: 'exact', share: 0.4, baseQualityScore: 7 },
  { key: 'kw_honda_phrase', adGroupKey: 'model_honda', text: '"used honda for sale"', matchType: 'phrase', share: 0.35, baseQualityScore: 6 },
  { key: 'kw_honda_broad', adGroupKey: 'model_honda', text: 'used honda near me', matchType: 'broad', share: 0.25, baseQualityScore: 6 },
  // Model — Suzuki
  { key: 'kw_suzuki_exact', adGroupKey: 'model_suzuki', text: '[used suzuki jakarta]', matchType: 'exact', share: 0.4, baseQualityScore: 7 },
  { key: 'kw_suzuki_phrase', adGroupKey: 'model_suzuki', text: '"used suzuki for sale"', matchType: 'phrase', share: 0.35, baseQualityScore: 6 },
  { key: 'kw_suzuki_broad', adGroupKey: 'model_suzuki', text: 'used suzuki near me', matchType: 'broad', share: 0.25, baseQualityScore: 6 },
  // Model — Daihatsu
  { key: 'kw_daihatsu_exact', adGroupKey: 'model_daihatsu', text: '[used daihatsu jakarta]', matchType: 'exact', share: 0.4, baseQualityScore: 7 },
  { key: 'kw_daihatsu_phrase', adGroupKey: 'model_daihatsu', text: '"used daihatsu for sale"', matchType: 'phrase', share: 0.35, baseQualityScore: 6 },
  { key: 'kw_daihatsu_broad', adGroupKey: 'model_daihatsu', text: 'used daihatsu near me', matchType: 'broad', share: 0.25, baseQualityScore: 6 },
]

// How much base Quality Score search_model's keywords can erode by the end
// of the decline window (see generator.ts's declineMultiplier) — ties QS
// drift causally to the existing decline story instead of being a second,
// disconnected feature.
export const QS_EROSION_MAX_POINTS = 3
