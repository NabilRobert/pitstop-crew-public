// v3 step 8 — the pure parts of the keyword optimizer API (contract 3.0,
// docs/overhaul-v3.md section 13): query validation, PATCH rules, the
// export file, the inventory summary and the row → Suggestion mapping.

import { describe, it, expect } from 'vitest'
import {
  buildInventorySummary,
  buildKeywordSummaryItems,
  keywordStatus,
  type KeywordIdentityRow,
  buildNegativeExport,
  checkTransition,
  neutralizeCell,
  parseExportQuery,
  parseListQuery,
  parseStatusBody,
  toSuggestion,
  type SuggestionRow,
} from './keywordSuggestions.js'
import type { InventorySnapshot, Vehicle } from '../optimizer/inventory/types.js'

describe('GET /keyword-suggestions query', () => {
  it('defaults to open, 50, offset 0, no filters', () => {
    expect(parseListQuery({})).toEqual({ ok: true, value: { status: 'open', type: null, campaignId: null, limit: 50, offset: 0 } })
  })

  it('accepts every status, all, a type and a campaign', () => {
    for (const status of ['open', 'applied', 'dismissed', 'superseded', 'all']) expect(parseListQuery({ status }).ok).toBe(true)
    expect(parseListQuery({ type: 'pause_keyword', campaign_id: '3', limit: '200', offset: '10' })).toEqual({
      ok: true,
      value: { status: 'open', type: 'pause_keyword', campaignId: 3, limit: 200, offset: 10 },
    })
  })

  it('rejects a bad status, type, limit outside 1-200, a negative offset, or a repeated parameter', () => {
    for (const q of [{ status: 'closed' }, { type: 'delete_everything' }, { limit: '0' }, { limit: '201' }, { limit: '1.5' }, { offset: '-1' }, { campaign_id: 'x' }, { status: ['open', 'all'] }]) {
      expect(parseListQuery(q).ok, JSON.stringify(q)).toBe(false)
    }
  })
})

describe('GET /keyword-suggestions/export query', () => {
  it('defaults to open negative keywords as csv', () => {
    expect(parseExportQuery({})).toEqual({ ok: true, value: { status: 'open', format: 'csv' } })
  })

  it('exports only negative keywords, as csv or txt', () => {
    expect(parseExportQuery({ type: 'pause_keyword' }).ok).toBe(false)
    expect(parseExportQuery({ format: 'xlsx' }).ok).toBe(false)
    expect(parseExportQuery({ format: 'txt', status: 'all' })).toEqual({ ok: true, value: { status: 'all', format: 'txt' } })
  })
})

describe('PATCH /keyword-suggestions/:id', () => {
  it('takes applied, dismissed or open; superseded and anything else are 400s', () => {
    expect(parseStatusBody({ status: 'applied' })).toEqual({ ok: true, value: 'applied' })
    expect(parseStatusBody({ status: 'superseded' })).toMatchObject({ ok: false, detail: expect.stringMatching(/server only/) })
    expect(parseStatusBody({ status: 'done' }).ok).toBe(false)
    expect(parseStatusBody({ status: 'planned' })).toEqual({ ok: true, value: 'planned' })
    expect(parseStatusBody(undefined).ok).toBe(false)
  })

  it('allows open → applied / dismissed and the undo back to open', () => {
    for (const [from, to] of [['open', 'applied'], ['open', 'dismissed'], ['applied', 'open'], ['dismissed', 'open']] as const) {
      expect(checkTransition(from, to, 'pause_keyword'), `${from}→${to}`).toEqual({ ok: true })
    }
  })

  it('answers 409 for a superseded row and for any move not in the list', () => {
    expect(checkTransition('superseded', 'open', 'negative_keyword')).toMatchObject({ ok: false, code: 409, detail: expect.stringMatching(/superseded/) })
    expect(checkTransition('applied', 'dismissed', 'negative_keyword')).toMatchObject({ ok: false, code: 409, detail: expect.stringMatching(/reopen it first/) })
    expect(checkTransition('open', 'open', 'negative_keyword')).toMatchObject({ ok: false, code: 409 })
  })
})

describe('negative keyword export', () => {
  const rows = [
    { campaign: 'Search — Used Cars Generic', adGroup: null, text: 'lowongan sales mobil bekas', matchType: 'exact' as const },
    { campaign: 'Search — Model + Suburb', adGroup: 'Model — Toyota', text: 'bengkel', matchType: 'phrase' as const },
    { campaign: 'Brand', adGroup: null, text: '=HYPERLINK("http://x","y")', matchType: 'broad' as const },
  ]

  it('neutralizes every formula-looking cell', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) expect(neutralizeCell(`${lead}x`)).toBe(`'${lead}x`)
    expect(neutralizeCell('mobil bekas')).toBe('mobil bekas')
  })

  it('writes Editor-style CSV with quoting, CRLF line ends and an empty ad group for campaign negatives', () => {
    expect(buildNegativeExport(rows, 'csv')).toBe(
      'Campaign,Ad Group,Keyword,Criterion Type\r\n' +
        'Search — Used Cars Generic,,lowongan sales mobil bekas,Negative Exact\r\n' +
        'Search — Model + Suburb,Model — Toyota,bengkel,Negative Phrase\r\n' +
        `Brand,,"'=HYPERLINK(""http://x"",""y"")",Negative Broad\r\n`
    )
  })

  it('writes the txt list in match-type notation, one per line', () => {
    expect(buildNegativeExport(rows, 'txt')).toBe(`[lowongan sales mobil bekas]\n"bengkel"\n'=HYPERLINK("http://x","y")\n`)
    expect(buildNegativeExport([], 'txt')).toBe('')
    expect(buildNegativeExport([], 'csv')).toBe('Campaign,Ad Group,Keyword,Criterion Type\r\n')
  })
})

describe('GET /inventory/summary', () => {
  const ON = '2026-10-06'
  const v = (id: number, make: string, model: string, listedOn: string, status: Vehicle['status'] = 'available', soldOn: string | null = null, cost: number | null = 180_000_000): Vehicle => ({
    id: String(id), make, model, year: 2021, mileageKm: 40_000, priceIdr: 200_000_000, acquisitionCostIdr: cost, status, listedOn, soldOn,
  })
  const snap: InventorySnapshot = {
    source: 'demo',
    snapshotOn: ON,
    error: null,
    events: [],
    vehicles: [
      v(1, 'Toyota', 'Rush', '2026-07-01'),
      v(2, 'Toyota', 'Rush', '2026-08-20', 'available', null, null),
      v(3, 'Toyota', 'Avanza', '2026-09-30', 'reserved'),
      v(4, 'Toyota', 'Avanza', '2026-08-01', 'sold', '2026-09-20'),
      v(5, 'Honda', 'Brio', '2026-05-01', 'sold', '2026-08-01'),
    ],
  }
  const parses = [
    { make: 'Toyota', model: 'Rush', yearFrom: null, yearTo: null },
    { make: 'toyota', model: 'rush', yearFrom: null, yearTo: null },
    { make: 'Toyota', model: null, yearFrom: null, yearTo: null },
    { make: null, model: null, yearFrom: null, yearTo: null },
  ]

  it('totals, ages and averages the available stock, model by model', () => {
    const s = buildInventorySummary(snap, parses)
    expect(s).toMatchObject({ source: 'demo', snapshot_on: ON, error: null, totals: { available: 2, reserved: 1, sold_last_30d: 1 } })
    expect(s.aging).toEqual([
      { bucket: '0-30', count: 0 },
      { bucket: '31-60', count: 1 },
      { bucket: '61-90', count: 0 },
      { bucket: '90+', count: 1 },
    ])
    expect(s.by_model).toEqual([
      { make: 'Honda', model: 'Brio', available: 0, avg_days_listed: null, avg_price_idr: null, avg_margin_idr: null, linked_keyword_count: 0 },
      { make: 'Toyota', model: 'Avanza', available: 0, avg_days_listed: null, avg_price_idr: null, avg_margin_idr: null, linked_keyword_count: 0 },
      { make: 'Toyota', model: 'Rush', available: 2, avg_days_listed: 72, avg_price_idr: 200_000_000, avg_margin_idr: 20_000_000, linked_keyword_count: 2 },
    ])
  })

  it('degrades to source unavailable with empty lists and the sanitized error', () => {
    expect(buildInventorySummary({ source: 'unavailable', snapshotOn: null, vehicles: [], events: [], error: 'connection refused' }, parses)).toEqual({
      source: 'unavailable',
      snapshot_on: null,
      error: 'connection refused',
      totals: null,
      aging: [],
      by_model: [],
    })
  })
})

describe('row → Suggestion', () => {
  const row: SuggestionRow = {
    id: 9,
    pipeline_run_id: 145,
    suggestion_type: 'pause_keyword',
    status: 'open',
    basis: 'evidence',
    confidence: 'medium',
    rank: null,
    explanation: null,
    campaign_id: 2,
    campaign_name: 'Search — Used Cars Generic',
    ad_group_id: 3,
    ad_group_name: 'Used Cars Generic',
    keyword_id: 40,
    keyword_text: '"bmw 320i bekas"',
    keyword_match_type: 'phrase',
    search_term_id: null,
    search_term_text: null,
    payload: { kind: 'pause_keyword' },
    evidence: { window_start: '2026-07-06', window_end: '2026-10-03', clicks: 57, impressions: 1214, cost_micros: 1, conversions: 0, conversions_value_micros: 0, min_clicks_required: 37, stock_count: 0, avg_days_listed: null, avg_margin_idr: null },
    expected_impact: { wasted_spend_micros_per_week: 8_890_000_000 },
    inventory_snapshot_on: '2026-10-06',
    created_at: new Date('2026-10-06T12:45:00Z'),
    status_changed_at: null,
    linked_campaign_id: null,
    linked_campaign_name: null,
  }

  it('maps names to the nested objects, null where there is no link, and builds the inventory block from evidence', () => {
    expect(toSuggestion(row)).toMatchObject({
      type: 'pause_keyword',
      campaign: { id: 2, name: 'Search — Used Cars Generic' },
      ad_group: { id: 3, name: 'Used Cars Generic' },
      keyword: { id: 40, text: '"bmw 320i bekas"', match_type: 'phrase' },
      search_term: null,
      inventory: { snapshot_on: '2026-10-06', stock_count: 0, avg_days_listed: null, avg_margin_idr: null },
      created_at: '2026-10-06T12:45:00.000Z',
      status_changed_at: null,
    })
  })

  it('has no inventory block on a row that did not use the inventory', () => {
    expect(toSuggestion({ ...row, inventory_snapshot_on: null }).inventory).toBeNull()
  })

  it('3.3: carries linked_campaign once a planned proposal became a real campaign, null otherwise', () => {
    expect(toSuggestion(row).linked_campaign).toBeNull()
    expect(toSuggestion({ ...row, linked_campaign_id: 9, linked_campaign_name: 'Search — Wuling Almaz' }).linked_campaign).toEqual({ id: 9, name: 'Search — Wuling Almaz' })
  })
})

describe('GET /keywords/summary listing (contract 3.2)', () => {
  const row = (id: number, status: string | null, text = `"keyword ${id}"`): KeywordIdentityRow => ({
    id, text, match_type: 'phrase', status, ad_group_id: 3, ad_group_name: 'Used Cars Generic', campaign_id: 2, campaign_name: 'Search — Used Cars Generic',
  })
  const parts = {
    intents: new Map([[1, { intentMix: { buyer: 1 }, intentCoverage: 0.8, wasteExposure: 0 }]]),
    actions: new Map([[1, [{ conversion_action_id: 1, name: 'Test Drive Booked', tier: 'visit' as const, conversions: 2, value_micros: 300_000_000_000 }]]]),
    stock: (id: number) => (id === 4 ? { stockCount: 0, avgDaysListed: null } : id === 1 ? { stockCount: 3, avgDaysListed: 20 } : null),
    verdicts: new Map([[1, 'winner' as const], [2, 'needs_data' as const], [4, 'no_stock' as const]]),
  }

  it('maps the stored status: removed is left out, paused (any case) is paused, anything else is enabled', () => {
    expect(['removed', 'REMOVED', 'paused', 'PAUSED', 'enabled', 'ENABLED', null, 'unknown'].map(keywordStatus)).toEqual([
      null, null, 'paused', 'paused', 'enabled', 'enabled', 'enabled', 'enabled',
    ])
  })

  it('lists every keyword that is not removed, in id order, with its identity and status', () => {
    const items = buildKeywordSummaryItems([row(4, 'PAUSED'), row(1, 'enabled'), row(3, 'removed'), row(2, null)], parts)
    expect(items.map((i) => [i.keyword_id, i.status])).toEqual([[1, 'enabled'], [2, 'enabled'], [4, 'paused']])
    expect(items[0]).toMatchObject({
      text: '"keyword 1"',
      match_type: 'phrase',
      campaign: { id: 2, name: 'Search — Used Cars Generic' },
      ad_group: { id: 3, name: 'Used Cars Generic' },
      intent_mix: { buyer: 1 },
      stock_count: 3,
      verdict: 'winner',
    })
  })

  it('gives an enabled keyword with no activity honest empties and needs_data', () => {
    const [idle] = buildKeywordSummaryItems([row(2, 'enabled')], parts)
    expect(idle).toEqual({
      keyword_id: 2, text: '"keyword 2"', match_type: 'phrase',
      campaign: { id: 2, name: 'Search — Used Cars Generic' }, ad_group: { id: 3, name: 'Used Cars Generic' },
      status: 'enabled', intent_mix: null, intent_coverage: null, conversions_by_action: [],
      stock_count: null, avg_days_listed: null, waste_exposure: null, verdict: 'needs_data',
    })
  })

  it('keeps a paused keyword’s stock link and verdict, and defaults a keyword with no verdict to needs_data', () => {
    const items = buildKeywordSummaryItems([row(4, 'paused'), row(5, 'enabled')], parts)
    expect(items[0]).toMatchObject({ status: 'paused', stock_count: 0, verdict: 'no_stock', conversions_by_action: [] })
    expect(items[1].verdict).toBe('needs_data')
  })
})

describe('3.3: the planned status (new_campaign only)', () => {
  it('rejects planned for every other suggestion type with a 400', () => {
    for (const type of ['negative_keyword', 'promote_search_term', 'change_match_type', 'pause_keyword', 'spin_out_campaign', 'new_keyword', 'raise_bid_candidate'] as const) {
      expect(checkTransition('open', 'planned', type), type).toMatchObject({ ok: false, code: 400 })
    }
  })

  it('allows open → planned, planned → open / dismissed / applied, and the usual moves, for a new_campaign', () => {
    for (const [from, to] of [
      ['open', 'planned'], ['planned', 'open'], ['planned', 'dismissed'], ['planned', 'applied'],
      ['open', 'applied'], ['open', 'dismissed'], ['applied', 'open'], ['dismissed', 'open'],
    ] as const) {
      expect(checkTransition(from, to, 'new_campaign'), `${from}→${to}`).toEqual({ ok: true })
    }
  })

  it('refuses the moves outside the table (409), and anything on a superseded proposal', () => {
    for (const [from, to] of [['planned', 'planned'], ['dismissed', 'planned'], ['applied', 'planned'], ['applied', 'dismissed']] as const) {
      expect(checkTransition(from, to, 'new_campaign'), `${from}→${to}`).toMatchObject({ ok: false, code: 409 })
    }
    expect(checkTransition('superseded', 'planned', 'new_campaign')).toMatchObject({ ok: false, code: 409 })
  })

  it('lists planned and new_campaign as valid filters', () => {
    expect(parseListQuery({ status: 'planned', type: 'new_campaign' })).toMatchObject({ ok: true, value: { status: 'planned', type: 'new_campaign' } })
  })
})
