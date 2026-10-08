// Contract 3.6 — ad copy (src/optimizer/adCopy.ts): the template stays
// inside Google's limits and its own checks, and each check catches what
// it is for (docs/overhaul-v3-backend.md section 11.9).

import { describe, it, expect } from 'vitest'
import { checkAd, formatJuta, passes, pathSlug, templateCopy, type AdCopy } from './adCopy.js'
import { buildFacts, type AdSettings } from './ads.js'
import { DEMO_STOCK } from '../data/demo/inventory.js'
import type { AdFacts } from './types.js'
import type { Vehicle } from './inventory/types.js'

const SETTINGS: AdSettings = {
  dealerName: 'Pitstop Used Cars',
  dealerCity: 'Tangerang',
  dealerArea: 'Gading Serpong',
  dealerWhatsapp: '0812-5550-0123',
  landingUrl: null,
  claims: { installments: true, trade_in: true, test_drive: true, inspection: true },
  inspectionWording: 'Unit sudah melalui pemeriksaan',
}

let id = 1
const car = (make: string, model: string, priceIdr: number, year = 2022): Vehicle => ({
  id: String(id++),
  make,
  model,
  year,
  mileageKm: 40_000,
  priceIdr,
  acquisitionCostIdr: priceIdr - 12_000_000,
  status: 'available',
  listedOn: '2026-09-01',
  soldOn: null,
})

const innova = (over: Partial<AdSettings> = {}): AdFacts =>
  buildFacts([car('Toyota', 'Innova', 279_000_000, 2022), car('Toyota', 'Innova', 300_000_000, 2023)], 'Toyota', 'Innova', { ...SETTINGS, ...over }, '2026-10-06')!

const copy = (headlines: string[], descriptions: string[] = ['Toyota Innova bekas tahun 2022-2023.', 'Harga mulai Rp 279 juta.']): AdCopy => ({
  headlines,
  descriptions,
  path1: 'innova',
  path2: 'bekas',
})
const OK_HEADLINES = ['Toyota Innova Bekas', 'Mulai Rp 279 Juta', '2 Unit Tersedia']

describe('formatting', () => {
  it('shows a price in juta rounded up to 0.1, with a decimal comma', () => {
    expect(formatJuta(279_000_000)).toBe('279')
    expect(formatJuta(87_500_000)).toBe('87,5')
    expect(formatJuta(152_040_000)).toBe('152,1')
  })

  it('slugs a display path to 15 characters', () => {
    expect(pathSlug('Karimun Wagon R')).toBe('karimun-wagon-r')
    expect(pathSlug('BR-V')).toBe('br-v')
    expect(pathSlug('Mercedes-Benz C-Class')!.length).toBeLessThanOrEqual(15)
  })
})

describe('templateCopy', () => {
  it('builds copy inside the limits that passes all three checks, for every model in the demo stock', () => {
    const models = new Map<string, Vehicle[]>()
    for (const v of DEMO_STOCK.filter((d) => d.status === 'available')) {
      const k = `${v.make}|${v.model}`
      models.set(k, [...(models.get(k) ?? []), car(v.make, v.model, v.priceIdr, v.year)])
    }
    expect(models.size).toBeGreaterThan(20)
    for (const [k, units] of models) {
      const f = buildFacts(units, units[0].make, units[0].model, SETTINGS, '2026-10-06')!
      const c = templateCopy(f, [`${units[0].model.toLowerCase()} bekas tangerang`])
      const checks = checkAd(c, f)
      expect(passes(checks), `${k}: ${JSON.stringify(checks)}`).toBe(true)
      expect(c.headlines.length, k).toBeGreaterThanOrEqual(3)
      expect(c.descriptions.length, k).toBeGreaterThanOrEqual(2)
    }
  })

  it('passes for a make-level ad group too (several models)', () => {
    const units = [car('Suzuki', 'Ertiga', 153_500_000), car('Suzuki', 'XL7', 204_500_000), car('Suzuki', 'APV', 111_500_000)]
    const f = buildFacts(units, 'Suzuki', null, SETTINGS, '2026-10-06')!
    const c = templateCopy(f)
    expect(passes(checkAd(c, f))).toBe(true)
    expect(c.headlines[0]).toBe('Suzuki Bekas')
    expect(c.descriptions[0]).toContain('APV, Ertiga, XL7')
  })

  it('leads with a winner keyword, but not one that repeats the first headline', () => {
    const f = innova()
    expect(templateCopy(f, ['innova bekas tangerang']).headlines[1]).toBe('Innova Bekas Tangerang')
    expect(templateCopy(f, ['innova bekas']).headlines).not.toContain('Innova Bekas')
  })

  it('leaves out every line for a claim that is switched off, and a missing area or WhatsApp', () => {
    const f = innova({ claims: { installments: false, trade_in: false, test_drive: true, inspection: false }, dealerArea: null, dealerWhatsapp: null })
    const c = templateCopy(f)
    const all = [...c.headlines, ...c.descriptions].join(' | ').toLowerCase()
    for (const word of ['kredit', 'cicilan', 'tukar tambah', 'pemeriksaan', 'whatsapp', 'wa ', 'gading serpong']) expect(all, word).not.toContain(word)
    expect(all).toContain('test drive')
    expect(passes(checkAd(c, f))).toBe(true)
  })
})

describe('checkAd — limits', () => {
  const f = innova()
  it('passes a valid ad', () => {
    expect(passes(checkAd(copy(OK_HEADLINES), f))).toBe(true)
  })

  it('needs 3-15 headlines and 2-4 descriptions', () => {
    expect(checkAd(copy(OK_HEADLINES.slice(0, 2)), f).limits.ok).toBe(false)
    expect(checkAd(copy(OK_HEADLINES, ['Harga mulai Rp 279 juta.']), f).limits.ok).toBe(false)
    expect(checkAd(copy(OK_HEADLINES, Array.from({ length: 5 }, (_, i) => `Toyota Innova bekas ${2022 + (i % 2)} nomor urut ${['a', 'b', 'c', 'd', 'e'][i]}.`)), f).limits.ok).toBe(false)
  })

  it('rejects a headline over 30, a description over 90, a path over 15, an empty or repeated line', () => {
    expect(checkAd(copy([...OK_HEADLINES, 'Toyota Innova Bekas Gading Serpong']), f).limits.problems.join()).toContain('max 30')
    expect(checkAd(copy(OK_HEADLINES, ['x'.repeat(91), 'Harga mulai Rp 279 juta.']), f).limits.problems.join()).toContain('max 90')
    expect(checkAd({ ...copy(OK_HEADLINES), path1: 'toyota-innova-bekas' }, f).limits.problems.join()).toContain('max 15')
    expect(checkAd(copy([...OK_HEADLINES, ' ']), f).limits.problems.join()).toContain('empty')
    expect(checkAd(copy([...OK_HEADLINES, 'toyota innova bekas']), f).limits.problems.join()).toContain('repeats')
  })
})

describe('checkAd — facts', () => {
  const f = innova()
  it('rejects a number that is not in the facts', () => {
    const r = checkAd(copy([...OK_HEADLINES, 'Mulai Rp 250 Juta']), f).facts
    expect(r.ok).toBe(false)
    expect(r.problems[0]).toContain('"250 Juta"')
    expect(checkAd(copy([...OK_HEADLINES, '5 Unit Tersedia']), f).facts.ok).toBe(false)
    expect(checkAd(copy([...OK_HEADLINES, 'Tahun 2019']), f).facts.ok).toBe(false)
  })

  it('accepts the facts: units, years, prices in juta or rupiah, the WhatsApp number, digits in a model name', () => {
    expect(checkAd(copy([...OK_HEADLINES, 'Tahun 2022-2023', 'Sampai Rp 300 Juta', 'WA 0812-5550-0123']), f).facts.ok).toBe(true)
    expect(checkAd(copy(OK_HEADLINES, ['Harga mulai Rp 279.000.000.', 'Toyota Innova bekas tahun 2022.']), f).facts.ok).toBe(true)
    const xl7 = buildFacts([car('Suzuki', 'XL7', 204_500_000)], 'Suzuki', 'XL7', SETTINGS, '2026-10-06')!
    expect(checkAd(copy(['Suzuki XL7 Bekas', 'Mulai Rp 204,5 Juta', '1 Unit Tersedia'], ['Suzuki XL7 bekas tahun 2022.', 'Harga mulai Rp 204,5 juta.']), xl7).facts.ok).toBe(true)
  })

  it('rejects a claim that is switched off', () => {
    const off = innova({ claims: { installments: false, trade_in: false, test_drive: false, inspection: false } })
    for (const h of ['Bisa Kredit', 'DP Ringan', 'Bisa Tukar Tambah', 'Bisa Test Drive', 'Unit Sudah Diperiksa']) {
      expect(checkAd(copy([...OK_HEADLINES, h]), off).facts.ok, h).toBe(false)
      expect(checkAd(copy([...OK_HEADLINES, h]), f).facts.ok || h === 'Unit Sudah Diperiksa', h).toBe(true)
    }
  })

  it('takes the inspection claim only in the settings’ own words', () => {
    expect(checkAd(copy(OK_HEADLINES, ['Unit sudah melalui pemeriksaan.', 'Harga mulai Rp 279 juta.']), f).facts.ok).toBe(true)
    const r = checkAd(copy(OK_HEADLINES, ['Lulus inspeksi 150 titik.', 'Harga mulai Rp 279 juta.']), f).facts
    expect(r.ok).toBe(false)
    expect(r.problems.join()).toContain('must use the wording')
  })

  it('never allows a promise no setting covers', () => {
    for (const h of ['Garansi Mesin', 'Gratis Servis', 'Cashback Akhir Bulan', 'Diskon Spesial', 'Bebas Banjir']) {
      expect(checkAd(copy([...OK_HEADLINES, h]), f).facts.problems.join(), h).toContain('no setting allows')
    }
  })
})

describe('checkAd — style', () => {
  const f = innova()
  it('rejects superlatives', () => {
    for (const h of ['Harga Termurah', 'Dealer Terbaik', 'Paling Lengkap', 'No. 1 Di Tangerang', '#1 Dealer']) {
      expect(checkAd(copy([...OK_HEADLINES, h]), f).style.ok, h).toBe(false)
    }
  })

  it('rejects an all-caps word, but not a model or make the facts spell in capitals, or a standard abbreviation', () => {
    expect(checkAd(copy([...OK_HEADLINES, 'INNOVA MURAH']), f).style.problems.join()).toContain('all-caps word "INNOVA"')
    const brv = buildFacts([car('Honda', 'BR-V', 227_000_000)], 'Honda', 'BR-V', SETTINGS, '2026-10-06')!
    expect(checkAd(copy(['Honda BR-V Bekas', 'Mulai Rp 227 Juta', 'Bisa DP Ringan']), brv).style.ok).toBe(true)
  })

  it('rejects "!" in a headline, not in a description', () => {
    expect(checkAd(copy([...OK_HEADLINES, 'Cek Unitnya!']), f).style.ok).toBe(false)
    expect(checkAd(copy(OK_HEADLINES, ['Cek unitnya di showroom kami!', 'Harga mulai Rp 279 juta.']), f).style.ok).toBe(true)
  })
})
