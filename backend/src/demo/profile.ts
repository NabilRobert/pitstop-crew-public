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
