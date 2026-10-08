// Contract 3.6 — ad copy (docs/overhaul-v3-backend.md section 11.9): the
// template within the limits for every model in the demo stock and for long
// names (shortened, never a cut word), each claim gated by its setting, the
// number validator (rounding allowed, spelled-out numbers read), the claim
// and superlative lexicon, and the format rules.

import { describe, it, expect } from 'vitest'
import { checkAd, passes, pathSlug, spelledNumbers, templateCopy, wholeJuta, type AdCopy, type CopyContext } from './adCopy.js'
import { buildFacts, claimsUsed, copyContext, type AdSettings } from './ads.js'
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
const CTX: CopyContext = copyContext(SETTINGS)

let id = 1
const car = (make: string, model: string, priceIdr: number, year = 2022, mileageKm: number | null = 40_000): Vehicle => ({
  id: String(id++),
  make,
  model,
  year,
  mileageKm,
  priceIdr,
  acquisitionCostIdr: priceIdr - 12_000_000,
  status: 'available',
  listedOn: '2026-09-01',
  soldOn: null,
})

const innova = (over: Partial<AdSettings> = {}): AdFacts =>
  buildFacts([car('Toyota', 'Innova', 279_500_000, 2022), car('Toyota', 'Innova', 300_000_000, 2023, 35_000)], 'Toyota', 'Innova', { ...SETTINGS, ...over }, '2026-10-06')!

const copy = (headlines: string[], descriptions: string[] = ['Toyota Innova bekas tahun 2022-2023.', 'Harga mulai Rp 279 juta.']): AdCopy => ({
  headlines,
  descriptions,
  path1: 'toyota',
  path2: 'innova',
})
const OK_HEADLINES = ['Toyota Innova Bekas', 'Mulai Rp 279 Juta', 'Tersedia 2 Unit']
const check = (c: AdCopy, f = innova(), ctx = CTX) => checkAd(c, f, ctx)

describe('facts and formatting', () => {
  it('takes units, year range, price range and the lowest mileage from the available units, and only the allowed claims', () => {
    const f = innova({ claims: { installments: true, trade_in: false, test_drive: true, inspection: false } })
    expect(f).toEqual({
      make: 'Toyota',
      model: 'Innova',
      units: 2,
      year_from: 2022,
      year_to: 2023,
      price_from_idr: 279_500_000,
      price_to_idr: 300_000_000,
      mileage_from_km: 35_000,
      dealer: 'Pitstop Used Cars',
      city: 'Tangerang',
      area: 'Gading Serpong',
      whatsapp: '0812-5550-0123',
      claims_used: ['installments', 'test_drive'],
      snapshot_on: '2026-10-06',
    })
    expect(claimsUsed(SETTINGS)).toEqual(['installments', 'trade_in', 'test_drive', 'inspection'])
  })

  it('rounds a price down to whole juta', () => {
    expect(wholeJuta(279_500_000)).toBe(279)
    expect(wholeJuta(87_999_999)).toBe(87)
  })

  it('slugs a display path to 15 characters without cutting a word', () => {
    expect(pathSlug('Karimun Wagon R')).toBe('karimun-wagon-r')
    expect(pathSlug('BR-V')).toBe('br-v')
    expect(pathSlug('Mercedes-Benz C-Class')).toBe('mercedes-benz-c')
    expect(pathSlug('Supercalifragilistic')).toBeNull()
    expect(pathSlug(null)).toBeNull()
  })
})

describe('templateCopy', () => {
  it('builds copy inside the limits that passes every check, for every model in the demo stock', () => {
    const models = new Map<string, Vehicle[]>()
    for (const v of DEMO_STOCK.filter((d) => d.status === 'available')) {
      const k = `${v.make}|${v.model}`
      models.set(k, [...(models.get(k) ?? []), car(v.make, v.model, v.priceIdr, v.year, v.mileageKm)])
    }
    expect(models.size).toBeGreaterThan(20)
    for (const [k, units] of models) {
      const f = buildFacts(units, units[0].make, units[0].model, SETTINGS, '2026-10-06')!
      const c = templateCopy(f, CTX, [`${units[0].model.toLowerCase()} bekas tangerang`])
      const r = checkAd(c, f, CTX)
      expect(passes(r), `${k}: ${JSON.stringify(r.problems)}`).toBe(true)
      expect(c.headlines.length, k).toBeGreaterThanOrEqual(3)
      expect(c.descriptions.length, k).toBeGreaterThanOrEqual(2)
    }
  })

  it('follows the section 11.9 lines', () => {
    const c = templateCopy(innova(), CTX, ['innova reborn tangerang'])
    expect(c.headlines).toEqual([
      'Toyota Innova Bekas',
      'Innova Reborn Tangerang',
      'Innova 2022-2023',
      'Mulai Rp 279 Juta',
      'Tersedia 2 Unit',
      'Dijual di Gading Serpong',
      'Pitstop Used Cars',
      'Cicilan & DP Ringan',
      'Terima Tukar Tambah',
      'Bisa Test Drive',
      'Unit sudah melalui pemeriksaan',
    ])
    expect(c.descriptions).toEqual([
      'Toyota Innova bekas tahun 2022-2023 di Gading Serpong, Tangerang.',
      'Harga mulai Rp 279 juta, tersedia 2 unit di Pitstop Used Cars.',
      'Bisa cicilan, tukar tambah dan test drive. Hubungi WA 0812-5550-0123.',
      'Unit sudah melalui pemeriksaan. Kunjungi Pitstop Used Cars.',
    ])
    expect([c.path1, c.path2]).toEqual(['toyota', 'innova'])
  })

  it('leaves out the year line when the years are the same, and a winner that only repeats the first headline', () => {
    const one = buildFacts([car('Honda', 'Jazz', 171_000_000, 2021)], 'Honda', 'Jazz', SETTINGS, '2026-10-06')!
    const c = templateCopy(one, CTX, ['jazz bekas'])
    expect(c.headlines.join('|')).not.toMatch(/Jazz 2021|Jazz Bekas\|Jazz Bekas/)
    expect(c.headlines.filter((h) => h.toLowerCase() === 'jazz bekas')).toHaveLength(0)
  })

  it('shortens long names by dropping optional parts, never cutting a word', () => {
    const long = buildFacts([car('Mercedes-Benz', 'GLC 300 Coupe AMG Line', 1_150_000_000, 2020), car('Mercedes-Benz', 'GLC 300 Coupe AMG Line', 1_250_000_000, 2021)], 'Mercedes-Benz', 'GLC 300 Coupe AMG Line', { ...SETTINGS, dealerArea: 'Bumi Serpong Damai Sektor Tujuh Belas', dealerCity: 'Tangerang Selatan Raya' }, '2026-10-06')!
    const c = templateCopy(long, copyContext(SETTINGS))
    expect(c.headlines[0]).toBe('GLC 300 Coupe AMG Line Bekas') // make dropped: "Mercedes-Benz GLC 300 Coupe AMG Line Bekas" is over 30
    for (const line of [...c.headlines, ...c.descriptions]) {
      const words = line.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean)
      for (const w of words) expect([long.make, long.model, long.dealer, long.area, long.city, 'Bekas', 'bekas', 'Rp', 'juta', 'Juta'].join(' ') + ' ' + line).toContain(w)
    }
    expect(c.descriptions[0]).toBe('Mercedes-Benz GLC 300 Coupe AMG Line bekas tahun 2020-2021.') // the place doesn't fit: dropped whole
    expect(passes(checkAd(c, long, CTX))).toBe(true)
  })

  it('leaves out every line for a claim that is switched off, and a missing area or WhatsApp', () => {
    const s = { ...SETTINGS, claims: { installments: false, trade_in: false, test_drive: true, inspection: false }, dealerArea: null, dealerWhatsapp: null }
    const f = buildFacts([car('Toyota', 'Innova', 279_000_000)], 'Toyota', 'Innova', s, '2026-10-06')!
    const c = templateCopy(f, copyContext(s))
    const all = [...c.headlines, ...c.descriptions].join(' | ').toLowerCase()
    for (const word of ['kredit', 'cicilan', 'dp', 'tukar tambah', 'pemeriksaan', 'wa ', 'gading serpong']) expect(all, word).not.toContain(word)
    expect(all).toContain('test drive')
    expect(passes(checkAd(c, f, copyContext(s)))).toBe(true)
  })
})

describe('limits and format', () => {
  it('passes a valid ad', () => {
    expect(check(copy(OK_HEADLINES)).flags).toEqual({ limits_ok: true, numbers_from_facts: true, claims_allowed: true })
  })

  it('needs 3-15 headlines of at most 30, 2-4 descriptions of at most 90, paths of at most 15, none empty or repeated', () => {
    expect(check(copy(OK_HEADLINES.slice(0, 2))).flags.limits_ok).toBe(false)
    expect(check(copy(OK_HEADLINES, ['Harga mulai Rp 279 juta.'])).flags.limits_ok).toBe(false)
    expect(check(copy([...OK_HEADLINES, 'Toyota Innova Bekas Gading Serpong'])).problems.limits.join()).toContain('max 30')
    expect(check(copy(OK_HEADLINES, ['x'.repeat(91), 'Harga mulai Rp 279 juta.'])).problems.limits.join()).toContain('max 90')
    expect(check({ ...copy(OK_HEADLINES), path1: 'toyota-innova-bekas' }).problems.limits.join()).toContain('max 15')
    expect(check(copy([...OK_HEADLINES, ' '])).problems.limits.join()).toContain('empty')
    expect(check(copy([...OK_HEADLINES, 'toyota innova bekas'])).problems.limits.join()).toContain('repeats')
  })

  it('rejects an all-caps word over 3 letters, but not a 3-letter one or a name the facts spell in capitals', () => {
    expect(check(copy([...OK_HEADLINES, 'INNOVA Siap Pakai'])).problems.limits.join()).toContain('all-caps word "INNOVA"')
    expect(check(copy([...OK_HEADLINES, 'Cocok Untuk MPV Keluarga'])).flags.limits_ok).toBe(true)
    const brv = buildFacts([car('Honda', 'BR-V', 227_000_000)], 'Honda', 'BR-V', SETTINGS, '2026-10-06')!
    expect(checkAd(copy(['Honda BR-V Bekas', 'Mulai Rp 227 Juta', 'Tersedia 1 Unit'], ['Honda BR-V bekas tahun 2022.', 'Harga mulai Rp 227 juta.']), brv, CTX).flags.limits_ok).toBe(true)
  })

  it('rejects "!" in a headline (not in a description) and repeated punctuation anywhere', () => {
    expect(check(copy([...OK_HEADLINES, 'Cek Unitnya!'])).flags.limits_ok).toBe(false)
    expect(check(copy(OK_HEADLINES, ['Cek unitnya di showroom kami!', 'Harga mulai Rp 279 juta.'])).flags.limits_ok).toBe(true)
    for (const d of ['Cek unitnya sekarang!!', 'Harga mulai Rp 279 juta...', 'Toyota Innova -- siap pakai.']) {
      expect(check(copy(OK_HEADLINES, [d, 'Harga mulai Rp 279 juta.'])).problems.limits.join(), d).toContain('repeated punctuation')
    }
  })
})

describe('numbers_from_facts', () => {
  it('rejects a price, a unit count or a year that is not in the facts', () => {
    const r = check(copy([...OK_HEADLINES, 'Mulai Rp 250 Juta']))
    expect(r.flags.numbers_from_facts).toBe(false)
    expect(r.problems.numbers[0]).toContain('"250 Juta"')
    expect(check(copy([...OK_HEADLINES, 'Tersedia 5 Unit'])).flags.numbers_from_facts).toBe(false)
    expect(check(copy([...OK_HEADLINES, 'Innova 2019'])).flags.numbers_from_facts).toBe(false)
  })

  it('allows rounding: whole or tenth juta within a juta of a price, and the exact rupiah figure', () => {
    for (const h of ['Mulai Rp 279 Juta', 'Mulai Rp 279,5 Juta', 'Mulai Rp 280 Juta', 'Sampai Rp 300 Juta']) expect(check(copy([...OK_HEADLINES.slice(0, 1), 'Tersedia 2 Unit', h])).flags.numbers_from_facts, h).toBe(true)
    expect(check(copy(OK_HEADLINES, ['Harga mulai Rp 279.500.000.', 'Toyota Innova bekas tahun 2022.'])).flags.numbers_from_facts).toBe(true)
    expect(check(copy([...OK_HEADLINES, 'Mulai Rp 278 Juta'])).flags.numbers_from_facts).toBe(false)
  })

  it('accepts the other facts: years, the lowest mileage, the WhatsApp number, digits in a model name', () => {
    expect(check(copy([...OK_HEADLINES, 'Innova 2022-2023', 'Mulai 35.000 km', 'WA 0812-5550-0123'])).flags.numbers_from_facts).toBe(true)
    const xl7 = buildFacts([car('Suzuki', 'XL7', 204_500_000)], 'Suzuki', 'XL7', SETTINGS, '2026-10-06')!
    expect(checkAd(copy(['Suzuki XL7 Bekas', 'Mulai Rp 204 Juta', 'Tersedia 1 Unit'], ['Suzuki XL7 bekas tahun 2022.', 'Harga mulai Rp 204 juta.']), xl7, CTX).flags.numbers_from_facts).toBe(true)
  })

  it('reads spelled-out numbers and checks them like digits', () => {
    expect(spelledNumbers('dua ratus tujuh puluh sembilan juta')).toEqual([279_000_000])
    expect(spelledNumbers('tersedia dua unit, dua belas pilihan, seratus ribu')).toEqual([2, 12, 100_000])
    expect(spelledNumbers('harga mulai 279 juta')).toEqual([])
    expect(check(copy([...OK_HEADLINES, 'Tersedia Dua Unit'])).flags.numbers_from_facts).toBe(true)
    expect(check(copy([...OK_HEADLINES, 'Tersedia Lima Unit'])).problems.numbers.join()).toContain('spelled-out number 5')
  })
})

describe('claims_allowed', () => {
  const off = innova({ claims: { installments: false, trade_in: false, test_drive: false, inspection: false } })

  it('gates each claim by its setting', () => {
    const cases: [string, keyof AdSettings['claims']][] = [
      ['Bisa Kredit', 'installments'],
      ['Cicilan Ringan', 'installments'],
      ['DP Ringan', 'installments'],
      ['Via Leasing', 'installments'],
      ['Terima Tukar Tambah', 'trade_in'],
      ['Bisa Trade-In', 'trade_in'],
      ['Bisa Test Drive', 'test_drive'],
    ]
    for (const [h, claim] of cases) {
      expect(check(copy([...OK_HEADLINES, h]), off).problems.claims.join(), h).toContain('is not allowed')
      const only = innova({ claims: { installments: false, trade_in: false, test_drive: false, inspection: false, [claim]: true } })
      expect(check(copy([...OK_HEADLINES, h]), only).flags.claims_allowed, h).toBe(true)
    }
  })

  it('takes inspection words (garansi, diperiksa, inspeksi) only in the exact wording from settings', () => {
    expect(check(copy([...OK_HEADLINES, 'Unit sudah melalui pemeriksaan'])).flags.claims_allowed).toBe(true)
    for (const h of ['Unit Sudah Diperiksa', 'Lulus Inspeksi', 'Garansi Mesin']) {
      expect(check(copy([...OK_HEADLINES, h])).problems.claims.join(), h).toContain('must use the wording')
      expect(check(copy([...OK_HEADLINES, h]), off).problems.claims.join(), h).toContain('is not allowed')
    }
    const garansi = { ...SETTINGS, inspectionWording: 'Garansi mesin 1 tahun' }
    const f = buildFacts([car('Toyota', 'Innova', 279_000_000)], 'Toyota', 'Innova', garansi, '2026-10-06')!
    expect(checkAd(copy(['Toyota Innova Bekas', 'Mulai Rp 279 Juta', 'Garansi Mesin 1 Tahun'], ['Garansi mesin 1 tahun.', 'Tersedia 1 unit.']), f, copyContext(garansi)).flags).toMatchObject({ claims_allowed: true, numbers_from_facts: true })
  })

  it('bans superlatives and unverifiable claims', () => {
    for (const h of ['Harga Termurah', 'Dealer Terbaik', 'Paling Lengkap', 'No. 1 Di Tangerang', '#1 Dealer', 'Kualitas Dijamin', 'Gratis Servis', 'Cashback Akhir Bulan', 'Diskon Spesial']) {
      expect(check(copy([...OK_HEADLINES, h])).flags.claims_allowed, h).toBe(false)
    }
  })
})
