// v3 step 5 — demo stock, keyword → vehicle parsing, stock matching,
// target CPA and the external source's read-only guard
// (docs/overhaul-v3-backend.md sections 7.4 and 10). No DB, no network.

import { describe, it, expect } from 'vitest'
import { DEMO_STOCK } from '../data/demo/inventory.js'
import { KEYWORDS, BASELINE_CLICKS, BASELINE_CONVERSIONS, BASELINE_CPC_MICROS } from '../data/demo/profile.js'
import { AGING_VEHICLES, FRESH_VEHICLES, GROUND_TRUTH, STOCKLESS_VEHICLES, UNCOVERED_VEHICLES } from '../data/demo/groundTruth.js'
import { buildDictionary, needsModelParse, parseVehicle, parseVehicleBatch } from './vehicleParse.js'
import { parseKeywords } from './vehicleParseJob.js'
import { agingBucket, matchStock, targetCpaMicros } from './stock.js'
import { ExternalInventorySource, assertReadOnlySql, sanitizeInventoryError } from './inventory/external.js'
import { loadInventorySnapshot } from './inventory/index.js'
import type { Vehicle } from './inventory/types.js'

const SNAPSHOT = '2026-09-30'
const addDays = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
// The demo stock as the demo source returns it, anchored at SNAPSHOT.
const stock: Vehicle[] = DEMO_STOCK.map((v, i) => ({
  id: String(i + 1),
  make: v.make,
  model: v.model,
  year: v.year,
  mileageKm: v.mileageKm,
  priceIdr: v.priceIdr,
  acquisitionCostIdr: v.acquisitionCostIdr,
  status: v.status,
  listedOn: addDays(SNAPSHOT, -v.listedDaysAgo),
  soldOn: v.soldDaysAgo === null ? null : addDays(SNAPSHOT, -v.soldDaysAgo),
}))
const dictionary = buildDictionary(stock)
const same = (a: { make: string; model: string }, b: { make: string; model: string }) =>
  a.make === b.make && a.model === b.model
const keywordText = (key: string) => KEYWORDS.find((k) => k.key === key)!.text

describe('demo stock', () => {
  it('is 40-60 vehicles across at least 10 models, with stable unique ids', () => {
    expect(DEMO_STOCK.length).toBeGreaterThanOrEqual(40)
    // Above the spec's "about 40-60": every model a converting keyword
    // names has at least one unit (added after step 8), and the 3.3
    // uncovered-stock plants.
    expect(DEMO_STOCK.length).toBeLessThanOrEqual(80)
    expect(new Set(DEMO_STOCK.map((v) => `${v.make}|${v.model}`)).size).toBeGreaterThanOrEqual(10)
    expect(new Set(DEMO_STOCK.map((v) => v.externalId)).size).toBe(DEMO_STOCK.length)
  })

  it('has a margin on every unit, and margins that vary', () => {
    const margins = DEMO_STOCK.map((v) => v.priceIdr - v.acquisitionCostIdr)
    expect(Math.min(...margins)).toBeGreaterThan(0)
    expect(Math.max(...margins) / Math.min(...margins)).toBeGreaterThan(2)
  })

  it('agrees with the ground truth: no stock-less model, aging models sit > 60 days, fresh ones < 14, uncovered ones unnamed', () => {
    for (const s of STOCKLESS_VEHICLES) expect(stock.some((v) => same(v, s)), `${s.make} ${s.model}`).toBe(false)
    for (const a of AGING_VEHICLES) {
      const units = stock.filter((v) => same(v, a) && v.status === 'available')
      expect(units.length, a.model).toBeGreaterThan(0)
      expect(units.every((v) => v.listedOn < addDays(SNAPSHOT, -60)), a.model).toBe(true)
    }
    for (const f of FRESH_VEHICLES) {
      const units = stock.filter((v) => same(v, f))
      expect(units.length).toBeGreaterThan(0)
      expect(units.every((v) => v.listedOn >= addDays(SNAPSHOT, -14))).toBe(true)
      // ...and no keyword targets it, which is what makes it a new_keyword plant.
      expect(KEYWORDS.some((k) => { const p = parseVehicle(k.text, dictionary); return p.make === f.make && p.model === f.model })).toBe(false)
    }
    for (const u of UNCOVERED_VEHICLES) {
      expect(stock.filter((v) => same(v, u) && v.status === 'available').length, u.model).toBeGreaterThanOrEqual(2)
      expect(KEYWORDS.some((k) => { const p = parseVehicle(k.text, dictionary); return p.make === u.make && p.model === u.model }), u.model).toBe(false)
    }
  })

  it('puts sold units inside their listing window', () => {
    for (const v of DEMO_STOCK.filter((s) => s.status === 'sold')) {
      expect(v.soldDaysAgo).not.toBeNull()
      expect(v.soldDaysAgo!).toBeLessThan(v.listedDaysAgo)
    }
  })
})

describe('parseVehicle', () => {
  it('reads make and model, inferring the make from the model', () => {
    expect(parseVehicle('"avanza bekas"')).toMatchObject({ make: 'Toyota', model: 'Avanza' })
    expect(parseVehicle('[mitsubishi xpander bekas]')).toMatchObject({ make: 'Mitsubishi', model: 'Xpander' })
    expect(parseVehicle('"honda hr-v bekas"')).toMatchObject({ make: 'Honda', model: 'HR-V' })
  })

  it('prefers the longest alias ("pajero sport" over "pajero", "karimun wagon r" over "karimun")', () => {
    expect(parseVehicle('pajero sport dakar bekas').model).toBe('Pajero Sport')
    expect(parseVehicle('"karimun wagon r bekas"').model).toBe('Karimun Wagon R')
  })

  it('only takes a common-word alias when the make is there too', () => {
    expect(parseVehicle('"honda city bekas"')).toMatchObject({ make: 'Honda', model: 'City' })
    expect(parseVehicle('mobil bekas jakarta city')).toMatchObject({ make: null, model: null })
    expect(parseVehicle('rush hour')).toMatchObject({ make: null })
  })

  it('keeps a make-only keyword at make level, and a generic keyword at null', () => {
    expect(parseVehicle('used toyota near me')).toEqual({ make: 'Toyota', model: null, yearFrom: null, yearTo: null })
    expect(parseVehicle('"mobil bekas murah"')).toEqual({ make: null, model: null, yearFrom: null, yearTo: null })
  })

  it('reads years and year ranges', () => {
    expect(parseVehicle('avanza 2019 bekas')).toMatchObject({ yearFrom: 2019, yearTo: 2019 })
    expect(parseVehicle('xenia 2016 2018')).toMatchObject({ yearFrom: 2016, yearTo: 2018 })
  })

  it('learns models from the inventory, requiring the make for short or numeric ones', () => {
    const d = buildDictionary([
      { make: 'Chery', model: 'Tiggo' },
      { make: 'Lexus', model: 'NX' },
    ])
    expect(parseVehicle('tiggo bekas', d)).toMatchObject({ make: 'Chery', model: 'Tiggo' })
    expect(parseVehicle('nx bekas', d).model).toBeNull()
  })

  it('settles every demo keyword by rules — no model call needed', () => {
    for (const k of KEYWORDS) {
      expect(needsModelParse(k.text, parseVehicle(k.text, dictionary), dictionary), k.text).toBe(false)
    }
  })

  it('sends a keyword with an unknown word to the model', () => {
    const text = 'chery omoda bekas'
    expect(needsModelParse(text, parseVehicle(text, dictionary), dictionary)).toBe(true)
  })
})

describe('ground truth keywords meet the stock they should', () => {
  it('stock-less keywords name a model with zero units', () => {
    for (const g of GROUND_TRUTH.filter((r) => r.kind === 'stockless_keyword')) {
      const p = parseVehicle(keywordText((g.target as { keywordKey: string }).keywordKey), dictionary)
      expect(STOCKLESS_VEHICLES.some((s) => s.make === p.make && s.model === p.model), g.id).toBe(true)
      expect(matchStock(p, stock, SNAPSHOT)?.stockCount, g.id).toBe(0)
    }
  })

  it('aging-stock keywords match units listed > 60 days on average', () => {
    for (const g of GROUND_TRUTH.filter((r) => r.kind === 'aging_stock')) {
      const key = (g.target as { keywordKeys: string[] }).keywordKeys[0]
      const m = matchStock(parseVehicle(keywordText(key), dictionary), stock, SNAPSHOT)!
      expect(m.stockCount, g.id).toBeGreaterThan(0)
      expect(m.avgDaysListed!, g.id).toBeGreaterThan(60)
    }
  })
})

describe('matchStock', () => {
  const v = (over: Partial<Vehicle>): Vehicle => ({
    id: 'x', make: 'Toyota', model: 'Avanza', year: 2020, mileageKm: 40_000, priceIdr: 180_000_000,
    acquisitionCostIdr: 168_000_000, status: 'available', listedOn: '2026-09-01', soldOn: null, ...over,
  })

  it('counts available units only, by make, model and year range', () => {
    const units = [
      v({ id: 'a' }),
      v({ id: 'b', year: 2017 }),
      v({ id: 'c', status: 'sold' }),
      v({ id: 'd', status: 'reserved' }),
      v({ id: 'e', model: 'Innova' }),
    ]
    expect(matchStock({ make: 'Toyota', model: 'Avanza', yearFrom: 2019, yearTo: 2021 }, units, '2026-09-30')).toMatchObject({
      stockCount: 1,
      vehicleIds: ['a'],
      avgDaysListed: 29,
      avgMarginIdr: 12_000_000,
    })
    expect(matchStock({ make: 'Toyota', model: null, yearFrom: null, yearTo: null }, units, '2026-09-30')!.stockCount).toBe(3)
  })

  it('returns null — not zero stock — for a keyword that names no vehicle', () => {
    expect(matchStock({ make: null, model: null, yearFrom: null, yearTo: null }, [v({})], '2026-09-30')).toBeNull()
  })

  it('leaves the margin null when no matched unit has a known cost', () => {
    const m = matchStock({ make: 'Toyota', model: 'Avanza', yearFrom: null, yearTo: null }, [v({ acquisitionCostIdr: null })], '2026-09-30')!
    expect(m.avgMarginIdr).toBeNull()
  })
})

describe('target CPA from margin', () => {
  it('matches the worked example: Rp 12,000,000 × 0.20 × 0.02 = Rp 48,000 per lead, basis prior', () => {
    expect(targetCpaMicros(12_000_000, 0.2, 0.02)).toEqual({ targetCpaMicros: 48_000_000_000, basis: 'prior' })
  })

  it('has no target without a margin', () => {
    expect(targetCpaMicros(null, 0.2, 0.02)).toBeNull()
    expect(targetCpaMicros(0, 0.2, 0.02)).toBeNull()
  })

  it('lands within a plausible range of the demo baseline CPA with the default settings', () => {
    const baselineCpaMicros = (BASELINE_CLICKS * BASELINE_CPC_MICROS) / BASELINE_CONVERSIONS
    const avgMargin = DEMO_STOCK.reduce((s, x) => s + x.priceIdr - x.acquisitionCostIdr, 0) / DEMO_STOCK.length
    const ratio = targetCpaMicros(avgMargin, 0.2, 0.02)!.targetCpaMicros / baselineCpaMicros
    expect(ratio).toBeGreaterThan(1)
    expect(ratio).toBeLessThan(6)
  })

  it('buckets days listed for the aging view', () => {
    expect([0, 30, 31, 60, 61, 90, 91].map(agingBucket)).toEqual(['0-30', '0-30', '31-60', '31-60', '61-90', '61-90', '90+'])
  })
})

describe('parseVehicleBatch and parseKeywords', () => {
  it('keeps valid answers, drops unknown ids, duplicates, bad names and impossible years', () => {
    const out = parseVehicleBatch(
      {
        results: [
          { id: 1, make: 'Chery', model: 'Omoda 5', year_from: null, year_to: null },
          { id: 2, make: null, model: null, year_from: null, year_to: null },
          { id: 3, make: 'Chery', model: 'x', year_from: 1850, year_to: null },
          { id: 4, make: '<script>', model: null, year_from: null, year_to: null },
          { id: 5, make: null, model: 'Omoda', year_from: null, year_to: null },
          { id: 9, make: 'Kia', model: 'Seltos', year_from: null, year_to: null },
        ],
      },
      [1, 2, 3, 4, 5]
    )
    expect([...out.keys()].sort()).toEqual([1, 2])
    expect(out.get(1)).toEqual({ make: 'Chery', model: 'Omoda 5', yearFrom: null, yearTo: null })
  })

  it('only sends keywords with unknown words to the model, and survives a failing batch', async () => {
    const sent: string[] = []
    const outcome = await parseKeywords(
      [
        { id: 10, text: '"avanza bekas"' },
        { id: 11, text: 'mobil bekas murah' },
        { id: 12, text: 'chery omoda bekas' },
      ],
      dictionary,
      async (batch) => {
        sent.push(...batch.map((b) => b.keyword))
        throw new Error('model unavailable')
      }
    )
    expect(sent).toEqual(['chery omoda bekas'])
    expect(outcome).toMatchObject({ byRule: 2, byModel: 0, unparsed: 1, failedBatches: 1 })
    expect(outcome.results.get(11)).toMatchObject({ make: null, method: 'rule' })
  })
})

describe('external inventory source — read-only and secret-safe', () => {
  it('accepts a plain SELECT or WITH query', () => {
    expect(() => assertReadOnlySql('SELECT id, make FROM stock WHERE sold = false')).not.toThrow()
    expect(() => assertReadOnlySql('WITH s AS (SELECT * FROM stock) SELECT * FROM s')).not.toThrow()
  })

  it('rejects anything that writes, changes schema, or chains statements', () => {
    for (const sql of [
      "INSERT INTO stock VALUES (1)",
      'UPDATE stock SET price = 0',
      'DELETE FROM stock',
      'DROP TABLE stock',
      'SELECT 1; DROP TABLE stock',
      'WITH d AS (DELETE FROM stock RETURNING *) SELECT * FROM d',
      'SELECT * FROM stock FOR UPDATE',
      'TRUNCATE stock',
    ]) {
      expect(() => assertReadOnlySql(sql), sql).toThrow(/rejected/)
    }
  })

  it('ignores forbidden words inside comments but still checks the query itself', () => {
    expect(() => assertReadOnlySql('SELECT id FROM stock -- never delete')).not.toThrow()
    expect(() => assertReadOnlySql('/* select */ DELETE FROM stock')).toThrow(/rejected/)
  })

  it('never lets a connection string out in an error', () => {
    const msg = sanitizeInventoryError(new Error('connect ECONNREFUSED postgresql://inv_ro:s3cretPw@10.0.0.5:5432/stock'))
    expect(msg).not.toContain('s3cretPw')
    expect(msg).not.toContain('10.0.0.5')
    expect(sanitizeInventoryError(new Error('x'.repeat(500))).length).toBeLessThanOrEqual(200)
  })

  it('turns driver and network failures into fixed messages: no username, table name or driver wording', () => {
    const withCode = (message: string, code: string) => Object.assign(new Error(message), { code })
    const cases: [Error, string][] = [
      [withCode('password authentication failed for user "inv_reader"', '28P01'), 'the inventory database rejected the login'],
      [new Error('password authentication failed for user "inv_reader"'), 'the inventory database rejected the login'],
      [withCode('getaddrinfo ENOTFOUND inventory.dealerhost.example', 'ENOTFOUND'), "the inventory database's host could not be resolved"],
      [withCode('connect ECONNREFUSED 10.1.2.3:5432', 'ECONNREFUSED'), 'could not reach the inventory database'],
      [new Error('timeout exceeded when trying to connect'), 'the inventory database timed out'],
      [withCode('canceling statement due to statement timeout', '57014'), 'the inventory database timed out'],
      [withCode('relation "stock_units" does not exist', '42P01'), 'an inventory query failed — check the column mapping'],
      [withCode('database "stock" does not exist', '3D000'), 'the inventory database was not found'],
      [new Error('something odd from the driver about inv_reader'), 'the inventory database returned an error'],
    ]
    for (const [err, expected] of cases) {
      const msg = sanitizeInventoryError(err)
      expect(msg, err.message).toBe(expected)
      expect(msg).not.toMatch(/inv_reader|stock_units|dealerhost|10\.1\.2\.3/)
    }
  })

  it('passes its own messages through (redacted): mapping pending and rejected queries', () => {
    expect(sanitizeInventoryError(new Error('inventory query rejected: one statement only'))).toBe('inventory query rejected: one statement only')
  })

  it('reports unavailable — without connecting or throwing — until the column mapping exists', async () => {
    const snap = await loadInventorySnapshot(new ExternalInventorySource('postgresql://u:p@127.0.0.1:1/none', null))
    expect(snap).toMatchObject({ source: 'unavailable', snapshotOn: null, vehicles: [], events: [] })
    expect(snap.error).toMatch(/mapping/)
    expect(snap.error).not.toContain('u:p@')
  })

  it('reports an empty source as unavailable, never as "no stock of anything"', async () => {
    const empty = { kind: 'demo' as const, listVehicles: async () => [], listEvents: async () => [], snapshotDate: async () => SNAPSHOT }
    const snap = await loadInventorySnapshot(empty)
    expect(snap).toMatchObject({ source: 'unavailable', snapshotOn: null, error: 'the inventory source returned no vehicles' })
  })
})
