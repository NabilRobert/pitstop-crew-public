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

// 3-5 keywords per ad group, share of the parent ad group's totals. Base
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

// v2 Stage 2 — search terms. See docs/v2-backend-plan.md. Anchored to
// exactly one triggering keyword (a deliberate simplification vs. the real
// API's looser attribution). Each keyword gets exactly 2: 1 close_variant
// (a near-exact rewording of what was actually bid on, gets the larger
// share — realistic, since close variants dominate search-term volume for
// a well-targeted keyword) + 1 broader (a more generic/adjacent phrase,
// smaller share — the kind of term worth reviewing as a negative-keyword
// candidate if it's burning spend with nothing to show for it).
export interface SearchTermProfile {
  key: string
  keywordKey: string
  adGroupKey: string
  text: string
  matchFlavor: 'close_variant' | 'broader'
  share: number // share of the parent keyword's daily totals
}

export const SEARCH_TERMS: SearchTermProfile[] = [
  { key: 'st_brand_name_exact_close', keywordKey: 'kw_brand_name_exact', adGroupKey: 'brand_dealer_name', text: 'dealer name reviews', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_brand_name_exact_broad', keywordKey: 'kw_brand_name_exact', adGroupKey: 'brand_dealer_name', text: 'car dealer jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_brand_name_phrase_close', keywordKey: 'kw_brand_name_phrase', adGroupKey: 'brand_dealer_name', text: 'dealer name used car lot', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_brand_name_phrase_broad', keywordKey: 'kw_brand_name_phrase', adGroupKey: 'brand_dealer_name', text: 'used car dealership jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_brand_name_broad_close', keywordKey: 'kw_brand_name_broad', adGroupKey: 'brand_dealer_name', text: 'dealer name cars', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_brand_name_broad_broad', keywordKey: 'kw_brand_name_broad', adGroupKey: 'brand_dealer_name', text: 'car dealership near me', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_brand_loc_exact_close', keywordKey: 'kw_brand_loc_exact', adGroupKey: 'brand_location', text: 'dealer name jakarta selatan', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_brand_loc_exact_broad', keywordKey: 'kw_brand_loc_exact', adGroupKey: 'brand_location', text: 'car dealer jakarta selatan', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_brand_loc_phrase_close', keywordKey: 'kw_brand_loc_phrase', adGroupKey: 'brand_location', text: 'dealer name close by', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_brand_loc_phrase_broad', keywordKey: 'kw_brand_loc_phrase', adGroupKey: 'brand_location', text: 'nearest used car dealer', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_brand_loc_broad_close', keywordKey: 'kw_brand_loc_broad', adGroupKey: 'brand_location', text: 'dealer name address', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_brand_loc_broad_broad', keywordKey: 'kw_brand_loc_broad', adGroupKey: 'brand_location', text: 'car dealership location jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_generic_cars_broad_close', keywordKey: 'kw_generic_cars_broad', adGroupKey: 'generic_used_cars', text: 'used cars for sale near me', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_generic_cars_broad_broad', keywordKey: 'kw_generic_cars_broad', adGroupKey: 'generic_used_cars', text: 'buy used car indonesia', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_generic_cars_phrase_close', keywordKey: 'kw_generic_cars_phrase', adGroupKey: 'generic_used_cars', text: 'used cars jakarta selatan', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_generic_cars_phrase_broad', keywordKey: 'kw_generic_cars_phrase', adGroupKey: 'generic_used_cars', text: 'mobil bekas jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_generic_cars_exact_close', keywordKey: 'kw_generic_cars_exact', adGroupKey: 'generic_used_cars', text: 'used cars near me now', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_generic_cars_exact_broad', keywordKey: 'kw_generic_cars_exact', adGroupKey: 'generic_used_cars', text: 'cheap used cars jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_generic_suvs_broad_close', keywordKey: 'kw_generic_suvs_broad', adGroupKey: 'generic_used_suvs', text: 'used suvs for sale near me', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_generic_suvs_broad_broad', keywordKey: 'kw_generic_suvs_broad', adGroupKey: 'generic_used_suvs', text: 'buy used suv indonesia', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_generic_suvs_phrase_close', keywordKey: 'kw_generic_suvs_phrase', adGroupKey: 'generic_used_suvs', text: 'used suv near me now', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_generic_suvs_phrase_broad', keywordKey: 'kw_generic_suvs_phrase', adGroupKey: 'generic_used_suvs', text: 'mobil suv bekas jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_generic_suvs_exact_close', keywordKey: 'kw_generic_suvs_exact', adGroupKey: 'generic_used_suvs', text: 'used suv jakarta selatan', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_generic_suvs_exact_broad', keywordKey: 'kw_generic_suvs_exact', adGroupKey: 'generic_used_suvs', text: 'cheap used suv jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_toyota_exact_close', keywordKey: 'kw_toyota_exact', adGroupKey: 'model_toyota', text: 'used toyota jakarta selatan', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_toyota_exact_broad', keywordKey: 'kw_toyota_exact', adGroupKey: 'model_toyota', text: 'toyota bekas jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_toyota_phrase_close', keywordKey: 'kw_toyota_phrase', adGroupKey: 'model_toyota', text: 'used toyota for sale near me', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_toyota_phrase_broad', keywordKey: 'kw_toyota_phrase', adGroupKey: 'model_toyota', text: 'toyota dealer used cars', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_toyota_broad_close', keywordKey: 'kw_toyota_broad', adGroupKey: 'model_toyota', text: 'used toyota nearby', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_toyota_broad_broad', keywordKey: 'kw_toyota_broad', adGroupKey: 'model_toyota', text: 'toyota second jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_honda_exact_close', keywordKey: 'kw_honda_exact', adGroupKey: 'model_honda', text: 'used honda jakarta selatan', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_honda_exact_broad', keywordKey: 'kw_honda_exact', adGroupKey: 'model_honda', text: 'honda bekas jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_honda_phrase_close', keywordKey: 'kw_honda_phrase', adGroupKey: 'model_honda', text: 'used honda for sale near me', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_honda_phrase_broad', keywordKey: 'kw_honda_phrase', adGroupKey: 'model_honda', text: 'honda dealer used cars', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_honda_broad_close', keywordKey: 'kw_honda_broad', adGroupKey: 'model_honda', text: 'used honda nearby', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_honda_broad_broad', keywordKey: 'kw_honda_broad', adGroupKey: 'model_honda', text: 'honda second jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_suzuki_exact_close', keywordKey: 'kw_suzuki_exact', adGroupKey: 'model_suzuki', text: 'used suzuki jakarta selatan', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_suzuki_exact_broad', keywordKey: 'kw_suzuki_exact', adGroupKey: 'model_suzuki', text: 'suzuki bekas jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_suzuki_phrase_close', keywordKey: 'kw_suzuki_phrase', adGroupKey: 'model_suzuki', text: 'used suzuki for sale near me', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_suzuki_phrase_broad', keywordKey: 'kw_suzuki_phrase', adGroupKey: 'model_suzuki', text: 'suzuki dealer used cars', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_suzuki_broad_close', keywordKey: 'kw_suzuki_broad', adGroupKey: 'model_suzuki', text: 'used suzuki nearby', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_suzuki_broad_broad', keywordKey: 'kw_suzuki_broad', adGroupKey: 'model_suzuki', text: 'suzuki second jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_daihatsu_exact_close', keywordKey: 'kw_daihatsu_exact', adGroupKey: 'model_daihatsu', text: 'used daihatsu jakarta selatan', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_daihatsu_exact_broad', keywordKey: 'kw_daihatsu_exact', adGroupKey: 'model_daihatsu', text: 'daihatsu bekas jakarta', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_daihatsu_phrase_close', keywordKey: 'kw_daihatsu_phrase', adGroupKey: 'model_daihatsu', text: 'used daihatsu for sale near me', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_daihatsu_phrase_broad', keywordKey: 'kw_daihatsu_phrase', adGroupKey: 'model_daihatsu', text: 'daihatsu dealer used cars', matchFlavor: 'broader', share: 0.4 },
  { key: 'st_daihatsu_broad_close', keywordKey: 'kw_daihatsu_broad', adGroupKey: 'model_daihatsu', text: 'used daihatsu nearby', matchFlavor: 'close_variant', share: 0.6 },
  { key: 'st_daihatsu_broad_broad', keywordKey: 'kw_daihatsu_broad', adGroupKey: 'model_daihatsu', text: 'daihatsu second jakarta', matchFlavor: 'broader', share: 0.4 },
]

// v2 Stage 3 — ads/creatives. See docs/v2-backend-plan.md. 2 static
// RSA-style ads per ad group (16 total — the low end of the plan's "2-3"
// range, same reasoning as Stage 2's search-term count), each themed per
// ad group. ad_strength is loosely correlated with share within each pair
// — the higher-share ad in a pair has the better rating, a one-time
// design choice (not day-to-day drift, unlike Quality Score — see
// schema.sql's comment on why ad_strength lives on `ads`, not a
// per-day performance table).
export interface AdProfile {
  key: string
  adGroupKey: string
  label: string
  headlines: string[]
  descriptions: string[]
  finalUrl: string
  adStrength: 'poor' | 'average' | 'good' | 'excellent'
  share: number // share of the parent ad group's daily totals
}

export const ADS: AdProfile[] = [
  // Brand — Dealer Name
  {
    key: 'ad_brand_name_a',
    adGroupKey: 'brand_dealer_name',
    label: 'Brand — Dealer Name A',
    headlines: ['Dealer Name Used Cars', 'Trusted Jakarta Car Dealer', 'Quality Pre-Owned Vehicles', 'Visit Our Showroom Today', 'Best Prices Guaranteed'],
    descriptions: ['Browse hundreds of certified used cars with warranty included.', 'Trade in your car and drive home the same day.', 'Financing available for all credit types.'],
    finalUrl: 'https://dealername.example.com/',
    adStrength: 'excellent',
    share: 0.6,
  },
  {
    key: 'ad_brand_name_b',
    adGroupKey: 'brand_dealer_name',
    label: 'Brand — Dealer Name B',
    headlines: ['Dealer Name Car Sales', 'Used Cars Jakarta', 'Great Deals Every Day', 'Shop Our Inventory Online'],
    descriptions: ['Find your next car from our large selection.', 'Easy financing and fast approval.'],
    finalUrl: 'https://dealername.example.com/',
    adStrength: 'good',
    share: 0.4,
  },
  // Brand — Location Variants
  {
    key: 'ad_brand_loc_a',
    adGroupKey: 'brand_location',
    label: 'Brand — Location A',
    headlines: ["Dealer Name Near You", "Jakarta's Trusted Dealer", 'Convenient Locations', 'Test Drive Today', 'Open 7 Days a Week'],
    descriptions: ['Multiple locations across Jakarta for your convenience.', 'Walk in or book a test drive online.', 'Friendly staff ready to help you find the right car.'],
    finalUrl: 'https://dealername.example.com/locations',
    adStrength: 'good',
    share: 0.55,
  },
  {
    key: 'ad_brand_loc_b',
    adGroupKey: 'brand_location',
    label: 'Brand — Location B',
    headlines: ['Find Dealer Name', 'Nearby Car Dealer', 'Visit Us Today', 'Cars For Every Budget'],
    descriptions: ['Check our location hours and directions.', 'Ask about our current promotions.'],
    finalUrl: 'https://dealername.example.com/locations',
    adStrength: 'average',
    share: 0.45,
  },
  // Used Cars Generic
  {
    key: 'ad_generic_cars_a',
    adGroupKey: 'generic_used_cars',
    label: 'Used Cars Generic A',
    headlines: ['Used Cars For Sale', 'Certified Pre-Owned Cars', 'Affordable Used Vehicles', 'Inspected & Warrantied', 'Shop Used Cars Online'],
    descriptions: ['Every car passes a 150-point inspection before sale.', 'Flexible financing options for every budget.', 'New inventory added weekly.'],
    finalUrl: 'https://dealername.example.com/used-cars',
    adStrength: 'good',
    share: 0.55,
  },
  {
    key: 'ad_generic_cars_b',
    adGroupKey: 'generic_used_cars',
    label: 'Used Cars Generic B',
    headlines: ['Buy A Used Car Today', 'Used Car Deals Jakarta', 'Reliable Used Vehicles', 'Great Selection In Stock'],
    descriptions: ['Browse our full inventory online.', 'Trade-ins welcome, get an instant quote.'],
    finalUrl: 'https://dealername.example.com/used-cars',
    adStrength: 'average',
    share: 0.45,
  },
  // Used SUVs Generic
  {
    key: 'ad_generic_suvs_a',
    adGroupKey: 'generic_used_suvs',
    label: 'Used SUVs Generic A',
    headlines: ['Used SUVs For Sale', 'Family-Ready SUVs', 'Spacious & Reliable', 'Certified Used SUVs', 'Test Drive An SUV Today'],
    descriptions: ['Explore our selection of family-friendly SUVs.', 'All SUVs inspected and warrantied.', 'Financing available, apply online in minutes.'],
    finalUrl: 'https://dealername.example.com/used-suvs',
    adStrength: 'good',
    share: 0.55,
  },
  {
    key: 'ad_generic_suvs_b',
    adGroupKey: 'generic_used_suvs',
    label: 'Used SUVs Generic B',
    headlines: ['Buy A Used SUV', 'SUV Deals Jakarta', 'Spacious Used SUVs In Stock', 'Shop SUVs Online'],
    descriptions: ['Check out our current SUV inventory.', 'Ask about trade-in value today.'],
    finalUrl: 'https://dealername.example.com/used-suvs',
    adStrength: 'average',
    share: 0.45,
  },
  // Model — Toyota
  {
    key: 'ad_toyota_a',
    adGroupKey: 'model_toyota',
    label: 'Model Toyota A',
    headlines: ['Used Toyota For Sale', 'Certified Toyota Vehicles', 'Reliable Toyota Models', 'Toyota Financing Available', 'Shop Toyota Inventory'],
    descriptions: ['Every used Toyota is inspected and warrantied.', 'Flexible financing plans to fit your budget.', 'Ask about our Toyota trade-in program.'],
    finalUrl: 'https://dealername.example.com/toyota',
    adStrength: 'good',
    share: 0.6,
  },
  {
    key: 'ad_toyota_b',
    adGroupKey: 'model_toyota',
    label: 'Model Toyota B',
    headlines: ['Buy A Used Toyota', 'Toyota Deals Jakarta', 'Toyota Models In Stock'],
    descriptions: ['Browse our Toyota inventory online.', 'Great prices on quality Toyota vehicles.'],
    finalUrl: 'https://dealername.example.com/toyota',
    adStrength: 'average',
    share: 0.4,
  },
  // Model — Honda
  {
    key: 'ad_honda_a',
    adGroupKey: 'model_honda',
    label: 'Model Honda A',
    headlines: ['Used Honda For Sale', 'Certified Honda Vehicles', 'Reliable Honda Models', 'Honda Financing Available', 'Shop Honda Inventory'],
    descriptions: ['Every used Honda is inspected and warrantied.', 'Flexible financing plans to fit your budget.', 'Ask about our Honda trade-in program.'],
    finalUrl: 'https://dealername.example.com/honda',
    adStrength: 'good',
    share: 0.6,
  },
  {
    key: 'ad_honda_b',
    adGroupKey: 'model_honda',
    label: 'Model Honda B',
    headlines: ['Buy A Used Honda', 'Honda Deals Jakarta', 'Honda Models In Stock'],
    descriptions: ['Browse our Honda inventory online.', 'Great prices on quality Honda vehicles.'],
    finalUrl: 'https://dealername.example.com/honda',
    adStrength: 'average',
    share: 0.4,
  },
  // Model — Suzuki
  {
    key: 'ad_suzuki_a',
    adGroupKey: 'model_suzuki',
    label: 'Model Suzuki A',
    headlines: ['Used Suzuki For Sale', 'Suzuki Vehicles In Stock', 'Affordable Suzuki Models', 'Shop Suzuki Inventory'],
    descriptions: ['Browse our Suzuki inventory online.', 'Ask about financing options today.'],
    finalUrl: 'https://dealername.example.com/suzuki',
    adStrength: 'average',
    share: 0.55,
  },
  {
    key: 'ad_suzuki_b',
    adGroupKey: 'model_suzuki',
    label: 'Model Suzuki B',
    headlines: ['Buy A Used Suzuki', 'Suzuki Deals Jakarta', 'Suzuki Models Available'],
    descriptions: ['Check out our current Suzuki listings.', 'Great prices on used Suzuki cars.'],
    finalUrl: 'https://dealername.example.com/suzuki',
    adStrength: 'poor',
    share: 0.45,
  },
  // Model — Daihatsu
  {
    key: 'ad_daihatsu_a',
    adGroupKey: 'model_daihatsu',
    label: 'Model Daihatsu A',
    headlines: ['Used Daihatsu For Sale', 'Daihatsu Vehicles In Stock', 'Affordable Daihatsu Models', 'Shop Daihatsu Inventory'],
    descriptions: ['Browse our Daihatsu inventory online.', 'Ask about financing options today.'],
    finalUrl: 'https://dealername.example.com/daihatsu',
    adStrength: 'average',
    share: 0.55,
  },
  {
    key: 'ad_daihatsu_b',
    adGroupKey: 'model_daihatsu',
    label: 'Model Daihatsu B',
    headlines: ['Buy A Used Daihatsu', 'Daihatsu Deals Jakarta', 'Daihatsu Models Available'],
    descriptions: ['Check out our current Daihatsu listings.', 'Great prices on used Daihatsu cars.'],
    finalUrl: 'https://dealername.example.com/daihatsu',
    adStrength: 'poor',
    share: 0.45,
  },
]

// v2 Stage 4 — impression share + optimization score. See docs/v2-*-plan.md.
// Only the 3 Search-type campaigns get these (see schema.sql's comment) —
// PMax and Display stay NULL for both. Base impression share reflects a
// realistic competitiveness spread: Brand is near-uncontested (0.80),
// the two non-branded Search campaigns face real auction competition
// (0.50/0.35). baseBudgetLostImpressionShare is also highest for
// search_model even at baseline — consistent with it already being the
// account's weakest-budgeted campaign before the decline compounds it.
export interface ImpressionShareProfile {
  campaignKey: string
  baseImpressionShare: number
  baseBudgetLostImpressionShare: number
  baseOptimizationScore: number // 0-1, mirrors Google Ads' own account/campaign health score
}

// search_model's baseBudgetLostImpressionShare (0.3) is deliberately set
// close to its implied baseline rank-lost share (1 - 0.35 - 0.3 = 0.35,
// before any erosion) rather than far below it — with a lower base
// (e.g. 0.2, implying a 0.45 baseline rank-lost share) the erosion below
// only ever narrows the gap without closing it, so budget-lost stays the
// visibly smaller number in absolute terms even at full erosion and a
// model asked "which is the bigger factor?" reasonably answers "rank,"
// undermining the intended "the decline is budget-driven" narrative.
// Starting the two nearly tied means the erosion below actually flips
// budget-lost into the dominant factor, making that reading unambiguous.
export const IMPRESSION_SHARE_CAMPAIGNS: ImpressionShareProfile[] = [
  { campaignKey: 'brand', baseImpressionShare: 0.8, baseBudgetLostImpressionShare: 0.05, baseOptimizationScore: 0.82 },
  { campaignKey: 'search_generic', baseImpressionShare: 0.5, baseBudgetLostImpressionShare: 0.15, baseOptimizationScore: 0.68 },
  { campaignKey: 'search_model', baseImpressionShare: 0.35, baseBudgetLostImpressionShare: 0.3, baseOptimizationScore: 0.6 },
]

// How much search_model's impression share can erode — and its
// budget-lost share can grow — by the end of the decline window, tied to
// the same declineMultiplier driving its performance drop and QS erosion
// (see generator.ts/keywords above). The two move by the SAME amount, so
// derived rank-lost share (1 - is - budget_lost) stays roughly constant —
// telling a coherent, correlatable story: the decline is budget-driven,
// not a rank/competitiveness problem. Combined with the near-tied
// baseline above, this erosion is enough to flip budget-lost from
// roughly even with rank-lost to clearly the larger of the two by the
// end of the decline (0.3 + 0.12 = 0.42 vs. a ~0.35 rank-lost share that
// stays flat throughout).
export const IS_BUDGET_LOST_EROSION_MAX = 0.12

// How much search_model's optimization_score can additionally drop by
// the end of the decline window — independent of the impression-share
// erosion above (Google Ads' Optimization Score reflects a broader mix
// of signals than just impression share).
export const OPTIMIZATION_SCORE_DECLINE_DROP = 0.15

// v2 Stage 5 — named conversion actions. See docs/v2-*-plan.md. Account-
// wide, not scoped to any one campaign or ad group — every campaign's
// daily conversions total is split across these same 4 named actions
// (unlike ad groups/keywords/ads, which only exist under the 3 Search
// campaigns). "Phone Call" and "Financing Page Visit" deliberately echo
// two of Display Remarketing's existing custom segment values ("same
// funnel, different view") — Display's segment stays untouched, this is
// a genuinely separate table, not a migration of it.
export interface ConversionActionProfile {
  key: string
  name: string
  category: string
  countingType: 'ONE_PER_CLICK' | 'MANY_PER_CLICK'
  share: number // share of every campaign's daily conversions total
}

export const CONVERSION_ACTIONS: ConversionActionProfile[] = [
  { key: 'test_drive_booked', name: 'Test Drive Booked', category: 'SUBMIT_LEAD_FORM', countingType: 'ONE_PER_CLICK', share: 0.3 },
  { key: 'credit_app_started', name: 'Credit App Started', category: 'SUBMIT_LEAD_FORM', countingType: 'ONE_PER_CLICK', share: 0.2 },
  { key: 'phone_call', name: 'Phone Call', category: 'PHONE_CALL_LEAD', countingType: 'ONE_PER_CLICK', share: 0.3 },
  { key: 'financing_page_visit', name: 'Financing Page Visit', category: 'PAGE_VIEW', countingType: 'MANY_PER_CLICK', share: 0.2 },
]

// v2 Stage 6 — PMax asset groups. See docs/v2-*-plan.md. Scoped to the
// `pmax` campaign only — PMax has no ad-group level in the real API
// (asset-group based instead, see AD_GROUPS' comment). Themed by vehicle
// category, splitting pmax's daily totals the same way ad groups split
// their parent campaign's (via noisyConservingSplit — this is a genuine
// sub-hierarchy, unlike Stage 5's flat account-wide conversion-action
// split). adStrength is treated as static per asset group here (see
// schema.sql's comment) even though the column lives on the per-day
// performance table — matches Stage 3's ads.ad_strength simplification.
export interface AssetGroupProfile {
  key: string
  name: string
  share: number // share of pmax's daily totals
  adStrength: 'poor' | 'average' | 'good' | 'excellent'
}

export const ASSET_GROUPS: AssetGroupProfile[] = [
  { key: 'suvs_crossovers', name: 'SUVs & Crossovers', share: 0.35, adStrength: 'good' },
  { key: 'sedans', name: 'Sedans', share: 0.3, adStrength: 'good' },
  { key: 'trucks_pickups', name: 'Trucks & Pickups', share: 0.2, adStrength: 'average' },
  { key: 'hatchbacks', name: 'Hatchbacks', share: 0.15, adStrength: 'average' },
]

// v2 Stage 7 — Google Ads' own Recommendations. See docs/v2-*-plan.md
// decision #7: episodic/scripted, not generated inside the daily Markov
// loop — a static, hand-authored list (same pattern as DECLINE_START_DAY/
// SEASONAL_SPIKE_START_DAY), resolved into absolute dates by
// scriptedEvents.ts. dayOffset is days since START_DATE, same convention
// as the decline/spike constants above.
//
// The budget recommendation for search_model is deliberately dated after
// DECLINE_START_DAY + DECLINE_DURATION_DAYS (i.e. once the decline is
// well underway and its budget-lost impression share — Stage 4 — is
// visibly elevated) — a genuine "why" story: this recommendation exists
// *because* that diagnosis is already visible in the data, not two
// disconnected features. The RSA-asset recommendation similarly targets
// Model Suzuki B, the poor-rated ad from Stage 3. dismissed/applied vary
// across the list on purpose — a real account has a mix of pending,
// dismissed, and already-applied recommendations, not a uniform state.
export interface RecommendationProfile {
  key: string
  campaignKey: string | null // null = account-level
  recommendationType: string
  title: string
  description: string
  impactImpressionsPct: number | null
  impactConversionsPct: number | null
  dismissed: boolean
  applied: boolean
  dayOffset: number
}

export const RECOMMENDATIONS: RecommendationProfile[] = [
  {
    key: 'rec_search_model_budget',
    campaignKey: 'search_model',
    recommendationType: 'CAMPAIGN_BUDGET',
    title: 'Increase budget for Search — Model + Suburb',
    description:
      'This campaign is losing a significant share of impressions to budget constraints, not ad rank. Raising the daily budget could recover missed impressions and conversions.',
    impactImpressionsPct: 18,
    impactConversionsPct: 12,
    dismissed: false,
    applied: false,
    dayOffset: 65,
  },
  {
    key: 'rec_suzuki_rsa_assets',
    campaignKey: 'search_model',
    recommendationType: 'RESPONSIVE_SEARCH_AD_ASSET',
    title: 'Add more headlines to Model Suzuki B',
    description:
      'This ad has a Poor ad strength rating. Adding more unique headlines and descriptions can improve ad strength and performance.',
    impactImpressionsPct: 4,
    impactConversionsPct: 3,
    dismissed: false,
    applied: false,
    dayOffset: 70,
  },
  {
    key: 'rec_generic_keyword_match_type',
    campaignKey: 'search_generic',
    recommendationType: 'KEYWORD_MATCH_TYPE',
    title: 'Broaden match type for "used cars for sale"',
    description: 'Switching this keyword to broad match could capture more relevant search volume.',
    impactImpressionsPct: 6,
    impactConversionsPct: 2,
    dismissed: true,
    applied: false,
    dayOffset: 55,
  },
  {
    key: 'rec_account_callout_extensions',
    campaignKey: null,
    recommendationType: 'CALLOUT_EXTENSION',
    title: 'Add callout extensions to your account',
    description:
      'Callout extensions highlight unique selling points like "Free Financing" or "150-Point Inspection" alongside your ads.',
    impactImpressionsPct: null,
    impactConversionsPct: 3,
    dismissed: false,
    applied: true,
    dayOffset: 40,
  },
]
