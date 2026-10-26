// The engine's scoring harness, as a library (docs/overhaul-v3-backend.md
// section 12): builds an EngineInput straight from generated demo days (no
// DB, no model) and scores an engine result against GROUND_TRUTH. Used by
// scripts/scoreOptimizer.ts across seeds and weeks, and by
// engine.demo.test.ts as a regression check on seed 0.
//
// Intent comes from the rules only (a term no rule matches stays
// unclassified, as it would be before the model batch runs), vehicle parses
// from the rule parser, and the inventory from the demo stock anchored at
// the run's day — the same inputs the weekly job has, minus the model.

import * as profile from '../data/demo/profile.js'
import { DEMO_STOCK } from '../data/demo/inventory.js'
import { GROUND_TRUTH, type GroundTruthRow } from '../data/demo/groundTruth.js'
import type { DayData } from '../data/demo/generator.js'
import { classifyByRules, normalizeTerm } from './intent.js'
import { negativeBlocks } from './negatives.js'
import { buildDictionary, parseVehicle, type VehicleParse } from './vehicleParse.js'
import {
  addDays,
  evidenceWindow,
  type Candidate,
  type EngineInput,
  type EngineKeyword,
  type EngineSearchTerm,
  type EngineSettings,
  type EngineThresholds,
  type SuggestionHistory,
  type WindowStats,
} from './engine.js'
import type { Vehicle } from './inventory/types.js'
import type { Intent } from './types.js'

export const DEFAULT_SETTINGS: EngineSettings = { pValue: 0.05, allowedSpendShare: 0.2, leadToSaleRate: 0.02, budgetFloorIdr: 20_000, budgetCeilingIdr: 100_000 }

// Stable numeric ids for the demo's natural keys, in catalog order (what
// SERIAL ids would look like after a fresh sync).
export interface DemoIds {
  campaign: Map<string, number>
  adGroup: Map<string, number>
  keyword: Map<string, number>
  term: Map<string, number>
  termText: Map<number, string>
  vehicle: Map<number, { make: string; model: string }>
}

export function demoIds(): DemoIds {
  const index = (keys: string[]) => new Map(keys.map((k, i) => [k, i + 1]))
  return {
    campaign: index(profile.CAMPAIGNS.map((c) => c.key)),
    adGroup: index(profile.AD_GROUPS.map((a) => a.key)),
    keyword: index(profile.KEYWORDS.map((k) => k.key)),
    term: index(profile.SEARCH_TERMS.map((s) => s.key)),
    termText: new Map(profile.SEARCH_TERMS.map((s, i) => [i + 1, s.text])),
    vehicle: new Map(DEMO_STOCK.map((v, i) => [i + 1, { make: v.make, model: v.model }])),
  }
}

/** The demo stock as the demo inventory source would return it on `asOf`. */
export function demoVehicles(asOf: string): Vehicle[] {
  return DEMO_STOCK.map((v, i) => ({
    id: String(i + 1),
    make: v.make,
    model: v.model,
    year: v.year,
    mileageKm: v.mileageKm,
    priceIdr: v.priceIdr,
    acquisitionCostIdr: v.acquisitionCostIdr,
    status: v.status,
    listedOn: addDays(asOf, -v.listedDaysAgo),
    soldOn: v.soldDaysAgo === null ? null : addDays(asOf, -v.soldDaysAgo),
  }))
}

const emptyStats = (): WindowStats => ({ impressions: 0, clicks: 0, costMicros: 0, conversions: 0, conversionsValueMicros: 0 })

export interface DemoInputOptions {
  settings?: EngineSettings
  thresholds?: Partial<EngineThresholds>
  history?: SuggestionHistory[]
  inventory?: 'demo' | 'unavailable'
}

/** EngineInput for a run on `asOf` from consecutive generated days
 * starting at START_DATE (days[i] is START_DATE + i). */
export function buildDemoEngineInput(days: readonly DayData[], asOf: string, opts: DemoInputOptions = {}): EngineInput {
  const ids = demoIds()
  const { start, end } = evidenceWindow(asOf, opts.thresholds)
  const inWindow = days.filter((d) => d.date >= start && d.date <= end)

  const firstServed = new Map<string, string>()
  for (const d of days) {
    if (d.date > end) break
    for (const k of d.keywords) if (k.impressions > 0 && !firstServed.has(k.keywordKey)) firstServed.set(k.keywordKey, d.date)
  }

  const kwAgg = new Map<string, { stats: WindowStats; qs: number | null; bid: number | null; rankLost: number[] }>()
  const stAgg = new Map<string, WindowStats>()
  for (const d of inWindow) {
    for (const k of d.keywords) {
      const a = kwAgg.get(k.keywordKey) ?? kwAgg.set(k.keywordKey, { stats: emptyStats(), qs: null, bid: null, rankLost: [] }).get(k.keywordKey)!
      a.stats.impressions += k.impressions
      a.stats.clicks += k.clicks
      a.stats.costMicros += k.costMicros
      a.stats.conversions += k.conversions
      a.stats.conversionsValueMicros += k.conversionsValueMicros
      a.qs = k.qualityScore
      a.bid = k.cpcBidMicros
      if (k.searchRankLostImpressionShare !== null) a.rankLost.push(k.searchRankLostImpressionShare)
    }
    for (const s of d.searchTerms) {
      const a = stAgg.get(s.searchTermKey) ?? stAgg.set(s.searchTermKey, emptyStats()).get(s.searchTermKey)!
      a.impressions += s.impressions
      a.clicks += s.clicks
      a.costMicros += s.costMicros
      a.conversions += s.conversions
      a.conversionsValueMicros += s.conversionsValueMicros
    }
  }

  // Like engineData.ts: the engine reads enabled keywords only — a keyword
  // paused by asOf is left out, and so are its search terms.
  const asOfDay = Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(profile.START_DATE + 'T00:00:00Z')) / 86_400_000)
  const paused = new Set(profile.KEYWORDS.filter((k) => k.pausedFromDay !== undefined && asOfDay >= k.pausedFromDay).map((k) => k.key))
  const keywords: EngineKeyword[] = profile.KEYWORDS.filter((k) => kwAgg.has(k.key) && !paused.has(k.key)).map((k) => {
    const a = kwAgg.get(k.key)!
    return {
      id: ids.keyword.get(k.key)!,
      adGroupId: ids.adGroup.get(k.adGroupKey)!,
      text: k.text,
      matchType: k.matchType,
      cpcBidMicros: a.bid,
      firstServedOn: firstServed.get(k.key) ?? null,
      stats: a.stats,
      qualityScore: a.qs,
      rankLostShare: a.rankLost.length ? a.rankLost.reduce((s, v) => s + v, 0) / a.rankLost.length : null,
    }
  })
  const searchTerms: EngineSearchTerm[] = profile.SEARCH_TERMS.filter((s) => stAgg.has(s.key) && !paused.has(s.keywordKey)).map((s) => ({
    id: ids.term.get(s.key)!,
    adGroupId: ids.adGroup.get(s.adGroupKey)!,
    keywordId: ids.keyword.get(s.keywordKey)!,
    text: s.text,
    stats: stAgg.get(s.key)!,
  }))

  const intents = new Map<string, Intent>()
  for (const s of searchTerms) {
    const n = normalizeTerm(s.text)
    const c = classifyByRules(n)
    if (c) intents.set(n, c.intent)
  }

  const unavailable = opts.inventory === 'unavailable'
  const vehicles = unavailable ? [] : demoVehicles(asOf)
  const dictionary = buildDictionary(demoVehicles(asOf))
  const vehicleParses = new Map<number, VehicleParse>(keywords.map((k) => [k.id, parseVehicle(k.text, dictionary)]))

  return {
    asOf,
    windowStart: start,
    windowEnd: end,
    campaigns: profile.CAMPAIGNS.map((c) => ({ id: ids.campaign.get(c.key)!, name: c.name })),
    adGroups: profile.AD_GROUPS.map((a) => ({ id: ids.adGroup.get(a.key)!, campaignId: ids.campaign.get(a.campaignKey)!, name: a.name })),
    keywords,
    searchTerms,
    intents,
    vehicleParses,
    inventory: unavailable
      ? { source: 'unavailable', snapshotOn: null, vehicles: [], events: [], error: 'harness: inventory switched off' }
      : { source: 'demo', snapshotOn: asOf, vehicles, events: [], error: null },
    negatives: [],
    changeEvents: profile.CHANGE_EVENTS.filter((e) => addDays(profile.START_DATE, e.dayOffset) <= asOf).map((e) => ({
      campaignId: e.campaignKey === null ? null : ids.campaign.get(e.campaignKey)!,
      changedOn: addDays(profile.START_DATE, e.dayOffset),
    })),
    history: opts.history ?? [],
    settings: opts.settings ?? DEFAULT_SETTINGS,
    thresholds: opts.thresholds,
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface RowScore {
  row: GroundTruthRow
  found: boolean // flagged with the expected type (plants only)
  flaggedBy: Candidate[] // every candidate that touches the target
  // A must-not-flag row that was flagged. Decoys must not be touched at
  // all; a legitimate credit / trade-in term must never become a negative,
  // but promoting one that converts well is a correct suggestion.
  falsePositive: boolean
}

export interface Score {
  rows: RowScore[]
  // Candidates that touch no ground-truth target. Not necessarily wrong
  // (the long tail is real data too), but each one is noise to look at.
  unplanned: Candidate[]
}

/** Which candidates touch a ground-truth row's target. Pass the engine's
 * capped candidates along with the offered ones: over the cap still means
 * found. A search term is
 * touched by any candidate on it, and by a campaign/ad-group negative
 * (a word negative) that would block it. */
function touches(c: Candidate, row: GroundTruthRow, ids: DemoIds, input: EngineInput): boolean {
  const target = row.target
  // A campaign row is touched by a new_campaign for its band, or with an ad
  // group for its model (a theme counts too: the decoys must get none).
  if (row.kind.startsWith('campaign_')) {
    if (c.payload.kind !== 'new_campaign') return false
    if ('priceBand' in target) return c.evidence.price_band === target.priceBand
    if (!('vehicle' in target)) return false
    const models = (c.evidence.models ?? []) as { make: string; model: string }[]
    return models.some((m) => m.make === target.vehicle.make && m.model === target.vehicle.model)
  }
  if ('searchTermKey' in target) {
    const termId = ids.term.get(target.searchTermKey)!
    if (c.searchTermId === termId) return true
    if (c.payload.kind !== 'negative_keyword' || c.searchTermId !== null) return false
    const term = input.searchTerms.find((s) => s.id === termId)
    if (!term) return false
    const termCampaign = input.adGroups.find((a) => a.id === term.adGroupId)?.campaignId
    const inScope = c.payload.scope === 'campaign' ? c.campaignId === termCampaign : c.adGroupId === term.adGroupId
    return inScope && negativeBlocks({ text: c.payload.text, matchType: c.payload.match_type }, term.text)
  }
  if ('keywordKey' in target) return c.searchTermId === null && c.keywordId === ids.keyword.get(target.keywordKey)
  if (!('vehicle' in target)) return false
  const vehicle = target.vehicle
  const sameVehicle = (make: unknown, model: unknown) => make === vehicle.make && model === vehicle.model
  if (row.kind === 'spin_out_cluster') return c.payload.kind === 'spin_out_campaign' && sameVehicle(c.payload.make, c.payload.model)
  if (row.kind === 'fresh_stock') return c.payload.kind === 'new_keyword' && sameVehicle(c.evidence.make, c.evidence.model)
  const keyIds = new Set((target.keywordKeys ?? []).map((k) => ids.keyword.get(k)))
  return c.searchTermId === null && c.keywordId !== null && keyIds.has(c.keywordId)
}

export function scoreAgainstGroundTruth(candidates: readonly Candidate[], input: EngineInput, ids: DemoIds = demoIds()): Score {
  const touched = new Set<Candidate>()
  const rows = GROUND_TRUTH.map((row) => {
    const flaggedBy = candidates.filter((c) => touches(c, row, ids, input))
    for (const c of flaggedBy) touched.add(c)
    const falsePositive =
      row.expected === null &&
      (row.kind === 'legit_buyer_intent' ? flaggedBy.some((c) => c.type === 'negative_keyword') : flaggedBy.length > 0)
    return { row, found: row.expected !== null && flaggedBy.some((c) => c.type === row.expected), flaggedBy, falsePositive }
  })
  return { rows, unplanned: candidates.filter((c) => !touched.has(c)) }
}

/** One-line description of a candidate for harness output. */
export function describeCandidate(c: Candidate, input: EngineInput): string {
  const kw = c.keywordId === null ? null : input.keywords.find((k) => k.id === c.keywordId)
  const st = c.searchTermId === null ? null : input.searchTerms.find((s) => s.id === c.searchTermId)
  const e = c.evidence
  const nums = `clicks=${e.clicks ?? '-'} conv=${e.conversions ?? '-'} n_min=${e.min_clicks_required ?? '-'}`
  const p = c.payload
  const what =
    p.kind === 'negative_keyword' ? `-${p.match_type} "${p.text}" (${p.scope})`
    : p.kind === 'promote_search_term' ? `promote "${p.text}"`
    : p.kind === 'change_match_type' ? `${kw?.text} ${p.from}→${p.to}`
    : p.kind === 'spin_out_campaign' ? `${p.suggested_name} (${p.keyword_ids.length} kws)`
    : p.kind === 'new_keyword' ? `+"${p.text}"`
    : p.kind === 'new_campaign' ? `${p.basis} "${p.name}" (${p.ad_groups.length} ad groups, ${p.stock.units} units)`
    : kw?.text ?? st?.text ?? ''
  return `${c.type} [${c.basis}/${c.confidence}] ${what} — ${nums}`
}
