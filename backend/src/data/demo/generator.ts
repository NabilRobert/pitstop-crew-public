// Pure-function demo data generator: generateDay(targetDate, seed, overrides)
// always returns the same output for the same inputs. See docs/PROJECT.md →
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

/** v3 — splits an integer `total` across `weights` so the parts are
 * integers that sum to `total` exactly. Each part gets the floor of its
 * exact share; the leftover units go out by systematic sampling over the
 * fractional parts, so a part whose exact share is 0.3 gets one extra unit
 * 30% of the time. Plain rounding (as noisyConservingSplit's callers do)
 * would round a long-tail search term's 0.3 clicks/day to 0 every single
 * day. Returns all zeros when the weights sum to 0 — callers decide the
 * fallback. */
export function apportionInteger(total: number, weights: Record<string, number>, rand: () => number): Record<string, number> {
  const keys = Object.keys(weights)
  const out: Record<string, number> = {}
  for (const k of keys) out[k] = 0
  const sumW = keys.reduce((s, k) => s + Math.max(0, weights[k]), 0)
  if (total <= 0 || sumW <= 0) return out
  const fractions: number[] = []
  let assigned = 0
  for (const k of keys) {
    const exact = (total * Math.max(0, weights[k])) / sumW
    out[k] = Math.floor(exact)
    assigned += out[k]
    fractions.push(exact - out[k])
  }
  const leftover = total - assigned
  if (leftover <= 0) return out
  // Systematic sampling: walk the cumulative fractional parts with
  // pointers at u, u+1, u+2, ... — exactly `leftover` picks, each part
  // picked with probability equal to its fractional part.
  let pointer = rand()
  let cumulative = 0
  let picks = 0
  for (let i = 0; i < keys.length && picks < leftover; i++) {
    cumulative += fractions[i]
    while (pointer < cumulative - 1e-9 && picks < leftover) {
      out[keys[i]] += 1
      pointer += 1
      picks += 1
    }
  }
  // Floating-point slack can leave the last unit unplaced; give it to the
  // part with the largest weight so the total is still exact.
  if (picks < leftover) {
    const heaviest = keys.reduce((a, b) => (weights[b] > weights[a] ? b : a))
    out[heaviest] += leftover - picks
  }
  return out
}

/** apportionInteger for a fixed-precision amount (cost micros at 0
 * decimals, conversions at 2). Parts sum to `total` exactly at that
 * precision. */
function apportionFixed(
  total: number,
  weights: Record<string, number>,
  decimals: number,
  rand: () => number
): Record<string, number> {
  const scale = 10 ** decimals
  const units = apportionInteger(Math.round(total * scale), weights, rand)
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(units)) out[k] = v / scale
  return out
}

interface SplitChild {
  key: string
  share: number
  ctrWeight: number
  cvrWeight: number
  cpcWeight: number
}

interface Traffic {
  impressions: number
  clicks: number
  costMicros: number
}

type Weights = Record<string, number>

const sumOf = (w: Weights) => Object.values(w).reduce((s, v) => s + v, 0)

function weightsBy(children: SplitChild[], f: (c: SplitChild) => number): Weights {
  const w: Weights = {}
  for (const c of children) w[c.key] = f(c)
  return w
}

/** Each child's share with the same ±15% day-to-day wobble
 * noisyConservingSplit applies. */
function noisyShares(children: SplitChild[], seed: number, day: string, keyPrefix: string): Weights {
  return weightsBy(
    children,
    (c) => c.share * uniform(entityRng(seed, day, `${keyPrefix}:${c.key}:share-noise`), 0.85, 1.15)
  )
}

/** v3 — the traffic half of the split used below the ad group (keywords,
 * then search terms). Unlike noisyConservingSplit's one shared share for
 * every metric, each child's CTR and CPC differ by its own weights, so
 * keywords and search terms genuinely differ (the v2 split gave every
 * keyword the same CTR, CPC and conversion rate — nothing to optimize):
 *   clicks       ∝ share × ctrWeight
 *   impressions  = clicks + (non-click impressions ∝ share)   — never < clicks
 *   cost         ∝ clicks × cpcWeight
 * Every metric sums to the parent's exactly. Conversions are split
 * separately (splitConversions), once the clicks below are known. */
function splitTraffic(parent: Traffic, children: SplitChild[], shares: Weights, rng: () => number): Record<string, Traffic> {
  const clicks = apportionInteger(parent.clicks, weightsBy(children, (c) => shares[c.key] * c.ctrWeight), rng)
  const nonClick = apportionInteger(Math.max(0, parent.impressions - parent.clicks), shares, rng)
  // With no clicks at all (a quiet day), cost falls back to share so a
  // non-zero parent total still lands somewhere.
  let costWeights = weightsBy(children, (c) => clicks[c.key] * c.cpcWeight)
  if (sumOf(costWeights) <= 0) costWeights = weightsBy(children, (c) => shares[c.key] * c.cpcWeight)
  const cost = apportionFixed(parent.costMicros, costWeights, 0, rng)
  const out: Record<string, Traffic> = {}
  for (const c of children) {
    out[c.key] = { impressions: clicks[c.key] + nonClick[c.key], clicks: clicks[c.key], costMicros: cost[c.key] }
  }
  return out
}

/** Splits a conversions total (2 decimals) by `weights`, falling back to
 * `fallback` when every weight is 0 (no clicks anywhere that day).
 * Children whose weights are 0 in both never get a conversion. */
function splitConversions(total: number, weights: Weights, fallback: Weights, rng: () => number): Weights {
  return apportionFixed(total, sumOf(weights) > 0 ? weights : fallback, 2, rng)
}

// Pseudo-child standing in for the search terms Google withholds (low-volume
// queries never show up in search_term_view). Generated so the visible terms
// plus this bucket sum to the keyword exactly, but never emitted — which is
// what makes visible coverage < 100%, as it is on a real account.
const HIDDEN_TERMS_KEY = '__hidden_terms__'

/** Keyword-level impression share from the campaign's own, scaled by the
 * keyword's Quality Score and bid relative to its ad group. Rank-lost is
 * what's left after budget-lost (a campaign-level cause — Google documents
 * search_budget_lost_impression_share as campaign-level only), so
 * IS + budget-lost + rank-lost = 1. */
function keywordImpressionShare(
  campaignIs: { searchImpressionShare: number; searchBudgetLostImpressionShare: number },
  qualityScore: number,
  bidRatio: number,
  seed: number,
  day: string,
  keywordKey: string
): { searchImpressionShare: number; searchRankLostImpressionShare: number } {
  const noise = uniform(entityRng(seed, day, keywordKey + ':is-noise'), -0.03, 0.03)
  const factor = (0.85 + 0.06 * (qualityScore - 7)) * Math.sqrt(bidRatio)
  const maxShare = 1 - campaignIs.searchBudgetLostImpressionShare
  const is = clamp(campaignIs.searchImpressionShare * factor + noise, 0.05, maxShare)
  const rankLost = clamp(1 - is - campaignIs.searchBudgetLostImpressionShare, 0, 1)
  return {
    searchImpressionShare: Math.round(is * 10000) / 10000,
    searchRankLostImpressionShare: Math.round(rankLost * 10000) / 10000,
  }
}

// A keyword reports no impression share until it has a week of serving
// history — the API returns "--" for brand-new criteria. NULL, never 0.
const KEYWORD_IS_WARMUP_DAYS = 7

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
  // v3 — keyword-level impression share (NULL until the keyword has a
  // week of history, or on a day it had no impressions) and the static
  // max CPC bid (NULL under automated bidding).
  searchImpressionShare: number | null
  searchRankLostImpressionShare: number | null
  cpcBidMicros: number | null
  // v3 step 4 — the keyword's conversions by conversion action (non-zero
  // only; sums to `conversions`) and their value at each action's default
  // value. Filled in once the whole campaign's keywords are known — see
  // fitKeywordActions.
  conversionsByAction: Record<string, number>
  conversionsValueMicros: number
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
  // v3 step 4 — the term's share of its keyword's conversion value
  // (search_term_view has no per-action split we keep).
  conversionsValueMicros: number
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

const IPF_ITERATIONS = 50

/** v3 step 4 — splits each keyword's conversions across conversion
 * actions so that (a) every keyword's split sums to its own conversions
 * exactly, (b) summed over the campaign's keywords, each action comes out
 * at (within rounding) the campaign's own per-action total — the
 * conversion_action_performance row already stored — and (c) keywords
 * still lean the way their conversionActionMix says. Iterative
 * proportional fitting from a seed of conversions × mix × action share,
 * then exact per-keyword rounding. Then values: Σ conversions × each
 * action's default value, and each search term gets its share of its
 * keyword's value by conversions. Mutates the rows passed in. */
function fitKeywordActions(
  keywords: KeywordDay[],
  terms: SearchTermDay[],
  actionTotals: ConversionActionDay[],
  seed: number,
  day: string
): void {
  const actions = actionTotals.map((a) => a.conversionActionKey)
  const actionByKey = new Map(profile.CONVERSION_ACTIONS.map((ca) => [ca.key, ca]))
  const mixOf = new Map(profile.KEYWORDS.map((k) => [k.key, k.conversionActionMix]))
  const rowTotal = keywords.map((k) => k.conversions)
  const rowSum = rowTotal.reduce((s, v) => s + v, 0)
  const colSum = actionTotals.reduce((s, a) => s + a.conversions, 0)
  // The campaign's action totals and its keywords' conversions differ by
  // a few hundredths of rounding; fit to the keywords' total.
  const colTarget = actionTotals.map((a) => (colSum > 0 ? (a.conversions * rowSum) / colSum : 0))

  const x = keywords.map((k, i) =>
    actions.map((a) => {
      const share = actionByKey.get(a)!.share
      return rowTotal[i] * share * (mixOf.get(k.keywordKey)?.[a] ?? 1)
    })
  )
  for (let iter = 0; iter < IPF_ITERATIONS; iter++) {
    for (let j = 0; j < actions.length; j++) {
      const col = x.reduce((s, row) => s + row[j], 0)
      if (col > 0) for (const row of x) row[j] *= colTarget[j] / col
    }
    for (let i = 0; i < x.length; i++) {
      const row = x[i].reduce((s, v) => s + v, 0)
      if (row > 0) x[i] = x[i].map((v) => (v * rowTotal[i]) / row)
    }
  }

  const valueByKeyword = new Map<string, { conversions: number; value: number }>()
  keywords.forEach((k, i) => {
    const weights: Record<string, number> = {}
    actions.forEach((a, j) => (weights[a] = x[i][j]))
    const split = apportionFixed(k.conversions, weights, 2, entityRng(seed, day, `${k.keywordKey}:actions`))
    const byAction: Record<string, number> = {}
    let value = 0
    for (const a of actions) {
      if (split[a] <= 0) continue
      byAction[a] = split[a]
      value += split[a] * actionByKey.get(a)!.defaultValueMicros
    }
    k.conversionsByAction = byAction
    k.conversionsValueMicros = Math.round(value)
    valueByKeyword.set(k.keywordKey, { conversions: k.conversions, value: k.conversionsValueMicros })
  })
  // Floor, not round, so a keyword's visible terms never add up to more
  // value than the keyword itself.
  for (const t of terms) {
    const kv = valueByKeyword.get(t.keywordKey)
    t.conversionsValueMicros = kv && kv.conversions > 0 ? Math.floor((t.conversions / kv.conversions) * kv.value) : 0
  }
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
    // v3: only actions recording on this day (startDay), shares
    // re-normalized over them. Before the v3 actions start the four v2
    // shares already sum to 1 and are used as-is, so stored history is
    // unchanged.
    const liveActions = profile.CONVERSION_ACTIONS.filter((ca) => dayOffset >= (ca.startDay ?? 0))
    const liveShareSum = liveActions.reduce((sum, ca) => sum + ca.share, 0)
    const conversionActionShares: Record<string, number> = {}
    for (const ca of liveActions) {
      conversionActionShares[ca.key] = Math.abs(liveShareSum - 1) < 1e-9 ? ca.share : ca.share / liveShareSum
    }
    const conversionActionSplit = splitConservingTotal(conversions, conversionActionShares, '', 1.0)
    for (const ca of liveActions) {
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

    // v2 Stage 9 — demographic segments (age_range/household_income).
    // Same unconditional, every-campaign, no-boost pattern as the device
    // breakdown above — no geography-style campaign restriction, no
    // in-market-style outperformance boost.
    const ageRangeShares: Record<string, number> = {}
    for (const a of profile.AGE_RANGES) ageRangeShares[a.value] = a.share
    for (const [field, total] of [
      ['impressions', impressions],
      ['clicks', clicks],
      ['costMicros', costMicros],
    ] as const) {
      const split = splitConservingTotal(total, ageRangeShares, '', 1.0)
      for (const [value, amount] of Object.entries(split)) {
        rawSegmentRows.push({ campaignKey: c.key, segmentType: 'age_range', segmentValue: value, field, amount })
      }
    }
    const ageRangeConvSplit = splitConservingTotal(conversions, ageRangeShares, '', 1.0)
    for (const [value, amount] of Object.entries(ageRangeConvSplit)) {
      rawSegmentRows.push({
        campaignKey: c.key,
        segmentType: 'age_range',
        segmentValue: value,
        field: 'conversions',
        amount,
      })
    }

    const householdIncomeShares: Record<string, number> = {}
    for (const h of profile.HOUSEHOLD_INCOMES) householdIncomeShares[h.value] = h.share
    for (const [field, total] of [
      ['impressions', impressions],
      ['clicks', clicks],
      ['costMicros', costMicros],
    ] as const) {
      const split = splitConservingTotal(total, householdIncomeShares, '', 1.0)
      for (const [value, amount] of Object.entries(split)) {
        rawSegmentRows.push({ campaignKey: c.key, segmentType: 'household_income', segmentValue: value, field, amount })
      }
    }
    const householdIncomeConvSplit = splitConservingTotal(conversions, householdIncomeShares, '', 1.0)
    for (const [value, amount] of Object.entries(householdIncomeConvSplit)) {
      rawSegmentRows.push({
        campaignKey: c.key,
        segmentType: 'household_income',
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
    const firstKeywordRow = keywordsOut.length
    const firstTermRow = searchTermsOut.length
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

        // v3 — keywords and their search terms, split in two passes.
        //  1. Traffic (impressions, clicks, cost) top-down: ad group →
        //     keywords live on this day (startDay, not yet pausedFromDay) → each keyword's search
        //     terms, using each entity's own CTR/CPC weights.
        //  2. Conversions: the ad group's total goes to keywords by how
        //     convertible that day's clicks were (Σ term clicks × term
        //     cvrWeight, × the keyword's own cvrWeight), then within each
        //     keyword by term clicks × cvrWeight.
        // Splitting conversions only after the clicks are known is what
        // lets a high-CVR search term show a lower CPA than its keyword. A
        // keyword gets well under one click a day, so a top-down split would
        // hand the keyword's whole day of conversions to whichever single
        // term got the click — every term would end up at its keyword's CPA.
        const adGroupKeywords = profile.KEYWORDS.filter(
          (k) => k.adGroupKey === ag.key && dayOffset >= (k.startDay ?? 0) && (k.pausedFromDay === undefined || dayOffset < k.pausedFromDay)
        )
        if (adGroupKeywords.length === 0) continue
        const kwRng = entityRng(seed, targetDate, `${ag.key}:kw:apportion`)
        const kwShares = noisyShares(adGroupKeywords, seed, targetDate, `${ag.key}:kw`)
        const kwTraffic = splitTraffic(
          { impressions: agImp, clicks: agClk, costMicros: agCst },
          adGroupKeywords,
          kwShares,
          kwRng
        )
        const bids = adGroupKeywords.map((k) => k.bidMicros).filter((b): b is number => b !== null)
        const meanBid = bids.length > 0 ? bids.reduce((s, b) => s + b, 0) / bids.length : null

        interface TermPlan {
          present: profile.SearchTermProfile[]
          children: SplitChild[]
          shares: Weights
          traffic: Record<string, Traffic>
          rng: () => number
        }
        const termPlans = new Map<string, TermPlan>()
        const kwConvWeights: Weights = {}
        for (const k of adGroupKeywords) {
          const kt = kwTraffic[k.key]
          // v2 Stage 2 — search terms, anchored to this one keyword. v3:
          // long-tail terms show up only on some days (appearanceProbability,
          // drawn independently of the day's totals so a Time Machine
          // override never changes which terms exist), and the volume of
          // absent terms plus the keyword's always-withheld share goes to
          // the hidden bucket, never emitted.
          const keywordSearchTerms = profile.SEARCH_TERMS.filter((st) => st.keywordKey === k.key)
          if (keywordSearchTerms.length === 0) {
            kwConvWeights[k.key] = kt.clicks * k.cvrWeight
            continue
          }
          const present = keywordSearchTerms.filter(
            (st) => entityRng(seed, targetDate, `${st.key}:appears`)() < st.appearanceProbability
          )
          const listedShare = keywordSearchTerms.reduce((s, st) => s + st.share, 0)
          const absentShare = listedShare - present.reduce((s, st) => s + st.share, 0)
          const hiddenFraction = k.hiddenTermShare ?? profile.HIDDEN_TERM_SHARE
          const hiddenShare = (listedShare * hiddenFraction) / (1 - hiddenFraction) + absentShare
          const children: SplitChild[] = [
            ...present.map((st) => ({ ...st, cpcWeight: 1 })),
            { key: HIDDEN_TERMS_KEY, share: hiddenShare, ctrWeight: 1, cvrWeight: 1, cpcWeight: 1 },
          ]
          const shares = noisyShares(children, seed, targetDate, `${k.key}:st`)
          const rng = entityRng(seed, targetDate, `${k.key}:st:apportion`)
          const traffic = splitTraffic(kt, children, shares, rng)
          termPlans.set(k.key, { present, children, shares, traffic, rng })
          kwConvWeights[k.key] = k.cvrWeight * children.reduce((s, ch) => s + traffic[ch.key].clicks * ch.cvrWeight, 0)
        }
        const kwConversions = splitConversions(
          agConv,
          kwConvWeights,
          weightsBy(adGroupKeywords, (k) => kwShares[k.key] * k.cvrWeight),
          kwRng
        )

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

          const { impressions: kwImp, clicks: kwClk, costMicros: kwCst } = kwTraffic[k.key]
          const kwConv = kwConversions[k.key]

          const daysLive = dayOffset - (k.startDay ?? 0)
          const kwIs =
            impressionShareResult && daysLive >= KEYWORD_IS_WARMUP_DAYS && kwImp > 0
              ? keywordImpressionShare(
                  impressionShareResult,
                  qs,
                  k.bidMicros !== null && meanBid ? k.bidMicros / meanBid : 1,
                  seed,
                  targetDate,
                  k.key
                )
              : null

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
            searchImpressionShare: kwIs?.searchImpressionShare ?? null,
            searchRankLostImpressionShare: kwIs?.searchRankLostImpressionShare ?? null,
            cpcBidMicros: k.bidMicros,
            conversionsByAction: {},
            conversionsValueMicros: 0,
          })

          const plan = termPlans.get(k.key)
          if (!plan) continue
          const termConversions = splitConversions(
            kwConv,
            weightsBy(plan.children, (ch) => plan.traffic[ch.key].clicks * ch.cvrWeight),
            weightsBy(plan.children, (ch) => plan.shares[ch.key] * ch.cvrWeight),
            plan.rng
          )
          for (const st of plan.present) {
            const part = plan.traffic[st.key]
            // No impressions = no row, same as search_term_view.
            if (part.impressions === 0) continue
            searchTermsOut.push({
              adGroupKey: ag.key,
              keywordKey: k.key,
              searchTermKey: st.key,
              text: st.text,
              matchFlavor: st.matchFlavor,
              impressions: part.impressions,
              clicks: part.clicks,
              costMicros: part.costMicros,
              conversions: termConversions[st.key],
              conversionsValueMicros: 0,
            })
          }
        }
      }
    }

    // v3 step 4 — conversions by action and conversion value, for this
    // campaign's keywords and their search terms.
    if (keywordsOut.length > firstKeywordRow) {
      fitKeywordActions(
        keywordsOut.slice(firstKeywordRow),
        searchTermsOut.slice(firstTermRow),
        conversionActionsOut.filter((ca) => ca.campaignKey === c.key),
        seed,
        targetDate
      )
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
