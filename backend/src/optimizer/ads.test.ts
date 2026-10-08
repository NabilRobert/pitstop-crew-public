// Contract 3.6 step b — new_ad suggestions from the engine
// (docs/overhaul-v3-backend.md section 11.9), on small hand-built accounts
// so each test pins one rule: each basis and its decoy, winners in a
// proposal's keywords, the per-run cap, dedupe by ad_target, supersede on
// changed facts, and campaign_suggestion_id filled in the same run.

import { describe, it, expect } from 'vitest'
import { runEngine, evidenceWindow, type Candidate, type EngineAd, type EngineInput, type EngineKeyword, type SuggestionHistory, type WindowStats } from './engine.js'
import { planPersistence, persistSuggestions } from './suggestions.js'
import { buildDictionary, parseVehicle } from './vehicleParse.js'
import type { AdSettings } from './ads.js'
import type { NewAdPayload, NewCampaignPayload } from './types.js'
import type { Vehicle } from './inventory/types.js'

const AS_OF = '2026-10-05'
const { start: WINDOW_START, end: WINDOW_END } = evidenceWindow(AS_OF)

const stats = (clicks: number, conversions: number, costPerClick = 1_600_000_000, impressions = clicks * 20): WindowStats => ({
  impressions,
  clicks,
  costMicros: clicks * costPerClick,
  conversions,
  conversionsValueMicros: 0,
})

function keyword(id: number, text: string, s: WindowStats, adGroupId = 10): EngineKeyword {
  return { id, adGroupId, text, matchType: 'phrase', cpcBidMicros: null, firstServedOn: '2026-06-01', stats: s, qualityScore: 7, rankLostShare: null }
}

let nextVehicle = 1
function cars(n: number, make: string, model: string, listedDaysAgo = 10): Vehicle[] {
  const listed = new Date(Date.parse(AS_OF + 'T00:00:00Z') - listedDaysAgo * 86_400_000).toISOString().slice(0, 10)
  return Array.from({ length: n }, () => ({
    id: String(nextVehicle++),
    make,
    model,
    year: 2021,
    mileageKm: 40_000,
    priceIdr: 200_000_000,
    acquisitionCostIdr: 186_000_000,
    status: 'available' as const,
    listedOn: listed,
    soldOn: null,
  }))
}

const AD_SETTINGS: AdSettings = {
  dealerName: 'Pitstop Used Cars',
  dealerCity: 'Tangerang',
  dealerArea: 'Gading Serpong',
  dealerWhatsapp: '0812-5550-0123',
  landingUrl: null,
  claims: { installments: true, trade_in: true, test_drive: true, inspection: true },
  inspectionWording: 'Unit sudah melalui pemeriksaan',
}

function ad(id: number, adGroupId: number, o: Partial<EngineAd> = {}): EngineAd {
  return {
    id,
    adGroupId,
    label: `Ad ${id}`,
    headlines: ['Mobil Bekas Berkualitas', 'Showroom Tangerang', 'Harga Terjangkau'],
    descriptions: ['a', 'b'],
    finalUrl: 'https://dealer.example.com/',
    adStrength: 'good',
    stats: stats(10, 0, 1_600_000_000, 200),
    ...o,
  }
}

// One generic campaign (ad group 10) plus model ad groups 20-23 that name a
// make with stock. campaignCap 0: no new_campaign proposal (and none of its
// ads) gets in the way of the basis under test.
function account(over: Partial<EngineInput> = {}, extraKeywords: EngineKeyword[] = []): EngineInput {
  const vehicles = over.inventory?.vehicles ?? [...cars(3, 'Toyota', 'Innova'), ...cars(2, 'Honda', 'Jazz'), ...cars(2, 'Suzuki', 'Ertiga'), ...cars(2, 'Daihatsu', 'Xenia')]
  const all = [keyword(100, '"mobil bekas jakarta"', stats(1000, 80)), ...extraKeywords]
  const dictionary = buildDictionary(vehicles)
  return {
    asOf: AS_OF,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    campaigns: [
      { id: 1, name: 'Search — Generic' },
      { id: 2, name: 'Search — Model' },
    ],
    adGroups: [
      { id: 10, campaignId: 1, name: 'Used Cars' },
      { id: 20, campaignId: 2, name: 'Model — Toyota' },
      { id: 21, campaignId: 2, name: 'Model — Honda' },
      { id: 22, campaignId: 2, name: 'Model — Suzuki' },
      { id: 23, campaignId: 2, name: 'Model — Daihatsu' },
    ],
    keywords: all,
    searchTerms: [],
    intents: new Map(),
    vehicleParses: new Map(all.map((k) => [k.id, parseVehicle(k.text, dictionary)])),
    inventory: { source: 'demo', snapshotOn: AS_OF, vehicles, events: [], error: null },
    negatives: [],
    changeEvents: [],
    history: [],
    settings: { pValue: 0.05, allowedSpendShare: 0.2, leadToSaleRate: 0.02, budgetFloorIdr: 20_000, budgetCeilingIdr: 100_000 },
    ads: [],
    adSettings: AD_SETTINGS,
    thresholds: { campaignCap: 0 },
    ...over,
  }
}

const newAds = (input: EngineInput) => runEngine(input).candidates.filter((c) => c.type === 'new_ad')
const payload = (c: Candidate) => c.payload as NewAdPayload

// A winner in ad group 20: enough clicks, 2+ conversions, CPA below its ad group's.
const innovaWinner = keyword(200, '"innova bekas"', stats(400, 40, 800_000_000), 20)

describe('weak_ad', () => {
  it('replaces an ad with poor strength in an ad group that names a make with stock', () => {
    const [c, ...rest] = newAds(account({ ads: [ad(1, 20, { adStrength: 'poor' }), ad(2, 20)] }))
    expect(rest).toHaveLength(0)
    expect(payload(c)).toMatchObject({ basis: 'weak_ad', replaces_ad_id: 1, ad_group_name: 'Model — Toyota', campaign_name: 'Search — Model', campaign_suggestion_id: null })
    expect(payload(c).facts).toMatchObject({ make: 'Toyota', model: null, units: 3 })
    expect(payload(c).final_url_source).toBe('ad_group')
    expect(c.evidence.rules).toEqual(['ad.weak_ad.poor_strength'])
    expect(c).toMatchObject({ basis: 'evidence', confidence: 'medium', adGroupId: 20, campaignId: 2 })
  })

  it('replaces an ad whose CTR is at most 0.8× the best other ad, both with 1,000+ impressions', () => {
    const weak = ad(1, 20, { stats: stats(40, 1, 1_600_000_000, 2000) }) // 2%
    const strong = ad(2, 20, { stats: stats(100, 3, 1_600_000_000, 2000) }) // 5%
    const [c] = newAds(account({ ads: [weak, strong] }))
    expect(payload(c)).toMatchObject({ basis: 'weak_ad', replaces_ad_id: 1 })
    expect(c.evidence).toMatchObject({ rules: ['ad.weak_ad.low_ctr'], ctr: 0.02, best_other_ctr: 0.05 })

    const thin = ad(1, 20, { stats: stats(40, 1, 1_600_000_000, 999) })
    expect(newAds(account({ ads: [thin, strong] }))).toHaveLength(0)
  })

  it('leaves an ad group that names no make with stock alone', () => {
    expect(newAds(account({ ads: [ad(1, 10, { adStrength: 'poor' })] }))).toHaveLength(0) // "Used Cars"
  })
})

describe('uncovered_winner', () => {
  it('proposes an ad naming the model when its winner keyword lands on ads that do not', () => {
    const [c, ...rest] = newAds(account({ ads: [ad(1, 20)] }, [innovaWinner]))
    expect(rest).toHaveLength(0)
    expect(payload(c)).toMatchObject({ basis: 'uncovered_winner', ad_target: 'ad_group:20|toyota|innova', replaces_ad_id: null })
    expect(payload(c).facts).toMatchObject({ make: 'Toyota', model: 'Innova', units: 3 })
    expect(payload(c).winner_keywords).toEqual([{ text: 'innova bekas', source: 'keyword', keyword_id: 200, search_term_id: null }])
    expect(payload(c).headlines[0]).toBe('Toyota Innova Bekas')
    expect(c.evidence).toMatchObject({ rules: ['ad.uncovered_winner'], winner_count: 1, winner_conversions: 40 })
  })

  it('does not fire for the decoy: a strong ad group whose ads already name the model', () => {
    const named = ad(1, 20, { headlines: ['Toyota Innova Bekas', 'Showroom Tangerang', 'Bisa Kredit'] })
    expect(newAds(account({ ads: [named] }, [innovaWinner]))).toHaveLength(0)
  })

  it('needs stock of the model', () => {
    const noInnova = [...cars(2, 'Toyota', 'Avanza'), ...cars(2, 'Honda', 'Jazz')]
    const input = account({ ads: [ad(1, 20)], inventory: { source: 'demo', snapshotOn: AS_OF, vehicles: noInnova, events: [], error: null } }, [innovaWinner])
    expect(newAds(input).filter((c) => payload(c).basis === 'uncovered_winner')).toHaveLength(0)
  })
})

describe('the per-run cap', () => {
  it('offers at most 3 weak_ad + uncovered_winner ads, weak ads with the most impressions first; the rest are capped', () => {
    const poor = (id: number, group: number, impressions: number) => ad(id, group, { adStrength: 'poor', stats: stats(10, 0, 1_600_000_000, impressions) })
    const input = account({ ads: [poor(1, 20, 400), poor(2, 21, 300), poor(3, 22, 200), poor(4, 23, 100)] })
    const r = runEngine(input)
    expect(r.candidates.filter((c) => c.type === 'new_ad').map((c) => payload(c).replaces_ad_id)).toEqual([1, 2, 3])
    expect(r.capped.filter((c) => c.type === 'new_ad').map((c) => payload(c).replaces_ad_id)).toEqual([4])
    expect(r.skipped.filter((s) => s.type === 'new_ad').map((s) => s.reason)).toEqual(['cap'])
  })
})

describe('dedupe by ad_target, and supersede on changed facts', () => {
  const weakInput = (history: SuggestionHistory[]) => account({ ads: [ad(1, 20, { adStrength: 'poor' }), ad(2, 20)], history })
  const target = 'ad_group:20|toyota|'
  const at = (status: SuggestionHistory['status'], daysAgo: number): SuggestionHistory => ({
    fingerprint: 'old-facts',
    status,
    statusChangedOn: new Date(Date.parse(AS_OF + 'T00:00:00Z') - daysAgo * 86_400_000).toISOString().slice(0, 10),
    adTarget: target,
  })

  it('a planned ad for the target blocks a new one, whatever its facts', () => {
    expect(payload(newAds(weakInput([]))[0]).ad_target).toBe(target)
    expect(newAds(weakInput([at('planned', 100)]))).toHaveLength(0)
  })

  it('an applied or dismissed ad blocks it for the cooldown (28 days)', () => {
    expect(newAds(weakInput([at('applied', 5)]))).toHaveLength(0)
    expect(newAds(weakInput([at('dismissed', 27)]))).toHaveLength(0)
    expect(newAds(weakInput([at('dismissed', 28)]))).toHaveLength(1)
  })

  it('an open ad with old facts is superseded and the new one inserted', () => {
    const r = runEngine(weakInput([at('open', 3)]))
    const [c] = r.candidates.filter((x) => x.type === 'new_ad')
    expect(c.fingerprint).not.toBe('old-facts')
    const plan = planPersistence(r, [{ id: 9, fingerprint: 'old-facts', inventoryDependent: true }])
    expect(plan.supersedeIds).toEqual([9])
    expect(plan.insert.map((x) => x.fingerprint)).toContain(c.fingerprint)
  })
})

describe('new_campaign ads and winners in a proposal', () => {
  // Rush: 2 units listed 70 days, one converting keyword (thin coverage),
  // cheap enough to be a winner. Avanza alongside so margins vary.
  const rushWinner = keyword(300, '"toyota rush bekas"', stats(300, 30, 800_000_000))
  const stock = () => [...cars(2, 'Toyota', 'Rush', 70), ...cars(3, 'Toyota', 'Avanza', 5)]
  const covered = [keyword(301, '"avanza bekas"', stats(300, 20)), keyword(302, '[toyota avanza bekas]', stats(300, 20))]
  const input = (over: Partial<EngineInput> = {}) =>
    account(
      { inventory: { source: 'demo', snapshotOn: AS_OF, vehicles: stock(), events: [], error: null }, adGroups: [{ id: 10, campaignId: 1, name: 'Used Cars' }], thresholds: {}, ...over },
      [...covered, rushWinner]
    )

  it("starts the proposal's ad group with the winner keyword, source existing_keyword, though it already exists", () => {
    const [p] = runEngine(input()).candidates.filter((c) => c.type === 'new_campaign')
    const first = (p.payload as NewCampaignPayload).ad_groups[0].keywords[0]
    expect(first).toEqual({ text: 'toyota rush bekas', match_type: 'phrase', source: 'existing_keyword' })
  })

  const proposalAds = (cs: Candidate[]) => cs.filter((c) => c.type === 'new_ad' && payload(c).basis === 'new_campaign')

  it('proposes one uncapped ad per proposal ad group, tied to the proposal', () => {
    const r = runEngine(input())
    const [p] = r.candidates.filter((c) => c.type === 'new_campaign')
    const [a, ...rest] = proposalAds(r.candidates)
    expect(rest).toHaveLength(0)
    const name = (p.payload as NewCampaignPayload).name
    expect(payload(a)).toMatchObject({ basis: 'new_campaign', campaign_name: name, ad_group_name: 'Toyota Rush', ad_target: `proposal:${p.fingerprint}|Toyota Rush`, campaign_suggestion_id: null })
    expect(a.evidence.campaign_fingerprint).toBe(p.fingerprint)
    expect(a).toMatchObject({ basis: 'prior', confidence: 'low' })
  })

  it("uses the stored proposal's id when the proposal is already open, and proposes none for a dismissed one", () => {
    const [p] = runEngine(input()).candidates.filter((c) => c.type === 'new_campaign')
    const open = proposalAds(newAds(input({ history: [{ id: 67, fingerprint: p.fingerprint, status: 'open', statusChangedOn: null }] })))
    expect(payload(open[0]).campaign_suggestion_id).toBe(67)
    expect(proposalAds(newAds(input({ history: [{ id: 67, fingerprint: p.fingerprint, status: 'dismissed', statusChangedOn: AS_OF }] })))).toHaveLength(0)
  })

  it('fills campaign_suggestion_id when the proposal and its ad are stored in the same run', async () => {
    const r = runEngine(input())
    let nextId = 500
    const inserted: { type: string; payload: Record<string, unknown> }[] = []
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FOR UPDATE')) return { rows: [], rowCount: 0 }
        if (sql.includes('INSERT INTO keyword_suggestions')) {
          inserted.push({ type: params[1] as string, payload: JSON.parse(params[6] as string) })
          return { rows: [{ id: nextId++ }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      },
    }
    const stored = await persistSuggestions(client as never, 1, r)
    const proposalId = 500 + inserted.findIndex((x) => x.type === 'new_campaign')
    const adRow = inserted.find((x) => x.type === 'new_ad' && x.payload.basis === 'new_campaign')!
    expect(adRow.payload.campaign_suggestion_id).toBe(proposalId)
    expect(stored.newAds.filter((a) => a.payload.basis === 'new_campaign').map((a) => a.payload.campaign_suggestion_id)).toEqual([proposalId])
  })
})

describe('no inventory, no ads', () => {
  it('proposes no ad from an unavailable inventory, or without ad settings', () => {
    const ads = [ad(1, 20, { adStrength: 'poor' })]
    expect(newAds(account({ ads, inventory: { source: 'unavailable', snapshotOn: null, vehicles: [], events: [], error: 'down' } }))).toHaveLength(0)
    expect(newAds(account({ ads, adSettings: null }))).toHaveLength(0)
  })
})
