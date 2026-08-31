// Pure-function demo data generator: generateDay(targetDate, seed, overrides)
// always returns the same output for the same inputs. See PROJECT.md →
// "Generation algorithm" / "Time Machine" for the design this implements.

import * as profile from './profile.js'
import { resolveStateSequence, stableSeed, uniform, type State } from './markov.js'

const STATE_MULTIPLIERS: Record<string, number> = { good: 1.4, bad: 0.6, standstill: 1.0 }
const CPC_STATE_MULTIPLIERS: Record<string, number> = { good: 0.9, bad: 1.2, standstill: 1.0 }
const WEEKEND_MULTIPLIER = 1.15
const VOLATILE_RANGE: [number, number] = [0.5, 1.6]

function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function entityRng(seed: number, day: string, entityKey: string): () => number {
  return seededRandom(stableSeed(seed, day, entityKey))
}

function stateMultiplier(state: State, seed: number, day: string, entityKey: string): number {
  if (state === 'volatile') {
    return uniform(entityRng(seed, day, entityKey), ...VOLATILE_RANGE)
  }
  return STATE_MULTIPLIERS[state]
}

function declineMultiplier(campaignKey: string, dayOffset: number): number {
  if (campaignKey !== profile.DECLINING_CAMPAIGN) return 1.0
  const { DECLINE_START_DAY: start, DECLINE_DURATION_DAYS: duration } = profile
  if (dayOffset < start) return 1.0
  const progress = Math.min(1.0, (dayOffset - start) / duration)
  return 1.0 - progress * profile.DECLINE_TOTAL_DROP
}

function seasonalSpikeMultiplier(dayOffset: number): number {
  const { SEASONAL_SPIKE_START_DAY: start, SEASONAL_SPIKE_DURATION_DAYS: duration } = profile
  if (dayOffset >= start && dayOffset < start + duration) return profile.SEASONAL_SPIKE_MULTIPLIER
  return 1.0
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000
  return Math.round(
    (new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / msPerDay
  )
}

function weekdayOf(dateStr: string): number {
  // 0 = Sunday ... 6 = Saturday, matching JS Date#getUTCDay()
  return new Date(dateStr + 'T00:00:00Z').getUTCDay()
}

/** Split `total` across `shares` proportionally, then boost one key's share
 * and pull the difference from the others (proportionally), so the parts
 * still sum to `total` exactly. */
function splitConservingTotal(
  total: number,
  shares: Record<string, number>,
  boostedKey: string,
  boost: number
): Record<string, number> {
  const base: Record<string, number> = {}
  for (const [k, s] of Object.entries(shares)) base[k] = total * s
  if (boost === 1.0 || !(boostedKey in base)) return base

  const boostedValue = base[boostedKey] * boost
  const extra = boostedValue - base[boostedKey]
  const othersTotal = Object.entries(base)
    .filter(([k]) => k !== boostedKey)
    .reduce((sum, [, v]) => sum + v, 0)

  const result: Record<string, number> = { [boostedKey]: boostedValue }
  for (const [k, v] of Object.entries(base)) {
    if (k === boostedKey) continue
    const reduction = othersTotal > 0 ? extra * (v / othersTotal) : 0
    result[k] = Math.max(0, v - reduction)
  }
  return result
}

/** Perturbs each of `baseShares`' values by independent per-key noise, then
 * re-normalizes so they still sum to 1.0, before handing off to
 * splitConservingTotal — gives believable day-to-day share wobble at every
 * v2 hierarchy level (ad group, keyword, and — future stages — search
 * term/ad/asset group) while exactly conserving the parent total. One
 * shared primitive reused at every level rather than a bespoke one per
 * stage. */
function noisyConservingSplit(
  total: number,
  baseShares: Record<string, number>,
  seed: number,
  day: string,
  keyPrefix: string
): Record<string, number> {
  const noisy: Record<string, number> = {}
  let sum = 0
  for (const key of Object.keys(baseShares)) {
    const noise = uniform(entityRng(seed, day, `${keyPrefix}:${key}:share-noise`), 0.85, 1.15)
    noisy[key] = baseShares[key] * noise
    sum += noisy[key]
  }
  const normalized: Record<string, number> = {}
  for (const key of Object.keys(noisy)) normalized[key] = sum > 0 ? noisy[key] / sum : 0
  return splitConservingTotal(total, normalized, '', 1.0)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

interface ImpressionShareResult {
  searchImpressionShare: number
  searchBudgetLostImpressionShare: number
  optimizationScore: number
}

/** v2 Stage 4 — impression share + optimization score. Returns null for
 * campaigns outside profile.ts's IMPRESSION_SHARE_CAMPAIGNS (PMax,
 * Display). `declMult` is the same per-campaign decline multiplier
 * already computed for search_model's cost/QS story — reused here so
 * impression share erodes and budget-lost share grows by the identical
 * amount, keeping derived rank-lost share flat: a coherent "the decline
 * is budget-driven, not a rank/competitiveness problem" finding, not a
 * second disconnected feature. */
function computeImpressionShareAndOptScore(
  campaignKey: string,
  seed: number,
  day: string,
  declMult: number
): ImpressionShareResult | null {
  const isProfile = profile.IMPRESSION_SHARE_CAMPAIGNS.find((p) => p.campaignKey === campaignKey)
  if (!isProfile) return null

  const isNoise = uniform(entityRng(seed, day, campaignKey + ':is-noise'), -0.03, 0.03)
  const optNoise = uniform(entityRng(seed, day, campaignKey + ':opt-noise'), -0.03, 0.03)

  const erosion =
    campaignKey === profile.DECLINING_CAMPAIGN ? (1 - declMult) * profile.IS_BUDGET_LOST_EROSION_MAX : 0
  const optDrop =
    campaignKey === profile.DECLINING_CAMPAIGN ? (1 - declMult) * profile.OPTIMIZATION_SCORE_DECLINE_DROP : 0

  const searchImpressionShare = clamp(isProfile.baseImpressionShare + isNoise - erosion, 0, 1)
  const searchBudgetLostImpressionShare = clamp(
    isProfile.baseBudgetLostImpressionShare + erosion,
    0,
    1 - searchImpressionShare
  )
  const optimizationScore = clamp(isProfile.baseOptimizationScore + optNoise - optDrop, 0, 1)

  return {
    searchImpressionShare: Math.round(searchImpressionShare * 10000) / 10000,
    searchBudgetLostImpressionShare: Math.round(searchBudgetLostImpressionShare * 10000) / 10000,
    optimizationScore: Math.round(optimizationScore * 10000) / 10000,
  }
}

type QsBucket = 'above_average' | 'average' | 'below_average'

/** Qualitative diagnostic sub-scores derived from the numeric Quality
 * Score — real Google Ads reports these three independently of each
 * other, but deriving all three from one number is a reasonable
 * simplification for synthetic data (see docs/v2-*-plan.md). */
function qsBucket(qs: number): QsBucket {
  if (qs >= 7) return 'above_average'
  if (qs >= 4) return 'average'
  return 'below_average'
}

export interface CampaignDay {
  campaignKey: string
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
  // v2 Stage 4 — impression share + optimization score. Populated only
  // for the 3 Search-type campaigns (see profile.ts's
  // IMPRESSION_SHARE_CAMPAIGNS) — null for PMax/Display, matching real
  // Google Ads' own reporting scope for these metrics.
  searchImpressionShare: number | null
  searchBudgetLostImpressionShare: number | null
  optimizationScore: number | null
}

export interface SegmentDay {
  campaignKey: string
  segmentType: string
  segmentValue: string
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
}

export interface AdGroupDay {
  campaignKey: string
  adGroupKey: string
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
}

export interface KeywordDay {
  adGroupKey: string
  keywordKey: string
  text: string
  matchType: 'exact' | 'phrase' | 'broad'
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
  qualityScore: number
  expectedCtr: QsBucket
  adRelevance: QsBucket
  landingPageExperience: QsBucket
}

export interface SearchTermDay {
  adGroupKey: string
  keywordKey: string
  searchTermKey: string
  text: string
  matchFlavor: 'close_variant' | 'broader'
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
}

export interface AdDay {
  adGroupKey: string
  adKey: string
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
}

export interface ConversionActionDay {
  campaignKey: string
  conversionActionKey: string
  conversions: number
}

export interface AssetGroupDay {
  campaignKey: string
  assetGroupKey: string
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
  adStrength: 'poor' | 'average' | 'good' | 'excellent'
}

export interface DayData {
  date: string
  state: State
  campaigns: CampaignDay[]
  segments: SegmentDay[]
  adGroups: AdGroupDay[]
  keywords: KeywordDay[]
  searchTerms: SearchTermDay[]
  ads: AdDay[]
  conversionActions: ConversionActionDay[]
  assetGroups: AssetGroupDay[]
}

interface RawSegmentRow {
  campaignKey: string
  segmentType: string
  segmentValue: string
  field: 'impressions' | 'clicks' | 'costMicros' | 'conversions'
  amount: number
}

export function generateDay(
  targetDate: string,
  seed = 0,
  overrides: Map<string, State> = new Map()
): DayData {
  const states = resolveStateSequence(profile.START_DATE, targetDate, seed, overrides)
  const state = states.get(targetDate)!
  const dayOffset = daysBetween(profile.START_DATE, targetDate)
  const weekdayMult = weekdayOf(targetDate) === 0 || weekdayOf(targetDate) === 6 ? WEEKEND_MULTIPLIER : 1.0
  const spikeMult = seasonalSpikeMultiplier(dayOffset)

  const campaignsOut: CampaignDay[] = []
  const rawSegmentRows: RawSegmentRow[] = []
  const adGroupsOut: AdGroupDay[] = []
  const keywordsOut: KeywordDay[] = []
  const searchTermsOut: SearchTermDay[] = []
  const adsOut: AdDay[] = []
  const conversionActionsOut: ConversionActionDay[] = []
  const assetGroupsOut: AssetGroupDay[] = []

  for (const c of profile.CAMPAIGNS) {
    const baseMult = stateMultiplier(state, seed, targetDate, c.key)
    const sensitivityMult = 1 + (baseMult - 1) * c.sensitivity
    const declMult = declineMultiplier(c.key, dayOffset)
    const noise = uniform(entityRng(seed, targetDate, c.key + ':noise'), 0.92, 1.08)
    const finalMult = sensitivityMult * weekdayMult * declMult * spikeMult * noise

    const impressions = Math.round(profile.BASELINE_IMPRESSIONS * c.weight * finalMult)
    const clicks = Math.round(profile.BASELINE_CLICKS * c.weight * finalMult)
    const conversions = Math.round(profile.BASELINE_CONVERSIONS * c.weight * finalMult * 100) / 100

    const cpcMult = state !== 'volatile' ? (CPC_STATE_MULTIPLIERS[state] ?? 1.0) : baseMult
    const costMicros = Math.round(clicks * profile.BASELINE_CPC_MICROS * cpcMult)

    const impressionShareResult = computeImpressionShareAndOptScore(c.key, seed, targetDate, declMult)
    campaignsOut.push({
      campaignKey: c.key,
      impressions,
      clicks,
      costMicros,
      conversions,
      searchImpressionShare: impressionShareResult?.searchImpressionShare ?? null,
      searchBudgetLostImpressionShare: impressionShareResult?.searchBudgetLostImpressionShare ?? null,
      optimizationScore: impressionShareResult?.optimizationScore ?? null,
    })

    // v2 Stage 5 — named conversion actions. Account-wide (every
    // campaign gets all 4), unlike ad groups/keywords/ads which only
    // exist under the 3 Search campaigns. Fixed shares, not
    // noisyConservingSplit — the per-campaign conversions total already
    // carries its own day-to-day noise; splitting it a second way with
    // independent per-action noise would just add compounding variance
    // without a clear story to tell (see docs/v2-*-plan.md decision #8).
    const conversionActionShares: Record<string, number> = {}
    for (const ca of profile.CONVERSION_ACTIONS) conversionActionShares[ca.key] = ca.share
    const conversionActionSplit = splitConservingTotal(conversions, conversionActionShares, '', 1.0)
    for (const ca of profile.CONVERSION_ACTIONS) {
      conversionActionsOut.push({
        campaignKey: c.key,
        conversionActionKey: ca.key,
        conversions: Math.round(conversionActionSplit[ca.key] * 100) / 100,
      })
    }

    // v2 Stage 6 — PMax asset groups. Scoped to pmax only — real PMax
    // has no ad-group level (asset-group based instead). Splits pmax's
    // totals the same way ad groups split their parent campaign's (a
    // genuine sub-hierarchy, unlike Stage 5's flat conversion-action
    // split), reusing noisyConservingSplit for day-to-day share wobble.
    if (c.key === 'pmax') {
      const assetGroupShares: Record<string, number> = {}
      for (const ag of profile.ASSET_GROUPS) assetGroupShares[ag.key] = ag.share

      const agImpressions = noisyConservingSplit(impressions, assetGroupShares, seed, targetDate, `${c.key}:assetgroup:impressions`)
      const agClicks = noisyConservingSplit(clicks, assetGroupShares, seed, targetDate, `${c.key}:assetgroup:clicks`)
      const agCost = noisyConservingSplit(costMicros, assetGroupShares, seed, targetDate, `${c.key}:assetgroup:cost`)
      const agConversions = noisyConservingSplit(conversions, assetGroupShares, seed, targetDate, `${c.key}:assetgroup:conversions`)

      for (const ag of profile.ASSET_GROUPS) {
        assetGroupsOut.push({
          campaignKey: c.key,
          assetGroupKey: ag.key,
          impressions: Math.round(agImpressions[ag.key]),
          clicks: Math.round(agClicks[ag.key]),
          costMicros: Math.round(agCost[ag.key]),
          conversions: Math.round(agConversions[ag.key] * 100) / 100,
          adStrength: ag.adStrength,
        })
      }
    }

    // Device breakdown — every campaign.
    const deviceShares: Record<string, number> = {}
    for (const d of profile.DEVICES) deviceShares[d.value] = d.share
    for (const [field, total] of [
      ['impressions', impressions],
      ['clicks', clicks],
      ['costMicros', costMicros],
    ] as const) {
      const split = splitConservingTotal(total, deviceShares, '', 1.0)
      for (const [value, amount] of Object.entries(split)) {
        rawSegmentRows.push({ campaignKey: c.key, segmentType: 'device', segmentValue: value, field, amount })
      }
    }
    const convSplit = splitConservingTotal(conversions, deviceShares, '', 1.0)
    for (const [value, amount] of Object.entries(convSplit)) {
      rawSegmentRows.push({
        campaignKey: c.key,
        segmentType: 'device',
        segmentValue: value,
        field: 'conversions',
        amount,
      })
    }

    // Geography breakdown — search_generic and pmax only, with the
    // deliberately outperforming suburb boosted on conversions.
    if (profile.GEOGRAPHY_CAMPAIGNS.includes(c.key)) {
      const geoShares: Record<string, number> = {}
      for (const g of profile.GEOGRAPHIES) geoShares[g.value] = g.share
      for (const [field, total] of [
        ['impressions', impressions],
        ['clicks', clicks],
        ['costMicros', costMicros],
      ] as const) {
        const split = splitConservingTotal(total, geoShares, '', 1.0)
        for (const [value, amount] of Object.entries(split)) {
          rawSegmentRows.push({ campaignKey: c.key, segmentType: 'geography', segmentValue: value, field, amount })
        }
      }
      const boost = profile.GEOGRAPHIES.find((g) => g.value === profile.OUTPERFORMING_GEOGRAPHY)!
        .sensitivityBoost
      const geoConvSplit = splitConservingTotal(conversions, geoShares, profile.OUTPERFORMING_GEOGRAPHY, boost)
      for (const [value, amount] of Object.entries(geoConvSplit)) {
        rawSegmentRows.push({
          campaignKey: c.key,
          segmentType: 'geography',
          segmentValue: value,
          field: 'conversions',
          amount,
        })
      }
    }

    // Custom remarketing behavior segments — Display campaign only.
    if (c.key === 'display') {
      const remarketingShares: Record<string, number> = {}
      for (const r of profile.REMARKETING_SEGMENTS) remarketingShares[r.value] = r.share
      for (const [field, total] of [
        ['impressions', impressions],
        ['clicks', clicks],
        ['costMicros', costMicros],
        ['conversions', conversions],
      ] as const) {
        const split = splitConservingTotal(total, remarketingShares, '', 1.0)
        for (const [value, amount] of Object.entries(split)) {
          rawSegmentRows.push({ campaignKey: c.key, segmentType: 'custom', segmentValue: value, field, amount })
        }
      }
    }

    // v2 Stage 1 — ad groups + keywords + Quality Score. Only the 3 Search
    // campaigns have ad groups (see profile.ts's AD_GROUPS) — PMax has no
    // ad-group level in the real API (asset-group based instead, Stage 6),
    // Display is excluded to bound row count.
    const campaignAdGroups = profile.AD_GROUPS.filter((ag) => ag.campaignKey === c.key)
    if (campaignAdGroups.length > 0) {
      const adGroupShares: Record<string, number> = {}
      for (const ag of campaignAdGroups) adGroupShares[ag.key] = ag.share

      const agImpressions = noisyConservingSplit(impressions, adGroupShares, seed, targetDate, `${c.key}:adgroup:impressions`)
      const agClicks = noisyConservingSplit(clicks, adGroupShares, seed, targetDate, `${c.key}:adgroup:clicks`)
      const agCost = noisyConservingSplit(costMicros, adGroupShares, seed, targetDate, `${c.key}:adgroup:cost`)
      const agConversions = noisyConservingSplit(conversions, adGroupShares, seed, targetDate, `${c.key}:adgroup:conversions`)

      for (const ag of campaignAdGroups) {
        const agImp = Math.round(agImpressions[ag.key])
        const agClk = Math.round(agClicks[ag.key])
        const agCst = Math.round(agCost[ag.key])
        const agConv = Math.round(agConversions[ag.key] * 100) / 100
        adGroupsOut.push({
          campaignKey: c.key,
          adGroupKey: ag.key,
          impressions: agImp,
          clicks: agClk,
          costMicros: agCst,
          conversions: agConv,
        })

        // v2 Stage 3 — ads/creatives, split off the same ad group totals
        // as keywords (a sibling of keywords under the ad group, not a
        // child of them).
        const adGroupAds = profile.ADS.filter((a) => a.adGroupKey === ag.key)
        if (adGroupAds.length > 0) {
          const adShares: Record<string, number> = {}
          for (const a of adGroupAds) adShares[a.key] = a.share

          const adImpressions = noisyConservingSplit(agImp, adShares, seed, targetDate, `${ag.key}:ad:impressions`)
          const adClicks = noisyConservingSplit(agClk, adShares, seed, targetDate, `${ag.key}:ad:clicks`)
          const adCost = noisyConservingSplit(agCst, adShares, seed, targetDate, `${ag.key}:ad:cost`)
          const adConversions = noisyConservingSplit(agConv, adShares, seed, targetDate, `${ag.key}:ad:conversions`)

          for (const a of adGroupAds) {
            adsOut.push({
              adGroupKey: ag.key,
              adKey: a.key,
              impressions: Math.round(adImpressions[a.key]),
              clicks: Math.round(adClicks[a.key]),
              costMicros: Math.round(adCost[a.key]),
              conversions: Math.round(adConversions[a.key] * 100) / 100,
            })
          }
        }

        const adGroupKeywords = profile.KEYWORDS.filter((k) => k.adGroupKey === ag.key)
        if (adGroupKeywords.length === 0) continue
        const keywordShares: Record<string, number> = {}
        for (const k of adGroupKeywords) keywordShares[k.key] = k.share

        const kwImpressions = noisyConservingSplit(agImp, keywordShares, seed, targetDate, `${ag.key}:kw:impressions`)
        const kwClicks = noisyConservingSplit(agClk, keywordShares, seed, targetDate, `${ag.key}:kw:clicks`)
        const kwCost = noisyConservingSplit(agCst, keywordShares, seed, targetDate, `${ag.key}:kw:cost`)
        const kwConversions = noisyConservingSplit(agConv, keywordShares, seed, targetDate, `${ag.key}:kw:conversions`)

        for (const k of adGroupKeywords) {
          // Quality Score erosion is tied to the same declineMultiplier
          // driving search_model's decline story — a real, correlatable
          // finding ("QS dropped as the decline progressed"), not a second
          // disconnected feature. Every other campaign's keywords keep
          // their static base QS.
          const qs =
            c.key === profile.DECLINING_CAMPAIGN
              ? clamp(Math.round(k.baseQualityScore - (1 - declMult) * profile.QS_EROSION_MAX_POINTS), 1, 10)
              : k.baseQualityScore
          const bucket = qsBucket(qs)

          const kwImp = Math.round(kwImpressions[k.key])
          const kwClk = Math.round(kwClicks[k.key])
          const kwCst = Math.round(kwCost[k.key])
          const kwConv = Math.round(kwConversions[k.key] * 100) / 100

          keywordsOut.push({
            adGroupKey: ag.key,
            keywordKey: k.key,
            text: k.text,
            matchType: k.matchType,
            impressions: kwImp,
            clicks: kwClk,
            costMicros: kwCst,
            conversions: kwConv,
            qualityScore: qs,
            expectedCtr: bucket,
            adRelevance: bucket,
            landingPageExperience: bucket,
          })

          // v2 Stage 2 — search terms, anchored to this one keyword.
          const keywordSearchTerms = profile.SEARCH_TERMS.filter((st) => st.keywordKey === k.key)
          if (keywordSearchTerms.length === 0) continue
          const searchTermShares: Record<string, number> = {}
          for (const st of keywordSearchTerms) searchTermShares[st.key] = st.share

          const stImpressions = noisyConservingSplit(kwImp, searchTermShares, seed, targetDate, `${k.key}:st:impressions`)
          const stClicks = noisyConservingSplit(kwClk, searchTermShares, seed, targetDate, `${k.key}:st:clicks`)
          const stCost = noisyConservingSplit(kwCst, searchTermShares, seed, targetDate, `${k.key}:st:cost`)
          const stConversions = noisyConservingSplit(kwConv, searchTermShares, seed, targetDate, `${k.key}:st:conversions`)

          for (const st of keywordSearchTerms) {
            searchTermsOut.push({
              adGroupKey: ag.key,
              keywordKey: k.key,
              searchTermKey: st.key,
              text: st.text,
              matchFlavor: st.matchFlavor,
              impressions: Math.round(stImpressions[st.key]),
              clicks: Math.round(stClicks[st.key]),
              costMicros: Math.round(stCost[st.key]),
              conversions: Math.round(stConversions[st.key] * 100) / 100,
            })
          }
        }
      }
    }
  }

  return {
    date: targetDate,
    state,
    campaigns: campaignsOut,
    segments: pivotSegments(rawSegmentRows),
    adGroups: adGroupsOut,
    keywords: keywordsOut,
    searchTerms: searchTermsOut,
    ads: adsOut,
    conversionActions: conversionActionsOut,
    assetGroups: assetGroupsOut,
  }
}

/** Collapse the per-field rows emitted above into one row per
 * (campaignKey, segmentType, segmentValue) with all 4 metrics. */
function pivotSegments(rows: RawSegmentRow[]): SegmentDay[] {
  const pivoted = new Map<string, SegmentDay>()
  for (const r of rows) {
    const key = `${r.campaignKey}|${r.segmentType}|${r.segmentValue}`
    if (!pivoted.has(key)) {
      pivoted.set(key, {
        campaignKey: r.campaignKey,
        segmentType: r.segmentType,
        segmentValue: r.segmentValue,
        impressions: 0,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
      })
    }
    const entry = pivoted.get(key)!
    if (r.field === 'conversions') {
      entry.conversions = Math.round(r.amount * 100) / 100
    } else {
      ;(entry as any)[r.field] = Math.round(r.amount)
    }
  }
  return Array.from(pivoted.values())
}
