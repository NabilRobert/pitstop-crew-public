// Used-car-dealer demo profile — see docs/dummy.md for the sourcing/reasoning.
// Every number here traces back to docs/dummy.md; change the profile there
// first, then mirror it here.

import type { ValueTier } from '../../optimizer/types.js'

export const START_DATE = '2026-06-01'

// Blended daily baseline across all 5 campaigns (docs/dummy.md → Budget & Daily Volume).
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
// (see docs/PROJECT.md → Standout Features: PMax/in-market swing hardest, Brand stays stable).
export const CAMPAIGNS: CampaignProfile[] = [
  { key: 'brand', name: 'Brand', weight: 0.1, sensitivity: 0.2 },
  { key: 'search_generic', name: 'Search — Used Cars Generic', weight: 0.2, sensitivity: 0.8 },
  { key: 'search_model', name: 'Search — Model + Suburb', weight: 0.25, sensitivity: 0.9 },
  { key: 'pmax', name: 'Performance Max — Vehicle Inventory', weight: 0.35, sensitivity: 1.2 },
  { key: 'display', name: 'Display Remarketing', weight: 0.1, sensitivity: 0.7 },
]

// The deliberate "clear declining trend" required by docs/PROJECT.md's synthetic
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
// Display Remarketing's own behavior segments (docs/dummy.md → custom segment_type).
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

// v2 Stage 1/2 keywords and search terms; v3 grew them to ~100 keywords
// with per-keyword CTR/CVR/CPC weights, bids, a long tail of search terms
// and the planted optimizer ground truth. They live in keywordCatalog.ts
// (too long to keep here); re-exported under the names everything already
// imports from this module.
export { KEYWORDS, SEARCH_TERMS, HIDDEN_TERM_SHARE } from './keywordCatalog.js'
export type { KeywordProfile, SearchTermProfile, Intent, MatchType } from './keywordCatalog.js'

// How much base Quality Score search_model's keywords can erode by the end
// of the decline window (see generator.ts's declineMultiplier) — ties QS
// drift causally to the existing decline story instead of being a second,
// disconnected feature.
export const QS_EROSION_MAX_POINTS = 3

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
  share: number // relative share of every campaign's daily conversions, normalized over the actions live that day
  // v3 — value tiers (docs/overhaul-v3-backend.md section 9). The values
  // are STARTING DEFAULTS sized against the ~Rp 20,000 baseline CPA, not
  // the dealer's real numbers (open question Q5), so anything that leans
  // on them is basis 'prior'.
  defaultValueMicros: number
  alwaysUseDefaultValue: boolean
  valueTier: ValueTier
  // Days since START_DATE the action started recording; absent = from
  // START_DATE. The three v3 actions start on day 122 (2026-10-01), after
  // the last day already stored when v3 shipped, so no stored
  // conversion_action_performance row changes.
  startDay?: number
}

const idr = (rupiah: number) => rupiah * 1_000_000

export const CONVERSION_ACTIONS: ConversionActionProfile[] = [
  { key: 'test_drive_booked', name: 'Test Drive Booked', category: 'SUBMIT_LEAD_FORM', countingType: 'ONE_PER_CLICK', share: 0.3, defaultValueMicros: idr(150_000), alwaysUseDefaultValue: true, valueTier: 'visit' },
  { key: 'credit_app_started', name: 'Credit App Started', category: 'SUBMIT_LEAD_FORM', countingType: 'ONE_PER_CLICK', share: 0.2, defaultValueMicros: idr(60_000), alwaysUseDefaultValue: true, valueTier: 'lead' },
  { key: 'phone_call', name: 'Phone Call', category: 'PHONE_CALL_LEAD', countingType: 'ONE_PER_CLICK', share: 0.3, defaultValueMicros: idr(40_000), alwaysUseDefaultValue: true, valueTier: 'lead' },
  { key: 'financing_page_visit', name: 'Financing Page Visit', category: 'PAGE_VIEW', countingType: 'MANY_PER_CLICK', share: 0.2, defaultValueMicros: idr(5_000), alwaysUseDefaultValue: true, valueTier: 'micro' },
  { key: 'whatsapp_click', name: 'WhatsApp Click', category: 'CONTACT', countingType: 'ONE_PER_CLICK', share: 0.25, defaultValueMicros: idr(30_000), alwaysUseDefaultValue: true, valueTier: 'lead', startDay: 122 },
  { key: 'showroom_visit', name: 'Showroom Visit', category: 'STORE_VISIT', countingType: 'ONE_PER_CLICK', share: 0.08, defaultValueMicros: idr(120_000), alwaysUseDefaultValue: true, valueTier: 'visit', startDay: 122 },
  // A simulation of what an offline sale upload would produce — Pitstop
  // has no closed-loop attribution (phase 3). The name says so everywhere
  // it is shown, and the UI must not present it as real attribution.
  { key: 'sold', name: 'Sold (offline import, simulated)', category: 'PURCHASE', countingType: 'ONE_PER_CLICK', share: 0.02, defaultValueMicros: idr(12_000_000), alwaysUseDefaultValue: true, valueTier: 'sale', startDay: 122 },
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

// v2 Stage 8 — change history. See docs/v2-*-plan.md decision #7: same
// episodic/scripted pattern as RECOMMENDATIONS above, resolved by
// scriptedEvents.ts. dayOffset is days since START_DATE; timeOfDay gives
// changed_at (a TIMESTAMPTZ) a plausible business-hours time, not just a
// bare date.
//
// The budget-cut event lands EXACTLY at DECLINE_START_DAY on
// search_model — the plan's one required correlation, so change history
// and the decline's start line up causally (a real "why" story for
// Anna/Rico), not two disconnected features. The RSA-headlines event on
// Model Suzuki B is a deliberate second correlation, timed just after
// Stage 7's rec_suzuki_rsa_assets recommendation (dayOffset 70) — this
// change event is that recommendation actually being applied, not an
// unrelated coincidence.
export interface ChangeEventProfile {
  key: string
  campaignKey: string | null // null = account-level
  resourceType: string // CAMPAIGN, CAMPAIGN_BUDGET, AD_GROUP, AD, KEYWORD, BIDDING_STRATEGY
  changeOperation: 'CREATE' | 'UPDATE' | 'REMOVE'
  fieldChanged: string | null
  oldValue: string | null
  newValue: string | null
  changedBy: string
  dayOffset: number
  timeOfDay: string // HH:MM:SS, UTC
}

export const CHANGE_EVENTS: ChangeEventProfile[] = [
  {
    key: 'change_search_model_budget_cut',
    campaignKey: 'search_model',
    resourceType: 'CAMPAIGN_BUDGET',
    changeOperation: 'UPDATE',
    fieldChanged: 'daily_budget',
    oldValue: 'Rp 30,000/day',
    newValue: 'Rp 20,000/day',
    changedBy: 'ads-manager@dealername.com',
    dayOffset: DECLINE_START_DAY,
    timeOfDay: '09:15:00',
  },
  {
    key: 'change_account_portfolio_bidding',
    campaignKey: null,
    resourceType: 'BIDDING_STRATEGY',
    changeOperation: 'CREATE',
    fieldChanged: null,
    oldValue: null,
    newValue: 'Maximize Conversions (portfolio)',
    changedBy: 'ads-manager@dealername.com',
    dayOffset: 45,
    timeOfDay: '11:00:00',
  },
  {
    key: 'change_generic_bidding_strategy',
    campaignKey: 'search_generic',
    resourceType: 'BIDDING_STRATEGY',
    changeOperation: 'UPDATE',
    fieldChanged: 'bidding_strategy_type',
    oldValue: 'Manual CPC',
    newValue: 'Maximize Conversions',
    changedBy: 'ads-manager@dealername.com',
    dayOffset: 50,
    timeOfDay: '14:30:00',
  },
  {
    key: 'change_suzuki_b_headlines_added',
    campaignKey: 'search_model',
    resourceType: 'AD',
    changeOperation: 'UPDATE',
    fieldChanged: 'headlines',
    oldValue: '3 headlines',
    newValue: '5 headlines',
    changedBy: 'ads-manager@dealername.com',
    dayOffset: 75,
    timeOfDay: '10:45:00',
  },
]

// v2 Stage 9 — demographic segments. See docs/v2-*-plan.md decision #5:
// no schema change needed, segments.segment_type already covers
// age_range/household_income. Split unconditionally across all 5
// campaigns — same code path as DEVICES above, no geography-style
// campaign restriction and no in-market-style outperformance boost.
// Shares reflect a realistic used-car-buyer skew: 25-54 dominates,
// income skews toward "top 50%" (a car purchase, even used, is a
// meaningful expense).
export interface AgeRangeProfile {
  value: string
  share: number
}
export const AGE_RANGES: AgeRangeProfile[] = [
  { value: '18-24', share: 0.08 },
  { value: '25-34', share: 0.28 },
  { value: '35-44', share: 0.27 },
  { value: '45-54', share: 0.2 },
  { value: '55-64', share: 0.12 },
  { value: '65+', share: 0.05 },
]

export interface HouseholdIncomeProfile {
  value: string
  share: number
}
export const HOUSEHOLD_INCOMES: HouseholdIncomeProfile[] = [
  { value: 'Top 50%', share: 0.55 },
  { value: 'Lower 50%', share: 0.3 },
  { value: 'Unknown', share: 0.15 },
]
