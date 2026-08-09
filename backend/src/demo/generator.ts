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

export interface CampaignDay {
  campaignKey: string
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
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

export interface DayData {
  date: string
  state: State
  campaigns: CampaignDay[]
  segments: SegmentDay[]
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

    campaignsOut.push({ campaignKey: c.key, impressions, clicks, costMicros, conversions })

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
  }

  return {
    date: targetDate,
    state,
    campaigns: campaignsOut,
    segments: pivotSegments(rawSegmentRows),
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
