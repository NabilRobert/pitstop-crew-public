// Contract 3.3 — new_campaign proposals (docs/overhaul-v3-backend.md
// section 11.7), on small hand-built accounts so each test pins one rule.

import { describe, it, expect } from 'vitest'
import { runEngine, evidenceWindow, fingerprintOf, type EngineInput, type EngineKeyword, type WindowStats } from './engine.js'
import { dailyBudget, quantile, uniqueName } from './campaigns.js'
import { normalizeCampaignName } from './campaignName.js'
import { buildDictionary, parseVehicle } from './vehicleParse.js'
import { JUNK_NEGATIVES } from './negatives.js'
import type { Vehicle } from './inventory/types.js'
import type { NewCampaignPayload } from './types.js'

const AS_OF = '2026-10-05'
const { start: WINDOW_START, end: WINDOW_END } = evidenceWindow(AS_OF)

const stats = (clicks: number, conversions: number, costPerClick = 1_600_000_000): WindowStats => ({
  impressions: clicks * 20,
  clicks,
  costMicros: clicks * costPerClick,
  conversions,
  conversionsValueMicros: 0,
})

function keyword(id: number, text: string, s: WindowStats, adGroupId = 10): EngineKeyword {
  return { id, adGroupId, text, matchType: 'phrase', cpcBidMicros: null, firstServedOn: '2026-06-01', stats: s, qualityScore: 7, rankLostShare: null }
}

let nextVehicle = 1
function cars(
  n: number,
  make: string,
  model: string,
  o: { price?: number; margin?: number | null; listedDaysAgo?: number; year?: number } = {}
): Vehicle[] {
  return Array.from({ length: n }, () => {
    const price = o.price ?? 200_000_000
    const margin = o.margin === undefined ? 14_000_000 : o.margin
    const listed = new Date(Date.parse(AS_OF + 'T00:00:00Z') - (o.listedDaysAgo ?? 10) * 86_400_000).toISOString().slice(0, 10)
    return {
      id: String(nextVehicle++),
      make,
      model,
      year: o.year ?? 2021,
      mileageKm: 40_000,
      priceIdr: price,
      acquisitionCostIdr: margin === null ? null : price - margin,
      status: 'available' as const,
      listedOn: listed,
      soldOn: null,
    }
  })
}

// One campaign and ad group, with a generic keyword that names no vehicle.
function account(vehicles: Vehicle[], keywords: EngineKeyword[] = [], over: Partial<EngineInput> = {}): EngineInput {
  const all = [keyword(100, '"mobil bekas jakarta"', stats(1000, 80)), ...keywords]
  const dictionary = buildDictionary(vehicles)
  return {
    asOf: AS_OF,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    campaigns: [{ id: 1, name: 'Search — Generic' }],
    adGroups: [{ id: 10, campaignId: 1, name: 'Used Cars' }],
    keywords: all,
    searchTerms: [],
    intents: new Map(),
    vehicleParses: new Map(all.map((k) => [k.id, parseVehicle(k.text, dictionary)])),
    inventory: { source: 'demo', snapshotOn: AS_OF, vehicles, events: [], error: null },
    negatives: [],
    changeEvents: [],
    history: [],
    settings: { pValue: 0.05, allowedSpendShare: 0.2, leadToSaleRate: 0.02, budgetFloorIdr: 20_000, budgetCeilingIdr: 100_000 },
    ...over,
  }
}

const proposals = (input: EngineInput) => {
  const r = runEngine(input)
  return r.candidates.filter((c) => c.type === 'new_campaign')
}
const payloadOf = (c: { payload: unknown }) => c.payload as NewCampaignPayload
const texts = (p: NewCampaignPayload) => p.ad_groups.flatMap((g) => g.keywords.map((k) => k.text))

describe('uncovered_stock', () => {
  it('proposes a campaign for 2+ available units that no keyword or campaign names', () => {
    const stock = cars(2, 'Wuling', 'Almaz', { price: 245_000_000, margin: 19_000_000 })
    const [c, ...rest] = proposals(account(stock))
    expect(rest).toHaveLength(0)
    const p = payloadOf(c)
    expect(p).toMatchObject({ kind: 'new_campaign', basis: 'uncovered_stock', name: 'Search — Wuling Almaz', theme: null })
    expect(p.ad_groups).toHaveLength(1)
    expect(p.ad_groups[0]).toMatchObject({ name: 'Wuling Almaz', vehicle_ids: stock.map((v) => Number(v.id)) })
    expect(texts(p)).toContain('almaz bekas')
    expect(p.stock).toEqual({ units: 2, avg_days_listed: 10, avg_margin_idr: 19_000_000, total_value_idr: 490_000_000, snapshot_on: AS_OF })
    expect(c.basis).toBe('prior')
    expect(c.confidence).toBe('medium')
    expect(c.inventorySnapshotOn).toBe(AS_OF)
    expect(c.fingerprint).toBe(fingerprintOf('new_campaign', 'model:wuling|almaz'))
  })

  it('needs 2 units', () => {
    expect(proposals(account(cars(1, 'Wuling', 'Almaz')))).toHaveLength(0)
  })

  it('counts a campaign named after the model as coverage', () => {
    const input = account(cars(2, 'Wuling', 'Almaz'), [], { campaigns: [{ id: 1, name: 'Search — Generic' }, { id: 2, name: 'Wuling Almaz Promo' }] })
    expect(proposals(input)).toHaveLength(0)
  })
})

describe('aging_stock', () => {
  // Rush listed 70 days; a fresh Avanza alongside so the margins vary.
  const stock = () => [...cars(2, 'Toyota', 'Rush', { listedDaysAgo: 70 }), ...cars(3, 'Toyota', 'Avanza', { listedDaysAgo: 5, margin: 10_000_000 })]
  const covered = [keyword(201, '"avanza bekas"', stats(300, 20)), keyword(202, '[toyota avanza bekas]', stats(300, 20))]

  it('proposes a thinly covered model (one keyword) whose units are aging, and reports the overlap', () => {
    const input = account(stock(), [...covered, keyword(200, '"toyota rush bekas"', stats(200, 10))])
    const [c, ...rest] = proposals(input)
    expect(rest).toHaveLength(0)
    const p = payloadOf(c)
    expect(p).toMatchObject({ basis: 'aging_stock', name: 'Search — Toyota Rush' })
    expect(c.evidence).toMatchObject({ aging_units: 2, existing_keywords: 1 })
    expect(p.overlaps).toEqual([{ campaign_id: 1, name: 'Search — Generic', shared_keywords: 1 }])
    expect(texts(p)).not.toContain('toyota rush bekas') // already a keyword
  })

  it('counts several keywords that convert as real coverage', () => {
    const input = account(stock(), [...covered, keyword(200, '"toyota rush bekas"', stats(200, 10)), keyword(203, '[toyota rush second]', stats(200, 10))])
    expect(proposals(input)).toHaveLength(0)
  })

  it('treats several keywords with no conversions and too few clicks as thin', () => {
    const input = account(stock(), [...covered, keyword(200, '"toyota rush bekas"', stats(5, 0)), keyword(203, '[toyota rush second]', stats(5, 0))])
    expect(proposals(input).map((c) => payloadOf(c).basis)).toEqual(['aging_stock'])
  })

  it('proposes top-margin units even when fresh, but equal margins are nobody\'s top quartile', () => {
    const rich = [...cars(2, 'Toyota', 'Fortuner', { margin: 30_000_000 }), ...cars(6, 'Toyota', 'Avanza', { margin: 10_000_000 })]
    const kws = [...covered, keyword(200, '"fortuner bekas"', stats(200, 10))]
    expect(proposals(account(rich, kws)).map((c) => payloadOf(c).name)).toEqual(['Search — Toyota Fortuner'])
    const flat = [...cars(2, 'Toyota', 'Fortuner'), ...cars(6, 'Toyota', 'Avanza')]
    expect(proposals(account(flat, kws))).toHaveLength(0)
  })

  it('never proposes a campaign for a cluster that is a spin_out_campaign', () => {
    // Three Xpander keywords converting far cheaper than the ad group.
    const xpander = [
      keyword(300, '"xpander bekas"', stats(100, 10, 800_000_000)),
      keyword(301, '[mitsubishi xpander bekas]', stats(100, 10, 800_000_000)),
      keyword(302, '"harga xpander bekas"', stats(100, 10, 800_000_000)),
    ]
    // Loosened so the cluster would read as thin without the spin-out rule.
    const input = account(cars(2, 'Mitsubishi', 'Xpander', { listedDaysAgo: 70 }), xpander, { thresholds: { thinCoverageMaxKeywords: 5 } })
    const r = runEngine(input)
    expect(r.candidates.some((c) => c.type === 'spin_out_campaign')).toBe(true)
    expect([...r.candidates, ...r.capped].some((c) => c.type === 'new_campaign')).toBe(false)
    // ...and with the spin-out out of reach, the same stock is proposed.
    const noSpin = runEngine({ ...input, thresholds: { thinCoverageMaxKeywords: 5, spinOutMinKeywords: 4 } })
    expect(noSpin.candidates.filter((c) => c.type === 'new_campaign')).toHaveLength(1)
  })
})

describe('theme', () => {
  const small = () => [
    ...cars(2, 'Toyota', 'Agya', { price: 120_000_000, margin: 9_000_000 }),
    ...cars(2, 'Toyota', 'Calya', { price: 130_000_000, margin: 9_000_000 }),
  ]
  const thin = [keyword(200, '"agya bekas"', stats(50, 1)), keyword(201, '"calya bekas"', stats(50, 1))]

  it('groups 4+ units across 2+ thinly covered models in one price band, an ad group per model', () => {
    const [c, ...rest] = proposals(account(small(), thin))
    expect(rest).toHaveLength(0)
    const p = payloadOf(c)
    expect(p).toMatchObject({ basis: 'theme', name: 'Search — Used Cars Under Rp 150 Juta', theme: 'Used Cars Under Rp 150 Juta' })
    expect(p.ad_groups.map((g) => g.name).sort()).toEqual(['Toyota Agya', 'Toyota Calya'])
    expect(p.stock.units).toBe(4)
    expect(c.evidence.price_band).toBe('under_150')
    expect(c.confidence).toBe('low')
  })

  it('needs 4 units and 2 models', () => {
    expect(proposals(account(small().slice(0, 3), thin))).toHaveLength(0)
    expect(proposals(account(cars(4, 'Toyota', 'Agya', { price: 120_000_000 }), thin.slice(0, 1)))).toHaveLength(0)
  })

  it('leaves out a well-covered model (the decoy) and a model proposed on its own', () => {
    const stock = [...small(), ...cars(3, 'Toyota', 'Avanza', { price: 140_000_000 }), ...cars(2, 'Wuling', 'Almaz', { price: 140_000_000 })]
    const kws = [...thin, keyword(202, '"avanza bekas"', stats(300, 20)), keyword(203, '[toyota avanza bekas]', stats(300, 20))]
    const found = proposals(account(stock, kws))
    const theme = payloadOf(found.find((c) => payloadOf(c).basis === 'theme')!)
    expect(theme.ad_groups.map((g) => g.name).sort()).toEqual(['Toyota Agya', 'Toyota Calya'])
    expect(found.map((c) => payloadOf(c).basis).sort()).toEqual(['theme', 'uncovered_stock'])
    for (const c of found) expect(payloadOf(c).ad_groups.some((g) => g.name === 'Toyota Avanza')).toBe(false)
  })
})

describe('proposal contents', () => {
  it('caps keywords per campaign, round-robin across ad groups, and ad groups at 4', () => {
    const stock = ['Agya', 'Calya', 'Sigra', 'Ayla', 'Brio'].flatMap((m, i) => cars(2, i === 4 ? 'Honda' : i >= 2 ? 'Daihatsu' : 'Toyota', m, { price: 120_000_000, margin: 9_000_000 + i }))
    const [c] = proposals(account(stock, [], { thresholds: { uncoveredMinUnits: 3 } }))
    const p = payloadOf(c)
    expect(p.ad_groups).toHaveLength(4)
    expect(texts(p)).toHaveLength(12)
    expect(p.ad_groups.map((g) => g.keywords.length)).toEqual([3, 3, 3, 3])
    // The highest margins win the four ad groups.
    expect(p.ad_groups.map((g) => g.name)).not.toContain('Toyota Agya')

    const [small] = proposals(account(stock, [], { thresholds: { uncoveredMinUnits: 3, campaignMaxKeywords: 5 } }))
    expect(payloadOf(small).ad_groups.map((g) => g.keywords.length)).toEqual([2, 1, 1, 1])
  })

  it('never proposes a keyword that exists, is a negative, or a starter negative would block', () => {
    const stock = cars(2, 'Toyota', 'Rush', { listedDaysAgo: 70 })
    const input = account(stock, [keyword(200, '"toyota rush bekas"', stats(200, 10))], {
      negatives: [
        { scope: 'campaign', campaignId: 1, adGroupId: null, text: 'second', matchType: 'broad' },
        { scope: 'ad_group', campaignId: 1, adGroupId: 10, text: 'harga rush bekas', matchType: 'exact' },
      ],
    })
    const p = payloadOf(proposals(input)[0])
    const t = texts(p)
    expect(t).not.toContain('toyota rush bekas')
    expect(t).not.toContain('harga rush bekas')
    expect(t).not.toContain('rush second')
    expect(t).toContain('rush bekas')
    expect(new Set(t).size).toBe(t.length)
    for (const k of p.ad_groups.flatMap((g) => g.keywords)) expect(k.source).toBe('stock')
  })

  it('starts with the junk list plus the account\'s campaign negatives, once each', () => {
    const input = account(cars(2, 'Wuling', 'Almaz'), [], {
      negatives: [
        { scope: 'campaign', campaignId: 1, adGroupId: null, text: 'rental', matchType: 'broad' },
        { scope: 'campaign', campaignId: 2, adGroupId: null, text: 'Rental', matchType: 'broad' },
        { scope: 'campaign', campaignId: 1, adGroupId: null, text: 'lowongan', matchType: 'broad' },
        { scope: 'ad_group', campaignId: 1, adGroupId: 10, text: 'murah', matchType: 'broad' },
      ],
    })
    const p = payloadOf(proposals(input)[0])
    expect(p.starter_negatives).toEqual([...JUNK_NEGATIVES.map((j) => ({ text: j.text, match_type: j.matchType })), { text: 'rental', match_type: 'broad' }])
  })

  it('uses the place words the account already uses', () => {
    const input = account(cars(2, 'Wuling', 'Almaz'), [keyword(200, '"mobil bekas bekasi"', stats(10, 0)), keyword(201, 'used cars bekasi', stats(10, 0))])
    expect(texts(payloadOf(proposals(input)[0]))).toContain('almaz bekas bekasi')
  })

  it('counts overlaps per existing campaign, most shared first', () => {
    const input = account(cars(2, 'Toyota', 'Rush', { listedDaysAgo: 70 }), [keyword(200, '"toyota rush bekas"', stats(5, 0)), keyword(201, '[toyota rush second]', stats(5, 0), 20), keyword(202, 'toyota rush murah', stats(5, 0), 20)], {
      campaigns: [{ id: 1, name: 'Search — Generic' }, { id: 2, name: 'Search — Model' }, { id: 3, name: 'Brand' }],
      adGroups: [{ id: 10, campaignId: 1, name: 'Used Cars' }, { id: 20, campaignId: 2, name: 'Toyota' }],
    })
    expect(payloadOf(proposals(input)[0]).overlaps).toEqual([
      { campaign_id: 2, name: 'Search — Model', shared_keywords: 2 },
      { campaign_id: 1, name: 'Search — Generic', shared_keywords: 1 },
    ])
  })
})

describe('budget', () => {
  it('spreads allowed spend share × total margin over 30 days, clamped to the floor and ceiling, and says which held it (3.4)', () => {
    // 0.2 × 9,000,000 / 30 = 60,000: neither
    expect(dailyBudget(9_000_000, 0.2, 20_000, 100_000)).toEqual({ dailyMicros: 60_000_000_000, bound: null })
    expect(dailyBudget(1_000_000, 0.2, 20_000, 100_000)).toEqual({ dailyMicros: 20_000_000_000, bound: 'floor' })
    expect(dailyBudget(1_000_000_000, 0.2, 20_000, 100_000)).toEqual({ dailyMicros: 100_000_000_000, bound: 'ceiling' })
    expect(dailyBudget(0, 0.2, 20_000, 100_000)).toEqual({ dailyMicros: 20_000_000_000, bound: 'floor' })
    expect(dailyBudget(-5_000_000, 0.2, 20_000, 100_000)).toEqual({ dailyMicros: 20_000_000_000, bound: 'floor' })
    // Exactly on a bound is not held by it.
    expect(dailyBudget(3_000_000, 0.2, 20_000, 100_000)).toEqual({ dailyMicros: 20_000_000_000, bound: null })
    expect(dailyBudget(1_000_000_000, 0.2, 50_000, 10_000)).toEqual({ dailyMicros: 50_000_000_000, bound: 'floor' }) // a ceiling under the floor
  })

  it('sets budget.bound on the proposal: floor, ceiling, or neither', () => {
    const bound = (margin: number | null) => payloadOf(proposals(account(cars(2, 'Wuling', 'Almaz', { margin })))[0]).budget.bound
    expect(bound(null)).toBe('floor') // no known margin
    expect(bound(1_000_000)).toBe('floor') // 0.2 × 2,000,000 / 30 ≈ 13,333
    expect(bound(5_000_000)).toBeNull() // 0.2 × 10,000,000 / 30 ≈ 66,667
    expect(bound(19_000_000)).toBe('ceiling') // 0.2 × 38,000,000 / 30 ≈ 253,333
  })

  it('states its assumptions, and has no target CPA (floor budget) with no known margin', () => {
    const known = payloadOf(proposals(account(cars(2, 'Wuling', 'Almaz', { margin: 2_250_000 })))[0])
    // 0.2 × 4,500,000 / 30 = 30,000; target = 2,250,000 × 0.2 × 0.02
    expect(known.budget).toEqual({ daily_micros: 30_000_000_000, target_cpa_micros: 9_000_000_000, assumptions: { allowed_spend_share: 0.2, lead_to_sale_rate: 0.02 }, bound: null })
    const unknown = payloadOf(proposals(account(cars(2, 'Wuling', 'Almaz', { margin: null })))[0])
    expect(unknown.budget).toMatchObject({ daily_micros: 20_000_000_000, target_cpa_micros: null, bound: 'floor' })
    expect(unknown.stock.avg_margin_idr).toBeNull()
  })
})

describe('names', () => {
  it('compares names like a synced campaign and numbers a clash', () => {
    const taken = new Set([normalizeCampaignName('  search —  WULING almaz '), normalizeCampaignName('Search — Wuling Almaz 2')])
    expect(uniqueName('Search — Wuling Almaz', taken)).toBe('Search — Wuling Almaz 3')
    expect(uniqueName('Search — Nissan Livina', taken)).toBe('Search — Nissan Livina')
  })

  it('stays clear of real campaigns and of other open or planned proposals, but keeps its own name', () => {
    const small = [...cars(2, 'Toyota', 'Agya', { price: 120_000_000 }), ...cars(2, 'Toyota', 'Calya', { price: 130_000_000 })]
    const thin = [keyword(200, '"agya bekas"', stats(5, 0)), keyword(201, '"calya bekas"', stats(5, 0))]
    const clash = account(small, thin, { campaigns: [{ id: 1, name: 'Search — Generic' }, { id: 2, name: 'search — used cars under rp 150 juta' }] })
    expect(payloadOf(proposals(clash)[0]).name).toBe('Search — Used Cars Under Rp 150 Juta 2')

    const other = { fingerprint: 'someone-else', status: 'planned' as const, statusChangedOn: '2026-10-01', campaignName: 'Search — Wuling Almaz' }
    expect(payloadOf(proposals(account(cars(2, 'Wuling', 'Almaz'), [], { history: [other] }))[0]).name).toBe('Search — Wuling Almaz 2')
    const dismissedOther = { ...other, status: 'dismissed' as const }
    expect(payloadOf(proposals(account(cars(2, 'Wuling', 'Almaz'), [], { history: [dismissedOther] }))[0]).name).toBe('Search — Wuling Almaz')
  })

  it('gives two proposals in one run different names', () => {
    const r = runEngine(account([...cars(2, 'Wuling', 'Almaz'), ...cars(2, 'Nissan', 'Livina')], [], { campaigns: [{ id: 1, name: 'Search — Generic' }] }))
    const names = r.candidates.filter((c) => c.type === 'new_campaign').map((c) => payloadOf(c).name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('guards', () => {
  const five = () => [
    ...cars(2, 'Wuling', 'Almaz', { margin: 20_000_000 }),
    ...cars(2, 'Nissan', 'Livina', { margin: 18_000_000 }),
    ...cars(3, 'Hyundai', 'Stargazer', { margin: 15_000_000 }),
    ...cars(2, 'Chery', 'Tiggo', { margin: 10_000_000 }),
    ...cars(2, 'Kia', 'Seltos', { margin: 9_000_000 }),
  ]

  it('offers at most 3 per run, ranked by units × average margin; the rest are capped', () => {
    const r = runEngine(account(five()))
    const offered = r.candidates.filter((c) => c.type === 'new_campaign').map((c) => payloadOf(c).name)
    expect(offered).toEqual(['Search — Hyundai Stargazer', 'Search — Wuling Almaz', 'Search — Nissan Livina'])
    expect(r.capped.map((c) => payloadOf(c).name)).toEqual(['Search — Chery Tiggo', 'Search — Kia Seltos'])
    expect(r.skipped.filter((s) => s.type === 'new_campaign').map((s) => s.reason)).toEqual(['cap', 'cap'])
    expect(r.produced).toEqual(expect.arrayContaining([...r.candidates, ...r.capped].map((c) => c.fingerprint)))
  })

  it('skips one already open or planned, or dismissed recently, and fills the cap from the rest', () => {
    const fp = fingerprintOf('new_campaign', 'model:hyundai|stargazer')
    for (const status of ['open', 'planned'] as const) {
      const r = runEngine(account(five(), [], { history: [{ fingerprint: fp, status, statusChangedOn: '2026-10-01' }] }))
      expect(r.skipped).toContainEqual({ fingerprint: fp, type: 'new_campaign', reason: status })
      expect(r.candidates.filter((c) => c.type === 'new_campaign').map((c) => payloadOf(c).name)).toEqual(['Search — Wuling Almaz', 'Search — Nissan Livina', 'Search — Chery Tiggo'])
    }
    const dismissed = runEngine(account(five(), [], { history: [{ fingerprint: fp, status: 'dismissed', statusChangedOn: '2026-09-30' }] }))
    expect(dismissed.skipped).toContainEqual({ fingerprint: fp, type: 'new_campaign', reason: 'dismissed_cooldown' })
    const longAgo = runEngine(account(five(), [], { history: [{ fingerprint: fp, status: 'dismissed', statusChangedOn: '2026-08-01' }] }))
    expect(longAgo.candidates.some((c) => c.fingerprint === fp)).toBe(true)
  })

  it('proposes nothing from an unavailable inventory', () => {
    const r = runEngine(account(five(), [], { inventory: { source: 'unavailable', snapshotOn: null, vehicles: [], events: [], error: 'down' } }))
    expect(r.inventoryAvailable).toBe(false)
    expect([...r.candidates, ...r.capped].some((c) => c.type === 'new_campaign')).toBe(false)
  })

  it('keeps every proposal prior and never high confidence', () => {
    for (const c of runEngine(account(five())).candidates.filter((c) => c.type === 'new_campaign')) {
      expect(c.basis).toBe('prior')
      expect(c.confidence).not.toBe('high')
      expect(c.evidence.clicks).toBeNull()
    }
  })
})

describe('quantile', () => {
  it('takes the nearest rank', () => {
    expect(quantile([], 0.75)).toBeNull()
    expect(quantile([4, 1, 3, 2], 0.75)).toBe(3)
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2)
    expect(quantile([7], 0.75)).toBe(7)
  })
})
