// Keyword text → make / model / year (docs/overhaul-v3-backend.md section
// 10, "Keyword ↔ vehicle matching"). Rules against a dictionary of
// Indonesian-market makes and models (plus whatever the inventory holds);
// the model only sees keywords with words the rules don't know. Pure — the
// cache and the model call live in vehicleParseJob.ts.

import { normalizeTerm } from './intent.js'

export const PARSER_VERSION = 1

export interface VehicleParse {
  make: string | null // null = the keyword names no vehicle ("mobil bekas murah")
  model: string | null // null with a make = make-level keyword ("used toyota jakarta")
  yearFrom: number | null
  yearTo: number | null
}

interface ModelEntry {
  make: string
  model: string
  aliases: string[] // normalized (normalizeTerm) forms
  // Aliases that are ordinary words elsewhere ("city", "rocky") only count
  // when the make is in the keyword too.
  requiresMake?: boolean
}

const MAKE_ALIASES: Record<string, string> = {
  toyota: 'Toyota',
  honda: 'Honda',
  suzuki: 'Suzuki',
  daihatsu: 'Daihatsu',
  mitsubishi: 'Mitsubishi',
  wuling: 'Wuling',
  bmw: 'BMW',
  mercedes: 'Mercedes-Benz',
  'mercedes benz': 'Mercedes-Benz',
  benz: 'Mercedes-Benz',
  mercy: 'Mercedes-Benz',
  mazda: 'Mazda',
  hyundai: 'Hyundai',
  kia: 'Kia',
  nissan: 'Nissan',
  datsun: 'Datsun',
}

// STARTING DEFAULT — common Indonesian used-car models; the inventory adds
// its own on top (buildDictionary).
const STATIC_MODELS: ModelEntry[] = [
  { make: 'Toyota', model: 'Avanza', aliases: ['avanza'] },
  { make: 'Toyota', model: 'Innova', aliases: ['innova', 'kijang innova'] },
  { make: 'Toyota', model: 'Rush', aliases: ['rush'], requiresMake: true },
  { make: 'Toyota', model: 'Fortuner', aliases: ['fortuner'] },
  { make: 'Toyota', model: 'Yaris', aliases: ['yaris'] },
  { make: 'Toyota', model: 'Agya', aliases: ['agya'] },
  { make: 'Toyota', model: 'Calya', aliases: ['calya'] },
  { make: 'Toyota', model: 'Raize', aliases: ['raize'] },
  { make: 'Toyota', model: 'Veloz', aliases: ['veloz'] },
  { make: 'Toyota', model: 'Sienta', aliases: ['sienta'] },
  { make: 'Honda', model: 'Brio', aliases: ['brio'] },
  { make: 'Honda', model: 'Jazz', aliases: ['jazz'] },
  { make: 'Honda', model: 'HR-V', aliases: ['hr v', 'hrv'] },
  { make: 'Honda', model: 'CR-V', aliases: ['cr v', 'crv'] },
  { make: 'Honda', model: 'BR-V', aliases: ['br v', 'brv'] },
  { make: 'Honda', model: 'Mobilio', aliases: ['mobilio'] },
  { make: 'Honda', model: 'Civic', aliases: ['civic'] },
  { make: 'Honda', model: 'City', aliases: ['city'], requiresMake: true },
  { make: 'Suzuki', model: 'Ertiga', aliases: ['ertiga'] },
  { make: 'Suzuki', model: 'XL7', aliases: ['xl7', 'xl 7'] },
  { make: 'Suzuki', model: 'Ignis', aliases: ['ignis'] },
  { make: 'Suzuki', model: 'Baleno', aliases: ['baleno'] },
  { make: 'Suzuki', model: 'Swift', aliases: ['swift'] },
  { make: 'Suzuki', model: 'APV', aliases: ['apv'] },
  { make: 'Suzuki', model: 'Karimun Wagon R', aliases: ['karimun wagon r', 'wagon r', 'karimun'] },
  { make: 'Daihatsu', model: 'Xenia', aliases: ['xenia'] },
  { make: 'Daihatsu', model: 'Terios', aliases: ['terios'] },
  { make: 'Daihatsu', model: 'Sigra', aliases: ['sigra'] },
  { make: 'Daihatsu', model: 'Ayla', aliases: ['ayla'] },
  { make: 'Daihatsu', model: 'Rocky', aliases: ['rocky'], requiresMake: true },
  { make: 'Daihatsu', model: 'Gran Max', aliases: ['gran max', 'granmax'] },
  { make: 'Daihatsu', model: 'Luxio', aliases: ['luxio'] },
  { make: 'Mitsubishi', model: 'Xpander', aliases: ['xpander'] },
  { make: 'Mitsubishi', model: 'Pajero Sport', aliases: ['pajero sport', 'pajero'] },
  { make: 'Wuling', model: 'Almaz', aliases: ['almaz'] },
  { make: 'Wuling', model: 'Confero', aliases: ['confero'] },
  { make: 'BMW', model: '320i', aliases: ['320i'] },
  { make: 'BMW', model: 'X1', aliases: ['x1'], requiresMake: true },
  { make: 'Mercedes-Benz', model: 'C200', aliases: ['c200', 'c 200'] },
  { make: 'Mazda', model: '2', aliases: ['mazda 2', 'mazda2'] },
  { make: 'Mazda', model: 'CX-5', aliases: ['cx 5', 'cx5'] },
  { make: 'Hyundai', model: 'Creta', aliases: ['creta'] },
  { make: 'Hyundai', model: 'Stargazer', aliases: ['stargazer'] },
  { make: 'Kia', model: 'Sonet', aliases: ['sonet'] },
  { make: 'Kia', model: 'Seltos', aliases: ['seltos'] },
  { make: 'Nissan', model: 'Livina', aliases: ['livina', 'grand livina'] },
]

// Words that say nothing about which vehicle. A keyword with no vehicle
// match whose every word is in here is a generic keyword, settled by the
// rules; anything else might name a model the dictionary lacks and goes to
// the model. STARTING DEFAULT, grows with real keywords.
export const GENERIC_WORDS = new Set([
  'mobil', 'bekas', 'second', 'seken', 'murah', 'jual', 'dijual', 'beli', 'harga', 'kredit', 'cicilan', 'dp',
  'showroom', 'dealer', 'dealership', 'name', 'location', 'near', 'me', 'nearby', 'terdekat', 'used', 'car', 'cars',
  'for', 'sale', 'buy', 'cheap', 'suv', 'suvs', 'keluarga', 'seater', 'jakarta', 'bekasi', 'tangerang', 'depok',
  'bogor', 'selatan', 'timur', 'utara', 'barat', 'pusat', 'jabodetabek', 'indonesia', 'id', 'matic', 'manual',
  'diesel', 'bensin', 'km', 'rendah', 'tangan', 'pertama', 'pajak', 'panjang', 'hidup', 'baru', 'type', 'tipe', 'meriah',
])

export interface Dictionary {
  models: ModelEntry[]
}

/** The static dictionary plus every make/model the inventory holds, so a
 * model the static list lacks still matches once it's in stock. */
export function buildDictionary(inventory: readonly { make: string; model: string }[] = []): Dictionary {
  const models = [...STATIC_MODELS]
  const known = new Set(models.map((m) => `${m.make}|${m.model}`.toLowerCase()))
  for (const v of inventory) {
    const key = `${v.make}|${v.model}`.toLowerCase()
    if (known.has(key)) continue
    known.add(key)
    const alias = normalizeTerm(v.model)
    // A bare number or a 1-2 letter alias would match far too much on its
    // own; require the make for those.
    models.push({ make: v.make, model: v.model, aliases: [alias], requiresMake: alias.length < 3 || !/\p{L}/u.test(alias) })
  }
  return { models }
}

const has = (normalized: string, phrase: string) => ` ${normalized} `.includes(` ${phrase} `)

/** Rule parse of a keyword. Always returns a result: make null means "no
 * vehicle named", which is a real answer for generic keywords. */
export function parseVehicle(keywordText: string, dictionary: Dictionary = buildDictionary()): VehicleParse {
  const t = normalizeTerm(keywordText)
  const makeAlias = Object.keys(MAKE_ALIASES)
    .sort((a, b) => b.length - a.length)
    .find((a) => has(t, a))
  const make = makeAlias ? MAKE_ALIASES[makeAlias] : null

  // Longest alias first, so "pajero sport" beats "pajero" and "karimun
  // wagon r" beats "karimun".
  const candidates = dictionary.models
    .flatMap((m) => m.aliases.map((alias) => ({ m, alias })))
    .sort((a, b) => b.alias.length - a.alias.length)
  const hit = candidates.find(({ m, alias }) => has(t, alias) && (!m.requiresMake || make === m.make))

  const years = (t.match(/\b(19[89]\d|20[0-4]\d)\b/g) ?? []).map(Number)
  return {
    make: hit ? hit.m.make : make,
    model: hit ? hit.m.model : null,
    yearFrom: years.length ? Math.min(...years) : null,
    yearTo: years.length ? Math.max(...years) : null,
  }
}

/** True when the rules found no vehicle but the keyword has a word they
 * don't recognise — the only case worth a model call. */
export function needsModelParse(keywordText: string, parse: VehicleParse, dictionary: Dictionary = buildDictionary()): boolean {
  if (parse.make !== null) return false
  const known = new Set<string>(GENERIC_WORDS)
  for (const alias of Object.keys(MAKE_ALIASES)) for (const w of alias.split(' ')) known.add(w)
  for (const m of dictionary.models) for (const a of m.aliases) for (const w of a.split(' ')) known.add(w)
  return normalizeTerm(keywordText)
    .split(' ')
    .some((w) => w !== '' && !known.has(w) && !/^\d+$/.test(w))
}

const NAME = /^[\p{L}\p{N} .-]{1,40}$/u

/** Validates one model batch: {"results":[{id, make, model, year_from,
 * year_to}]}, nulls allowed. Unknown or duplicated ids and malformed
 * values are dropped (left unparsed, retried next run). */
export function parseVehicleBatch(raw: unknown, batchIds: readonly number[]): Map<number, VehicleParse> {
  const out = new Map<number, VehicleParse>()
  const results = raw && typeof raw === 'object' ? (raw as { results?: unknown }).results : undefined
  if (!Array.isArray(results)) return out
  const allowed = new Set(batchIds)
  const seen = new Set<number>()
  const dup = new Set<number>()
  const str = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' && NAME.test(v.trim()) ? v.trim() : undefined)
  const year = (v: unknown) => (v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= 1980 && (v as number) <= 2040 ? (v as number) : undefined)
  for (const r of results) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    if (typeof o.id !== 'number' || !allowed.has(o.id)) continue
    if (seen.has(o.id)) dup.add(o.id)
    seen.add(o.id)
    const make = str(o.make)
    const model = str(o.model)
    const yearFrom = year(o.year_from)
    const yearTo = year(o.year_to)
    if (make === undefined || model === undefined || yearFrom === undefined || yearTo === undefined) continue
    if (model !== null && make === null) continue // a model with no make can't be matched to stock
    out.set(o.id, { make, model, yearFrom, yearTo })
  }
  for (const id of dup) out.delete(id)
  return out
}
