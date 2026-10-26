// v3 step 2 — the reworked demo generator (docs/overhaul-v3-backend.md
// section 7). Pure, so every test runs the real generator over the real
// history window in memory; no DB.

import { describe, it, expect, beforeAll } from 'vitest'
import { generateDay, apportionInteger, type DayData } from './generator.js'
import * as profile from './profile.js'
import { GROUND_TRUTH, type GroundTruthRow } from './groundTruth.js'
import { nMin } from '../../optimizer/significance.js'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Fixed horizon (not "today") so the tests are deterministic: day 126 =
// 2026-10-05, the history that existed when v3 step 2 was built.
const HORIZON = 126
const WINDOW = 90
let days: DayData[]

beforeAll(() => {
  days = Array.from({ length: HORIZON + 1 }, (_, i) => generateDay(addDays(profile.START_DATE, i), 0))
})

interface Totals {
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
}
const zero = (): Totals => ({ impressions: 0, clicks: 0, costMicros: 0, conversions: 0 })
function add(t: Totals, r: Totals): Totals {
  t.impressions += r.impressions
  t.clicks += r.clicks
  t.costMicros += r.costMicros
  t.conversions += r.conversions
  return t
}
const windowDays = () => days.slice(HORIZON - WINDOW + 1)
const termTotals = (key: string) =>
  windowDays().reduce((t, d) => d.searchTerms.filter((s) => s.searchTermKey === key).reduce(add, t), zero())
const keywordTotals = (key: string) =>
  windowDays().reduce((t, d) => d.keywords.filter((k) => k.keywordKey === key).reduce(add, t), zero())
const adGroupTotals = (key: string) =>
  windowDays().reduce((t, d) => d.adGroups.filter((a) => a.adGroupKey === key).reduce(add, t), zero())
const cpa = (t: Totals) => t.costMicros / t.conversions
const termKeysOf = (kind: GroundTruthRow['kind']) =>
  GROUND_TRUTH.filter((g) => g.kind === kind).map((g) => (g.target as { searchTermKey: string }).searchTermKey)

describe('apportionInteger', () => {
  it('splits an integer total into integers that sum to it exactly', () => {
    let calls = 0
    const rand = () => ((calls = (calls * 9301 + 49297) % 233280), calls / 233280)
    for (const total of [0, 1, 7, 57, 1500]) {
      const out = apportionInteger(total, { a: 0.37, b: 1.2, c: 0.05, d: 3 }, rand)
      expect(Object.values(out).every(Number.isInteger)).toBe(true)
      expect(Object.values(out).reduce((s, v) => s + v, 0)).toBe(total)
    }
  })

  it('gives a fractional share its extra unit in proportion — 0.3 clicks/day is 1 click on ~30% of days, not 0 every day', () => {
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647)
    let hits = 0
    for (let i = 0; i < 4000; i++) hits += apportionInteger(1, { small: 0.3, big: 0.7 }, rand).small
    expect(hits / 4000).toBeGreaterThan(0.26)
    expect(hits / 4000).toBeLessThan(0.34)
  })

  it('returns all zeros when every weight is 0', () => {
    expect(apportionInteger(5, { a: 0, b: 0 }, () => 0.5)).toEqual({ a: 0, b: 0 })
  })
})

describe('keyword catalog', () => {
  it('has about 100 keywords, every key unique, each in an existing ad group', () => {
    expect(profile.KEYWORDS.length).toBeGreaterThanOrEqual(90)
    expect(new Set(profile.KEYWORDS.map((k) => k.key)).size).toBe(profile.KEYWORDS.length)
    const adGroups = new Set(profile.AD_GROUPS.map((a) => a.key))
    for (const k of profile.KEYWORDS) expect(adGroups.has(k.adGroupKey), k.key).toBe(true)
  })

  it('keeps keyword and search-term natural keys unique (the DB identifies them by text)', () => {
    const kwNatural = profile.KEYWORDS.map((k) => `${k.adGroupKey}|${k.text}|${k.matchType}`)
    expect(new Set(kwNatural).size).toBe(kwNatural.length)
    const stNatural = profile.SEARCH_TERMS.map((s) => `${s.adGroupKey}|${s.text}`)
    expect(new Set(stNatural).size).toBe(stNatural.length)
    expect(new Set(profile.SEARCH_TERMS.map((s) => s.key)).size).toBe(profile.SEARCH_TERMS.length)
  })

  it('anchors every search term to an existing keyword in the same ad group', () => {
    const byKey = new Map(profile.KEYWORDS.map((k) => [k.key, k]))
    for (const s of profile.SEARCH_TERMS) {
      expect(byKey.get(s.keywordKey)?.adGroupKey, s.key).toBe(s.adGroupKey)
    }
  })

  it('keeps every v2 keyword and search term (their history is keyed by text)', () => {
    expect(profile.KEYWORDS.filter((k) => /^kw_(brand|generic|toyota|honda|suzuki|daihatsu)_(name|loc|cars|suvs|exact|phrase|broad)/.test(k.key)).length).toBeGreaterThanOrEqual(24)
    expect(profile.SEARCH_TERMS.find((s) => s.key === 'st_daihatsu_broad_broad')?.text).toBe('daihatsu second jakarta')
  })

  it('points every GROUND_TRUTH row at keys that exist', () => {
    const kwKeys = new Set(profile.KEYWORDS.map((k) => k.key))
    const stKeys = new Set(profile.SEARCH_TERMS.map((s) => s.key))
    for (const g of GROUND_TRUTH) {
      const t = g.target as { searchTermKey?: string; keywordKey?: string; keywordKeys?: string[] }
      if (t.searchTermKey) expect(stKeys.has(t.searchTermKey), g.id).toBe(true)
      if (t.keywordKey) expect(kwKeys.has(t.keywordKey), g.id).toBe(true)
      for (const k of t.keywordKeys ?? []) expect(kwKeys.has(k), g.id).toBe(true)
    }
    expect(new Set(GROUND_TRUTH.map((g) => g.id)).size).toBe(GROUND_TRUTH.length)
  })
})

describe('conservation (parents equal the sum of their children)', () => {
  it('keywords sum to their ad group exactly, every day, every metric', () => {
    for (const d of days) {
      for (const ag of d.adGroups) {
        const sum = d.keywords.filter((k) => k.adGroupKey === ag.adGroupKey).reduce(add, zero())
        expect(sum.impressions).toBe(ag.impressions)
        expect(sum.clicks).toBe(ag.clicks)
        expect(sum.costMicros).toBe(ag.costMicros)
        expect(sum.conversions).toBeCloseTo(ag.conversions, 6)
      }
    }
  })

  it('visible search terms never exceed their keyword (the remainder is the withheld long tail)', () => {
    for (const d of days) {
      for (const k of d.keywords) {
        const sum = d.searchTerms.filter((s) => s.keywordKey === k.keywordKey).reduce(add, zero())
        expect(sum.impressions).toBeLessThanOrEqual(k.impressions)
        expect(sum.clicks).toBeLessThanOrEqual(k.clicks)
        expect(sum.costMicros).toBeLessThanOrEqual(k.costMicros)
        expect(sum.conversions).toBeLessThanOrEqual(k.conversions + 1e-9)
      }
    }
  })

  it('never reports more clicks than impressions', () => {
    for (const d of days) for (const r of [...d.keywords, ...d.searchTerms]) expect(r.clicks).toBeLessThanOrEqual(r.impressions)
  })

  it('leaves visible search-term coverage realistic: well above half, below 100%', () => {
    const w = windowDays()
    const kwCost = w.reduce((s, d) => s + d.keywords.reduce((a, k) => a + k.costMicros, 0), 0)
    const stCost = w.reduce((s, d) => s + d.searchTerms.reduce((a, t) => a + t.costMicros, 0), 0)
    expect(stCost / kwCost).toBeGreaterThan(0.6)
    expect(stCost / kwCost).toBeLessThan(0.95)
  })
})

describe('above the keyword level nothing moved', () => {
  it('lands the decline and the seasonal spike on the same calendar dates', () => {
    expect(addDays(profile.START_DATE, profile.DECLINE_START_DAY)).toBe('2026-06-26')
    expect(addDays(profile.START_DATE, profile.SEASONAL_SPIKE_START_DAY)).toBe('2026-07-16')
  })

  // Values recorded from the pre-v3 generator (git HEAD before step 2) —
  // the rework only changes the split below the ad group, so campaign
  // totals on the decline's first day and the spike's first day must be
  // byte-identical to what's already stored.
  it('reproduces the stored campaign totals on the decline and spike days', () => {
    const decline = generateDay('2026-06-26', 0).campaigns.find((c) => c.campaignKey === 'search_model')!
    expect(decline).toMatchObject({ impressions: 513, clicks: 19, costMicros: 27_360_000_000, conversions: 1.54 })
    const spike = generateDay('2026-07-16', 0).campaigns.find((c) => c.campaignKey === 'brand')!
    expect(spike).toMatchObject({ impressions: 246, clicks: 9, costMicros: 12_960_000_000, conversions: 0.74 })
  })
})

describe('keywords now genuinely differ', () => {
  it('spreads CPA across keywords by at least 2x', () => {
    const cpas = profile.KEYWORDS.map((k) => keywordTotals(k.key))
      .filter((t) => t.conversions >= 1)
      .map(cpa)
    expect(Math.max(...cpas) / Math.min(...cpas)).toBeGreaterThan(2)
  })

  it('keeps keyword impression share NULL until a keyword has a week of history', () => {
    const xl7 = profile.KEYWORDS.find((k) => k.key === 'kw_suzuki_xl7_phrase')!
    const start = xl7.startDay!
    expect(days[start - 1].keywords.some((k) => k.keywordKey === xl7.key)).toBe(false)
    for (let i = start; i < start + 7; i++) {
      const row = days[i].keywords.find((k) => k.keywordKey === xl7.key)!
      expect(row.searchImpressionShare).toBeNull()
      expect(row.searchRankLostImpressionShare).toBeNull()
    }
  })

  it('leaves the bid NULL under automated bidding (Brand; Generic since its day-50 switch) and set on manual CPC', () => {
    const d = days[HORIZON]
    const campaignOf = (adGroupKey: string) => profile.AD_GROUPS.find((a) => a.key === adGroupKey)!.campaignKey
    for (const k of d.keywords) {
      const manual = campaignOf(k.adGroupKey) === 'search_model'
      expect(k.cpcBidMicros === null, k.keywordKey).toBe(!manual)
    }
  })
})

describe('value tiers and conversions by action (step 4)', () => {
  const campaignOf = (adGroupKey: string) => profile.AD_GROUPS.find((a) => a.key === adGroupKey)!.campaignKey
  const v3Start = profile.CONVERSION_ACTIONS.find((a) => a.startDay)!.startDay!

  it('starts the v3 actions on 2026-10-01, after the stored history — earlier days keep the 4 v2 actions', () => {
    expect(addDays(profile.START_DATE, v3Start)).toBe('2026-10-01')
    const before = new Set(days[v3Start - 1].conversionActions.map((c) => c.conversionActionKey))
    const after = new Set(days[v3Start].conversionActions.map((c) => c.conversionActionKey))
    expect([...before].sort()).toEqual(['credit_app_started', 'financing_page_visit', 'phone_call', 'test_drive_booked'])
    expect(after.size).toBe(profile.CONVERSION_ACTIONS.length)
  })

  it('gives every action a tier and a positive default value, and labels the sale as simulated', () => {
    for (const a of profile.CONVERSION_ACTIONS) expect(a.defaultValueMicros, a.key).toBeGreaterThan(0)
    expect(profile.CONVERSION_ACTIONS.find((a) => a.valueTier === 'sale')!.name).toMatch(/simulated/i)
  })

  it("splits each keyword's conversions across actions exactly", () => {
    for (const d of days) {
      for (const k of d.keywords) {
        const sum = Object.values(k.conversionsByAction).reduce((s, v) => s + v, 0)
        expect(sum).toBeCloseTo(k.conversions, 6)
      }
    }
  })

  it("adds up, per action, to the campaign's own conversion-action totals (within rounding)", () => {
    for (const d of days) {
      for (const ca of d.conversionActions) {
        const kws = d.keywords.filter((k) => campaignOf(k.adGroupKey) === ca.campaignKey)
        if (kws.length === 0) continue
        const sum = kws.reduce((s, k) => s + (k.conversionsByAction[ca.conversionActionKey] ?? 0), 0)
        expect(Math.abs(sum - ca.conversions)).toBeLessThanOrEqual(0.06)
      }
    }
  })

  it('values each keyword at its conversions × each action default value, and never lets its terms exceed it', () => {
    const valueOf = new Map(profile.CONVERSION_ACTIONS.map((a) => [a.key, a.defaultValueMicros]))
    for (const d of days) {
      for (const k of d.keywords) {
        const expected = Object.entries(k.conversionsByAction).reduce((s, [a, c]) => s + c * valueOf.get(a)!, 0)
        expect(Math.abs(k.conversionsValueMicros - expected)).toBeLessThanOrEqual(1)
        const terms = d.searchTerms.filter((t) => t.keywordKey === k.keywordKey).reduce((s, t) => s + t.conversionsValueMicros, 0)
        expect(terms).toBeLessThanOrEqual(k.conversionsValueMicros)
      }
    }
  })

  it('makes value per conversion genuinely differ: exact keywords are worth more per lead than broad ones', () => {
    const perConversion = (matchType: string) => {
      let conv = 0
      let value = 0
      for (const d of windowDays()) {
        for (const k of d.keywords) {
          if (k.matchType !== matchType) continue
          conv += k.conversions
          value += k.conversionsValueMicros
        }
      }
      return value / conv
    }
    expect(perConversion('exact')).toBeGreaterThan(1.15 * perConversion('broad')) // ~1.24x measured
  })
})

describe('planted ground truth is present in the data', () => {
  it('waste terms: clicks, never a conversion, past the 10-click non-buyer-intent bar', () => {
    for (const key of [...termKeysOf('waste_non_buyer'), ...termKeysOf('waste_wrong_product')]) {
      const t = termTotals(key)
      expect(t.conversions, key).toBe(0)
      expect(t.clicks, key).toBeGreaterThanOrEqual(10)
    }
  })

  it('decoys: zero conversions on too few clicks for any test to call them waste', () => {
    for (const key of termKeysOf('decoy')) {
      const term = profile.SEARCH_TERMS.find((s) => s.key === key)!
      const ag = adGroupTotals(term.adGroupKey)
      const t = termTotals(key)
      expect(t.conversions, key).toBe(0)
      expect(t.clicks, key).toBeLessThan(Math.min(10, nMin(ag.conversions / ag.clicks)))
    }
  })

  it('hidden winners: convert at a lower CPA than their parent keyword', () => {
    for (const key of termKeysOf('hidden_winner')) {
      const term = profile.SEARCH_TERMS.find((s) => s.key === key)!
      const t = termTotals(key)
      expect(t.conversions, key).toBeGreaterThan(0)
      expect(cpa(t), key).toBeLessThan(cpa(keywordTotals(term.keywordKey)))
    }
  })

  it('legitimate credit / instalment / trade-in terms convert', () => {
    for (const key of termKeysOf('legit_buyer_intent')) expect(termTotals(key).conversions, key).toBeGreaterThan(0)
  })

  it('stock-less keywords: real traffic, zero conversions', () => {
    for (const g of GROUND_TRUTH.filter((r) => r.kind === 'stockless_keyword')) {
      const t = keywordTotals((g.target as { keywordKey: string }).keywordKey)
      expect(t.conversions, g.id).toBe(0)
      expect(t.clicks, g.id).toBeGreaterThanOrEqual(20)
    }
  })

  it('spin-out clusters: combined CPA at most 0.8x their ad group', () => {
    for (const g of GROUND_TRUTH.filter((r) => r.kind === 'spin_out_cluster')) {
      const keys = (g.target as { keywordKeys: string[] }).keywordKeys
      const cluster = keys.map(keywordTotals).reduce(add, zero())
      const adGroupKey = profile.KEYWORDS.find((k) => k.key === keys[0])!.adGroupKey
      expect(cpa(cluster), g.id).toBeLessThanOrEqual(0.8 * cpa(adGroupTotals(adGroupKey)))
    }
  })

  it('aging-stock keywords: lose more impression share to rank than their ad group, at a CPA below it', () => {
    for (const g of GROUND_TRUTH.filter((r) => r.kind === 'aging_stock')) {
      const key = (g.target as { keywordKeys: string[] }).keywordKeys[0]
      const adGroupKey = profile.KEYWORDS.find((k) => k.key === key)!.adGroupKey
      const rankLost = (pred: (k: DayData['keywords'][number]) => boolean) => {
        const vals = windowDays().flatMap((d) => d.keywords.filter(pred).map((k) => k.searchRankLostImpressionShare))
        const nums = vals.filter((v): v is number => v !== null)
        return nums.reduce((s, v) => s + v, 0) / nums.length
      }
      expect(rankLost((k) => k.keywordKey === key), g.id).toBeGreaterThan(
        rankLost((k) => k.adGroupKey === adGroupKey && k.keywordKey !== key) + 0.05
      )
      expect(cpa(keywordTotals(key)), g.id).toBeLessThan(cpa(adGroupTotals(adGroupKey)))
    }
  })
})
