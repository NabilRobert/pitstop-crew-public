// v3 step 6 — the deterministic engine's rules and guards
// (docs/overhaul-v3-backend.md sections 11.1 and 12), on small hand-built
// accounts so each test pins one rule.

import { describe, it, expect } from 'vitest'
import { runEngine, fingerprintOf, evidenceWindow, type EngineInput, type EngineKeyword, type EngineSearchTerm, type WindowStats } from './engine.js'
import { checkCollisions, negativeBlocks } from './negatives.js'
import { nMin } from './significance.js'
import { normalizeTerm } from './intent.js'
import type { Vehicle } from './inventory/types.js'
import type { Intent } from './types.js'

const AS_OF = '2026-10-05'
const { start: WINDOW_START, end: WINDOW_END } = evidenceWindow(AS_OF)

const stats = (clicks: number, conversions: number, costPerClick = 1_600_000_000): WindowStats => ({
  impressions: clicks * 20,
  clicks,
  costMicros: clicks * costPerClick,
  conversions,
  conversionsValueMicros: Math.round(conversions * 50_000_000_000),
})

function keyword(id: number, text: string, s: WindowStats, extra: Partial<EngineKeyword> = {}): EngineKeyword {
  return {
    id,
    adGroupId: 10,
    text,
    matchType: 'phrase',
    cpcBidMicros: null,
    firstServedOn: '2026-06-01',
    stats: s,
    qualityScore: 7,
    rankLostShare: null,
    ...extra,
  }
}

const term = (id: number, keywordId: number, text: string, s: WindowStats, adGroupId = 10): EngineSearchTerm => ({
  id,
  adGroupId,
  keywordId,
  text,
  stats: s,
})

function vehicle(id: number, make: string, model: string, listedOn: string, status: Vehicle['status'] = 'available'): Vehicle {
  return { id: String(id), make, model, year: 2021, mileageKm: 40_000, priceIdr: 200_000_000, acquisitionCostIdr: 186_000_000, status, listedOn, soldOn: null }
}

// A baseline account: one campaign, one ad group, a big healthy keyword
// that sets the ad group's conversion rate at 8% (n_min = 36 at p = 0.05).
function account(over: Partial<EngineInput> = {}): EngineInput {
  const intents = new Map<string, Intent>()
  const base: EngineInput = {
    asOf: AS_OF,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    campaigns: [{ id: 1, name: 'Search — Generic' }],
    adGroups: [{ id: 10, campaignId: 1, name: 'Used Cars' }],
    keywords: [keyword(100, '"mobil bekas jakarta"', stats(1000, 80))],
    searchTerms: [],
    intents,
    vehicleParses: new Map(),
    inventory: { source: 'demo', snapshotOn: AS_OF, vehicles: [], events: [], error: null },
    negatives: [],
    changeEvents: [],
    history: [],
    settings: { pValue: 0.05, allowedSpendShare: 0.2, leadToSaleRate: 0.02, budgetFloorIdr: 20_000, budgetCeilingIdr: 100_000 },
  }
  return { ...base, ...over }
}

function withIntents(input: EngineInput, labels: Record<string, Intent>): EngineInput {
  const m = new Map(input.intents)
  for (const [text, intent] of Object.entries(labels)) m.set(normalizeTerm(text), intent)
  return { ...input, intents: m }
}

const evidenceOnly = (input: EngineInput) => runEngine(input).candidates.filter((c) => c.basis === 'evidence')

describe('negative keywords from one search term', () => {
  const minClicks = nMin(80 / 1000) // the baseline ad group's rate (the term's clicks are added on top below)

  it('says "not enough data" below n_min clicks with zero conversions, and suggests a negative at n_min', () => {
    const below = account({ searchTerms: [term(1, 100, 'mobil bekas jakarta utara', stats(minClicks - 1, 0))] })
    const r = runEngine(below)
    expect(r.candidates.filter((c) => c.basis === 'evidence')).toHaveLength(0)
    expect(r.notEnoughData).toBe(1)

    const at = account({ searchTerms: [term(1, 100, 'mobil bekas jakarta utara', stats(minClicks, 0))] })
    const [c] = evidenceOnly(at)
    expect(c.type).toBe('negative_keyword')
    expect(c.payload).toMatchObject({ kind: 'negative_keyword', text: 'mobil bekas jakarta utara', match_type: 'exact', scope: 'ad_group' })
    expect(c.evidence.min_clicks_required).toBe(minClicks)
    expect(c.evidence).toMatchObject({ clicks: minClicks, conversions: 0, window_start: WINDOW_START, window_end: WINDOW_END })
    expect(c.expectedImpact?.wasted_spend_micros_per_week).toBeGreaterThan(0)
  })

  it('never flags a term with any conversion', () => {
    expect(evidenceOnly(account({ searchTerms: [term(1, 100, 'mobil bekas jakarta utara', stats(200, 0.5))] }))).toHaveLength(0)
  })

  it('flags a job / student / consumer term at 10 clicks, campaign-wide, well below n_min', () => {
    const input = withIntents(account({ searchTerms: [term(1, 100, 'lowongan sales mobil bekas', stats(10, 0))] }), {
      'lowongan sales mobil bekas': 'job_seeker',
    })
    const [c] = evidenceOnly(input)
    expect(c.payload).toMatchObject({ scope: 'campaign', match_type: 'exact' })
    expect(c.evidence.rules).toEqual(['negative.non_buyer_intent'])
    expect(c.evidence.intent).toBe('job_seeker')
  })

  it('leaves a 9-click job-seeker term as not enough data', () => {
    const input = withIntents(account({ searchTerms: [term(1, 100, 'lowongan sales mobil bekas', stats(9, 0))] }), {
      'lowongan sales mobil bekas': 'job_seeker',
    })
    expect(evidenceOnly(input)).toHaveLength(0)
  })

  it('does not treat a researcher or competitor term as junk under the 10-click rule', () => {
    const input = withIntents(
      account({ searchTerms: [term(1, 100, 'review avanza bekas', stats(12, 0)), term(2, 100, 'olx mobil bekas', stats(12, 0))] }),
      { 'review avanza bekas': 'researcher', 'olx mobil bekas': 'competitor' }
    )
    expect(evidenceOnly(input)).toHaveLength(0)
  })

  it('skips a term an existing negative already blocks', () => {
    const input = account({
      searchTerms: [term(1, 100, 'mobil bekas jakarta utara', stats(80, 0))],
      negatives: [{ scope: 'campaign', campaignId: 1, adGroupId: null, text: 'utara', matchType: 'broad' }],
    })
    const r = runEngine(input)
    expect(r.candidates.filter((c) => c.basis === 'evidence')).toHaveLength(0)
    expect(r.skipped.map((s) => s.reason)).toContain('already_negative')
  })
})

describe('negative matching and the collision check', () => {
  it('follows Google negative semantics: exact = the whole query, phrase = in order, broad = all words', () => {
    expect(negativeBlocks({ text: 'mobil baru', matchType: 'exact' }, 'Mobil Baru!')).toBe(true)
    expect(negativeBlocks({ text: 'mobil baru', matchType: 'exact' }, 'harga mobil baru')).toBe(false)
    expect(negativeBlocks({ text: 'mobil baru', matchType: 'phrase' }, 'harga mobil baru 2026')).toBe(true)
    expect(negativeBlocks({ text: 'mobil baru', matchType: 'phrase' }, 'baru mobil')).toBe(false)
    expect(negativeBlocks({ text: 'mobil baru', matchType: 'broad' }, 'baru beli mobil')).toBe(true)
    expect(negativeBlocks({ text: 'bengkel', matchType: 'broad' }, 'bengkelan')).toBe(false)
  })

  it('reports converting terms a negative would block, and singles out the buyers', () => {
    const check = checkCollisions({ text: 'cara', matchType: 'broad' }, [
      { text: 'cara kredit mobil bekas', conversions: 2, intent: 'buyer' },
      { text: 'cara cek mesin', conversions: 1, intent: 'consumer' },
      { text: 'cara poles body', conversions: 0, intent: 'consumer' },
    ])
    expect(check.collisions.map((c) => c.search_term)).toEqual(['cara kredit mobil bekas', 'cara cek mesin'])
    expect(check.blockedBuyers.map((c) => c.search_term)).toEqual(['cara kredit mobil bekas'])
  })

  it('counts an unclassified converting term as a buyer (never block on a guess)', () => {
    expect(checkCollisions({ text: 'cash', matchType: 'broad' }, [{ text: 'ertiga cash', conversions: 1, intent: null }]).blockedBuyers).toHaveLength(1)
  })

  it('suppresses a preventive negative that would block a converting buyer term', () => {
    const input = withIntents(
      account({
        keywords: [keyword(100, 'mobil bekas', stats(1000, 80), { matchType: 'broad' })],
        searchTerms: [term(1, 100, 'tukar tambah mobil baru ke bekas', stats(30, 3))],
      }),
      { 'tukar tambah mobil baru ke bekas': 'buyer' }
    )
    const r = runEngine(input)
    const texts = r.candidates.filter((c) => c.payload.kind === 'negative_keyword').map((c) => (c.payload as { text: string }).text)
    expect(texts).not.toContain('mobil baru')
    expect(r.skipped.find((s) => s.reason === 'collision')?.detail).toBe('tukar tambah mobil baru ke bekas')
  })
})

describe('waste-word negatives', () => {
  it('suggests a phrase negative for a word shared by 3+ zero-conversion terms with n_min clicks between them', () => {
    const input = account({
      searchTerms: [
        term(1, 100, 'mobil bekas jakarta rental', stats(15, 0)),
        term(2, 100, 'rental mobil jakarta murah', stats(15, 0)),
        term(3, 100, 'rental avanza harian', stats(15, 0)),
      ],
    })
    const token = evidenceOnly(input).find((c) => c.evidence.rules && (c.evidence.rules as string[]).includes('negative.waste_token'))
    expect(token?.payload).toMatchObject({ text: 'rental', match_type: 'phrase', scope: 'campaign' })
    expect(token?.evidence.term_count).toBe(3)
  })

  it('never proposes a word that also appears in a converting term, a keyword, or a vehicle name', () => {
    const input = account({
      searchTerms: [
        term(1, 100, 'mobil bekas jakarta rental', stats(15, 0)),
        term(2, 100, 'rental mobil jakarta murah', stats(15, 0)),
        term(3, 100, 'rental avanza harian', stats(15, 0)),
        term(4, 100, 'rental beli avanza', stats(15, 1)),
      ],
    })
    expect(evidenceOnly(input).some((c) => c.payload.kind === 'negative_keyword' && c.payload.text === 'rental')).toBe(false)
  })
})

describe('preventive (prior) negatives', () => {
  const broadAccount = (over: Partial<EngineInput> = {}) =>
    account({ keywords: [keyword(100, 'mobil bekas', stats(1000, 80), { matchType: 'broad' })], ...over })

  it('suggests the standard junk list as unverified, low-confidence negatives for a campaign with a broad keyword', () => {
    const prior = runEngine(broadAccount()).candidates.filter((c) => c.basis === 'prior')
    expect(prior.map((c) => (c.payload as { text: string }).text)).toEqual(['lowongan', 'gratis', 'skripsi', 'mobil baru', 'bengkel', 'sparepart'])
    for (const c of prior) {
      expect(c.confidence).toBe('low')
      expect(c.evidence.min_clicks_required).toBeNull()
      expect(c.evidence.clicks).toBeNull() // nothing matched it yet: no data, not 0
    }
  })

  it('skips an entry the campaign already has as a negative, and campaigns with no broad keyword', () => {
    const r = runEngine(broadAccount({ negatives: [{ scope: 'campaign', campaignId: 1, adGroupId: null, text: 'Lowongan', matchType: 'broad' }] }))
    expect(r.candidates.some((c) => c.payload.kind === 'negative_keyword' && c.payload.text === 'lowongan')).toBe(false)
    expect(runEngine(account()).candidates.filter((c) => c.basis === 'prior')).toHaveLength(0)
  })
})

describe('promote_search_term', () => {
  const base = (termStats: WindowStats, intent: Intent = 'buyer', text = 'avanza g 2019 bekas jakarta') =>
    withIntents(account({ keywords: [keyword(100, '"avanza bekas"', stats(400, 30))], searchTerms: [term(1, 100, text, termStats)] }), {
      [text]: intent,
    })

  it('promotes a buyer term with 2+ conversions at or below the parent CPA, to exact', () => {
    const [c] = evidenceOnly(base(stats(12, 3)))
    expect(c.payload).toEqual({ kind: 'promote_search_term', text: 'avanza g 2019 bekas jakarta', to_match_type: 'exact', ad_group_id: 10 })
    expect(c.evidence.term_cpa_micros).toBeLessThan(c.evidence.parent_keyword_cpa_micros as number)
  })

  it('needs 2 conversions, buyer intent, a CPA no worse than the parent, and a term that is not a keyword already', () => {
    expect(evidenceOnly(base(stats(12, 1.9)))).toHaveLength(0)
    expect(evidenceOnly(base(stats(12, 3), 'researcher'))).toHaveLength(0)
    expect(evidenceOnly(base(stats(100, 3)))).toHaveLength(0) // CPA well above the parent's
    expect(evidenceOnly(base(stats(12, 3), 'buyer', 'avanza bekas'))).toHaveLength(0)
  })
})

describe('change_match_type', () => {
  it('tightens a broad keyword spending 30%+ of its visible spend on non-buyer intents', () => {
    const input = withIntents(
      account({
        keywords: [keyword(100, '"mobil bekas jakarta"', stats(1000, 80)), keyword(101, 'mobil bekas', stats(120, 3), { matchType: 'broad' })],
        searchTerms: [term(1, 101, 'lowongan sales mobil bekas', stats(45, 0)), term(2, 101, 'mobil bekas murah', stats(60, 3))],
      }),
      { 'lowongan sales mobil bekas': 'job_seeker', 'mobil bekas murah': 'buyer' }
    )
    const c = evidenceOnly(input).find((x) => x.type === 'change_match_type')!
    expect(c.payload).toEqual({ kind: 'change_match_type', from: 'broad', to: 'phrase' })
    expect(c.evidence.non_buyer_spend_share).toBeCloseTo(45 / 105, 3)
  })
})

describe('pause_keyword', () => {
  const stocklessInput = (clicks: number, inventory: EngineInput['inventory'] = { source: 'demo', snapshotOn: AS_OF, vehicles: [vehicle(1, 'Toyota', 'Avanza', '2026-09-01')], events: [], error: null }) =>
    account({
      keywords: [keyword(100, '"mobil bekas jakarta"', stats(1000, 80)), keyword(101, '"bmw 320i bekas"', stats(clicks, 0))],
      vehicleParses: new Map([[101, { make: 'BMW', model: '320i', yearFrom: null, yearTo: null }]]),
      inventory,
    })

  it('pauses a zero-conversion keyword past n_min when the dealer has none of the car in stock', () => {
    const minClicks = nMin(80 / 1040)
    const [c] = evidenceOnly(stocklessInput(minClicks + 4))
    expect(c.type).toBe('pause_keyword')
    expect(c.evidence).toMatchObject({ rules: ['pause.no_stock'], stock_count: 0 })
    expect(c.inventorySnapshotOn).toBe(AS_OF)
    expect(evidenceOnly(stocklessInput(minClicks - 6))).toHaveLength(0)
  })

  it('pauses on Quality Score ≤ 4 with no stock link, and not on a healthy zero-conversion keyword', () => {
    const input = (qs: number) =>
      account({ keywords: [keyword(100, '"mobil bekas jakarta"', stats(1000, 80)), keyword(101, '"mobil bekas tua"', stats(80, 0), { qualityScore: qs })] })
    expect(evidenceOnly(input(4))[0].evidence.rules).toEqual(['pause.low_quality_score'])
    expect(evidenceOnly(input(5))).toHaveLength(0)
  })

  it('runs without the stock rule when the inventory is unavailable', () => {
    const r = runEngine(stocklessInput(100, { source: 'unavailable', snapshotOn: null, vehicles: [], events: [], error: 'down' }))
    expect(r.inventoryAvailable).toBe(false)
    expect(r.candidates.filter((c) => c.type === 'pause_keyword')).toHaveLength(0)
  })
})

describe('spin_out_campaign', () => {
  const cluster = (cpaFactor: number) => {
    const kws = [
      keyword(100, '"mobil bekas jakarta"', stats(1000, 60)),
      keyword(101, '"xpander bekas"', stats(100, 16 / cpaFactor)),
      keyword(102, '[mitsubishi xpander bekas]', stats(80, 13 / cpaFactor), { matchType: 'exact' }),
      keyword(103, '"harga xpander bekas"', stats(60, 10 / cpaFactor)),
    ]
    const xp = { make: 'Mitsubishi', model: 'Xpander', yearFrom: null, yearTo: null }
    return account({ keywords: kws, vehicleParses: new Map([[101, xp], [102, xp], [103, xp], [100, { make: null, model: null, yearFrom: null, yearTo: null }]]) })
  }

  it('suggests its own campaign for 3+ keywords on one model converting well below the ad group CPA', () => {
    const c = evidenceOnly(cluster(1)).find((x) => x.type === 'spin_out_campaign')!
    expect(c.payload).toEqual({ kind: 'spin_out_campaign', keyword_ids: [101, 102, 103], suggested_name: 'Search — Mitsubishi Xpander', make: 'Mitsubishi', model: 'Xpander' })
    expect(c.evidence.cluster_cpa_micros as number).toBeLessThanOrEqual(0.8 * (c.evidence.ad_group_cpa_micros as number))
  })

  it('does not when the cluster converts like the rest of the ad group', () => {
    expect(evidenceOnly(cluster(3.5)).some((x) => x.type === 'spin_out_campaign')).toBe(false)
  })
})

describe('inventory-driven suggestions', () => {
  const inv = (vehicles: Vehicle[]): EngineInput['inventory'] => ({ source: 'demo', snapshotOn: AS_OF, vehicles, events: [], error: null })

  it('raises the bid on a manual-bid keyword losing rank share on aging stock, at a CPA below its ad group', () => {
    const input = account({
      keywords: [
        keyword(100, '"avanza bekas"', stats(1000, 60), { cpcBidMicros: 2_400_000_000, rankLostShare: 0.4 }),
        keyword(101, '"toyota rush bekas"', stats(60, 6, 1_000_000_000), { cpcBidMicros: 1_000_000_000, rankLostShare: 0.5 }),
      ],
      vehicleParses: new Map([[101, { make: 'Toyota', model: 'Rush', yearFrom: null, yearTo: null }]]),
      inventory: inv([vehicle(1, 'Toyota', 'Rush', '2026-06-20'), vehicle(2, 'Toyota', 'Rush', '2026-07-01')]),
    })
    const c = runEngine(input).candidates.find((x) => x.type === 'raise_bid_candidate')!
    expect(c.payload).toEqual({ kind: 'raise_bid_candidate', current_bid_micros: 1_000_000_000, rank_lost_share: 0.5 })
    expect(c.basis).toBe('evidence')
    expect(c.evidence.avg_days_listed as number).toBeGreaterThan(60)
  })

  it('suggests a capped, prior-basis test keyword for an in-stock model no keyword names', () => {
    const models = ['Almaz', 'Confero', 'Cortez', 'Formo', 'Air', 'Alvez']
    const input = account({
      keywords: [keyword(100, '"avanza bekas"', stats(1000, 60))],
      vehicleParses: new Map([[100, { make: 'Toyota', model: 'Avanza', yearFrom: null, yearTo: null }]]),
      inventory: inv([vehicle(1, 'Toyota', 'Avanza', '2026-09-01'), ...models.map((m, i) => vehicle(10 + i, 'Wuling', m, '2026-10-01'))]),
    })
    const r = runEngine(input)
    const fresh = r.candidates.filter((c) => c.type === 'new_keyword')
    expect(fresh).toHaveLength(5) // newKeywordCap
    expect(r.skipped.filter((s) => s.reason === 'cap')).toHaveLength(1)
    for (const c of fresh) {
      expect(c).toMatchObject({ basis: 'prior', confidence: 'low' })
      expect(c.payload).toMatchObject({ kind: 'new_keyword', match_type: 'phrase', source: 'stock', is_test: true })
    }
    expect(fresh.some((c) => c.payload.kind === 'new_keyword' && c.payload.text === 'toyota avanza bekas')).toBe(false)
  })
})

describe('guards', () => {
  const wasteful = (over: Partial<EngineInput> = {}) => account({ searchTerms: [term(1, 100, 'mobil bekas jakarta utara', stats(80, 0))], ...over })
  const fp = fingerprintOf('negative_keyword', `ad_group:10|exact|mobil bekas jakarta utara`)

  it('fingerprints by type and target, stably', () => {
    expect(runEngine(wasteful()).candidates[0].fingerprint).toBe(fp)
    expect(fingerprintOf('pause_keyword', 'keyword:1')).not.toBe(fingerprintOf('raise_bid_candidate', 'keyword:1'))
  })

  it('keeps an open, planned or applied suggestion instead of duplicating it, but still reports it as produced', () => {
    for (const status of ['open', 'planned', 'applied'] as const) {
      const r = runEngine(wasteful({ history: [{ fingerprint: fp, status, statusChangedOn: null }] }))
      expect(r.candidates).toHaveLength(0)
      expect(r.produced).toContain(fp)
      expect(r.skipped[0]).toMatchObject({ fingerprint: fp, reason: status })
    }
  })

  it('holds a dismissed idea back for the cooldown, then lets it return', () => {
    const recent = runEngine(wasteful({ history: [{ fingerprint: fp, status: 'dismissed', statusChangedOn: '2026-09-20' }] }))
    expect(recent.candidates).toHaveLength(0)
    expect(recent.skipped[0].reason).toBe('dismissed_cooldown')
    const old = runEngine(wasteful({ history: [{ fingerprint: fp, status: 'dismissed', statusChangedOn: '2026-08-01' }] }))
    expect(old.candidates.map((c) => c.fingerprint)).toEqual([fp])
    const superseded = runEngine(wasteful({ history: [{ fingerprint: fp, status: 'superseded', statusChangedOn: '2026-10-01' }] }))
    expect(superseded.candidates).toHaveLength(1)
  })

  it('skips a campaign changed in the last 7 days (and everything after an account-level change)', () => {
    expect(runEngine(wasteful({ changeEvents: [{ campaignId: 1, changedOn: '2026-10-01' }] })).skipped[0].reason).toBe('change_event')
    expect(runEngine(wasteful({ changeEvents: [{ campaignId: null, changedOn: '2026-10-04' }] })).candidates).toHaveLength(0)
    expect(runEngine(wasteful({ changeEvents: [{ campaignId: 1, changedOn: '2026-09-20' }] })).candidates).toHaveLength(1)
    expect(runEngine(wasteful({ changeEvents: [{ campaignId: 2, changedOn: '2026-10-04' }] })).candidates).toHaveLength(1)
  })

  it('caps confidence at low for a keyword with under two weeks of data', () => {
    const cold = wasteful({ keywords: [keyword(100, '"mobil bekas jakarta"', stats(1000, 80), { firstServedOn: addDaysIso(WINDOW_END, -10) })] })
    expect(runEngine(cold).candidates[0].confidence).toBe('low')
    expect(runEngine(wasteful()).candidates[0].confidence).not.toBe('low')
  })

  it('ends the evidence window 3 days before the newest day (conversion lag), 90 days long', () => {
    expect(WINDOW_END).toBe('2026-10-02')
    expect(WINDOW_START).toBe('2026-07-05')
  })
})

function addDaysIso(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
