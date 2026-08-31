// v2 Stage 7 (and Stage 8, once added) — episodic/scripted demo events:
// Google Ads' own Recommendations, and (stage 8) change history. See
// docs/v2-backend-plan.md decision #7. Same purity contract as
// generator.ts's generateDay: no Date.now(), no unseeded random — just
// profile.ts's static dayOffset-keyed arrays resolved into absolute
// dates, mirroring how DECLINE_START_DAY/SEASONAL_SPIKE_START_DAY are
// resolved inside generateDay() itself.

import * as profile from './profile.js'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface ResolvedRecommendation {
  key: string
  campaignKey: string | null
  recommendationType: string
  title: string
  description: string
  impactImpressionsPct: number | null
  impactConversionsPct: number | null
  dismissed: boolean
  applied: boolean
  generatedDate: string
}

export function getRecommendations(): ResolvedRecommendation[] {
  return profile.RECOMMENDATIONS.map((r) => ({
    key: r.key,
    campaignKey: r.campaignKey,
    recommendationType: r.recommendationType,
    title: r.title,
    description: r.description,
    impactImpressionsPct: r.impactImpressionsPct,
    impactConversionsPct: r.impactConversionsPct,
    dismissed: r.dismissed,
    applied: r.applied,
    generatedDate: addDays(profile.START_DATE, r.dayOffset),
  }))
}
