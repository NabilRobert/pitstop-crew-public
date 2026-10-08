// Contract 3.6 — ad copy for the new_ad suggestion
// (docs/overhaul-v3-backend.md section 11.9): the deterministic template,
// and the three checks every ad's copy must pass — on the template, on the
// model's polish, and again at launch against the current settings. Pure.
//
// The facts (AdFacts) are the only source of a number or a claim. The
// checks:
// 1. limits: 3-15 headlines of at most 30 characters, 2-4 descriptions of
//    at most 90, display paths of at most 15, none empty, none repeated;
// 2. facts:  every number is a fact; every claim used is switched on in
//    the settings; claims no setting covers are never allowed;
// 3. style:  no superlatives, no all-caps word (unless the facts spell it
//    that way, or a standard abbreviation), no '!' in a headline.

import { normalizeTerm } from './intent.js'
import type { AdCheck, AdFacts } from './types.js'

export const HEADLINE_MAX = 30
export const DESCRIPTION_MAX = 90
export const PATH_MAX = 15
export const HEADLINES_MIN = 3
export const HEADLINES_MAX = 15
export const DESCRIPTIONS_MIN = 2
export const DESCRIPTIONS_MAX = 4

export interface AdCopy {
  headlines: string[]
  descriptions: string[]
  path1: string | null
  path2: string | null
}

export interface AdChecks {
  limits: AdCheck
  facts: AdCheck
  style: AdCheck
}

// --- formatting ----------------------------------------------------------------

/** Rupiah as juta, rounded UP to 0.1 juta so a "from" price never
 * understates, Indonesian decimal comma: 279_000_000 → "279",
 * 87_500_000 → "87,5", 152_040_000 → "152,1". */
export function formatJuta(idr: number): string {
  const tenths = Math.ceil(idr / 100_000)
  const whole = Math.floor(tenths / 10)
  const frac = tenths % 10
  return frac === 0 ? String(whole) : `${whole},${frac}`
}

/** "toyota innova bekas" → "Toyota Innova Bekas"; words that are already
 * mixed or upper case (BR-V, XL7) are kept as written. */
export function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** A display path segment: lower case, letters and digits, dashes between
 * words, at most PATH_MAX characters. Null when nothing is left. */
export function pathSlug(text: string): string | null {
  const slug = normalizeTerm(text).replace(/ /g, '-').slice(0, PATH_MAX).replace(/-+$/, '')
  return slug === '' ? null : slug
}

const years = (f: AdFacts) => (f.year_min === f.year_max ? String(f.year_min) : `${f.year_min}-${f.year_max}`)
const subjectOf = (f: AdFacts) => (f.model === null ? f.make : `${f.make} ${f.model}`)

// --- the template ----------------------------------------------------------------

/** The deterministic copy: every line built from the facts, in order of
 * usefulness; a line over its limit, repeated, or failing a check on its own
 * is left out. `winners` are winner keyword texts, best first. */
export function templateCopy(f: AdFacts, winners: readonly string[] = []): AdCopy {
  const short = f.model ?? f.make
  const subject = subjectOf(f)
  const from = formatJuta(f.price_min_idr)
  // The first option that fits the limit, or nothing.
  const first = (limit: number, ...options: string[]) => options.filter((o) => o.length <= limit).slice(0, 1)
  const headlineIdeas = [
    ...first(HEADLINE_MAX, `${subject} Bekas`, `${short} Bekas`),
    // A winner that only repeats the first headline's words adds nothing.
    ...winners.filter((w) => !` ${normalizeTerm(`${subject} Bekas`)} `.includes(` ${normalizeTerm(w)} `)).slice(0, 2).map(titleCase),
    ...first(HEADLINE_MAX, `${short} Tahun ${years(f)}`, `Tahun ${years(f)}`),
    `Mulai Rp ${from} Juta`,
    `${f.units} Unit Tersedia`,
    f.dealer.name,
    ...(f.dealer.area ? [`Showroom di ${f.dealer.area}`] : []),
    `Mobil Bekas ${f.dealer.city}`,
    ...(f.claims.installments ? ['Bisa Kredit & Cicilan'] : []),
    ...(f.claims.trade_in ? ['Bisa Tukar Tambah'] : []),
    ...(f.claims.test_drive ? ['Bisa Test Drive'] : []),
    ...(f.dealer.whatsapp ? [`WA ${f.dealer.whatsapp}`] : []),
  ]

  const claimWords = [
    ...(f.claims.installments ? ['bisa kredit'] : []),
    ...(f.claims.trade_in ? ['tukar tambah'] : []),
    ...(f.claims.test_drive ? ['test drive'] : []),
  ]
  const claimList = claimWords.length <= 1 ? claimWords.join('') : `${claimWords.slice(0, -1).join(', ')} dan ${claimWords[claimWords.length - 1]}`
  const what = f.model === null ? `${f.make} bekas: ${f.models.slice(0, 3).join(', ')}.` : `${subject} bekas tahun ${years(f)},`
  const descriptionIdeas = [
    ...first(DESCRIPTION_MAX, `${what} ${f.units} unit tersedia di ${f.dealer.name}.`, `${what} ${f.units} unit tersedia.`),
    ...(f.claims.inspection && f.inspection_wording
      ? first(DESCRIPTION_MAX, `${f.inspection_wording.trim().replace(/\.+$/, '')}. Harga mulai Rp ${from} juta.`)
      : []),
    `Harga mulai Rp ${from} juta sampai Rp ${formatJuta(f.price_max_idr)} juta.`,
    claimList
      ? `${claimList.charAt(0).toUpperCase()}${claimList.slice(1)} di showroom ${f.dealer.area ?? f.dealer.city}.`
      : `Kunjungi showroom kami di ${f.dealer.area ? `${f.dealer.area}, ` : ''}${f.dealer.city}.`,
    ...(f.dealer.whatsapp ? [`Tanya unit dan jadwal kunjungan lewat WhatsApp ${f.dealer.whatsapp}.`] : []),
  ]

  // A line over its limit, repeated, or failing a check on its own is left out.
  const pick = (ideas: string[], max: number, limit: number, kind: 'headline' | 'description') => {
    const out: string[] = []
    for (const raw of ideas) {
      const text = raw.trim().replace(/\s+/g, ' ')
      if (text === '' || text.length > limit || out.some((o) => o.toLowerCase() === text.toLowerCase())) continue
      const alone: AdCopy = { headlines: kind === 'headline' ? [text] : [], descriptions: kind === 'description' ? [text] : [], path1: null, path2: null }
      if (factProblems(alone, f).length > 0 || styleProblems(alone, f).length > 0) continue
      out.push(text)
      if (out.length === max) break
    }
    return out
  }
  return {
    headlines: pick(headlineIdeas, HEADLINES_MAX, HEADLINE_MAX, 'headline'),
    descriptions: pick(descriptionIdeas, DESCRIPTIONS_MAX, DESCRIPTION_MAX, 'description'),
    path1: pathSlug(short),
    path2: 'bekas',
  }
}

// --- the checks -------------------------------------------------------------------

function limitProblems(c: AdCopy): string[] {
  const out: string[] = []
  if (c.headlines.length < HEADLINES_MIN || c.headlines.length > HEADLINES_MAX) {
    out.push(`${c.headlines.length} headlines (${HEADLINES_MIN}-${HEADLINES_MAX} allowed)`)
  }
  if (c.descriptions.length < DESCRIPTIONS_MIN || c.descriptions.length > DESCRIPTIONS_MAX) {
    out.push(`${c.descriptions.length} descriptions (${DESCRIPTIONS_MIN}-${DESCRIPTIONS_MAX} allowed)`)
  }
  const each = (lines: string[], kind: string, max: number) => {
    const seen = new Set<string>()
    lines.forEach((line, i) => {
      const label = `${kind} ${i + 1}`
      if (typeof line !== 'string' || line.trim() === '') return void out.push(`${label} is empty`)
      if (line.length > max) out.push(`${label} "${line}" is ${line.length} characters (max ${max})`)
      const key = line.trim().toLowerCase()
      if (seen.has(key)) out.push(`${label} "${line}" repeats an earlier ${kind}`)
      seen.add(key)
    })
  }
  each(c.headlines, 'headline', HEADLINE_MAX)
  each(c.descriptions, 'description', DESCRIPTION_MAX)
  for (const [name, p] of [['path1', c.path1], ['path2', c.path2]] as const) {
    if (p !== null && p.length > PATH_MAX) out.push(`${name} "${p}" is ${p.length} characters (max ${PATH_MAX})`)
  }
  return out
}

const NUMBER_TOKEN = /\d+(?:[.,]\d+)*(?:\s*(?:juta|jt|ribu|rb|k)\b)?/gi

/** The values a number token may mean: English and Indonesian separators,
 * a juta/ribu multiplier applied. */
function readings(token: string): number[] {
  const m = token.match(/^([\d.,]+)\s*([a-z]*)$/i)
  if (!m) return []
  const unit = m[2].toLowerCase()
  const mult = ['juta', 'jt'].includes(unit) ? 1e6 : ['ribu', 'rb', 'k'].includes(unit) ? 1e3 : 1
  const en = Number(m[1].replace(/,/g, ''))
  const id = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return [en, id].filter(Number.isFinite).map((n) => n * mult)
}

/** Numbers the copy may state: units, years, prices (a juta figure within
 * 0.1 juta of a price, which formatJuta's rounding up produces), and any
 * digits the facts' own words carry (a WhatsApp number, "XL7"). Never the
 * vehicle ids. */
function numberAllowed(value: number, f: AdFacts): boolean {
  if ([f.units, f.year_min, f.year_max].includes(value)) return true
  if ([f.price_min_idr, f.price_max_idr].some((p) => Math.abs(value - p) < 100_000)) return true
  const words = [f.make, f.model ?? '', ...f.models, f.dealer.name, f.dealer.city, f.dealer.area ?? '', f.dealer.whatsapp ?? '', f.inspection_wording ?? '']
  return words.some((w) => (w.match(NUMBER_TOKEN) ?? []).some((t) => readings(t).includes(value)))
}

// Claim vocabularies, matched on normalized text (lower case, punctuation as
// spaces). A claim may appear only when its setting is on.
const CLAIMS: { key: keyof AdFacts['claims']; label: string; re: RegExp }[] = [
  { key: 'installments', label: 'credit / instalments', re: /\b(kredit|cicil\w*|angsur\w*|dp|uang muka|leasing|financing|finance|pembiayaan)\b/ },
  { key: 'trade_in', label: 'trade-in', re: /\b(tukar tambah|trade in|tradein)\b/ },
  { key: 'test_drive', label: 'test drive', re: /\b(test drive|tes drive|testdrive)\b/ },
  { key: 'inspection', label: 'inspection', re: /\b(inspeksi|pemeriksaan|diperiksa|periksa|inspected|inspection|inspect)\b/ },
]
// Promises no setting covers: never allowed.
const NEVER_ALLOWED = /\b(garansi|warranty|warrantied|gratis|free|cashback|diskon|discount|promo|hadiah|bonus|bunga 0|0 bunga|bebas banjir|bebas tabrak)\b/

function factProblems(c: AdCopy, f: AdFacts): string[] {
  const out: string[] = []
  const lines = [...c.headlines.map((t, i) => [`headline ${i + 1}`, t] as const), ...c.descriptions.map((t, i) => [`description ${i + 1}`, t] as const)]
  const wording = f.inspection_wording ? normalizeTerm(f.inspection_wording) : null
  for (const [label, text] of lines) {
    if (typeof text !== 'string') continue
    for (const token of text.match(NUMBER_TOKEN) ?? []) {
      if (!readings(token).some((v) => numberAllowed(v, f))) out.push(`${label} "${text}": "${token.trim()}" is not in the facts`)
    }
    const norm = normalizeTerm(text)
    for (const claim of CLAIMS) {
      if (claim.key === 'inspection') {
        // The inspection claim only in the settings' own words.
        const rest = f.claims.inspection && wording ? ` ${norm} `.split(` ${wording} `).join(' ') : norm
        if (claim.re.test(rest)) {
          out.push(
            f.claims.inspection
              ? `${label} "${text}": the inspection claim must use the wording "${f.inspection_wording}"`
              : `${label} "${text}": the ${claim.label} claim is switched off`
          )
        }
        continue
      }
      if (claim.re.test(norm) && !f.claims[claim.key]) out.push(`${label} "${text}": the ${claim.label} claim is switched off`)
    }
    const never = norm.match(NEVER_ALLOWED)
    if (never) out.push(`${label} "${text}": "${never[1]}" is a claim no setting allows`)
  }
  return out
}

const SUPERLATIVES = /\b(terbaik|termurah|terlaris|terlengkap|terpercaya|paling|nomor 1|nomor satu|no 1|juara|best|cheapest|lowest|dijamin|guaranteed|pasti)\b/
export const ALLOWED_ABBREVIATIONS: ReadonlySet<string> = new Set(['DP', 'WA', 'SUV', 'MPV', 'AT', 'MT', 'CVT'])
const WORD = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu

function styleProblems(c: AdCopy, f: AdFacts): string[] {
  const out: string[] = []
  // Words the facts themselves write in capitals (BR-V, XL7, a dealer name).
  const factWords = new Set(
    [f.make, f.model ?? '', ...f.models, f.dealer.name, f.dealer.city, f.dealer.area ?? ''].flatMap((w) => w.match(WORD) ?? [])
  )
  const lines = [...c.headlines.map((t, i) => [`headline ${i + 1}`, t, true] as const), ...c.descriptions.map((t, i) => [`description ${i + 1}`, t, false] as const)]
  for (const [label, text, isHeadline] of lines) {
    if (typeof text !== 'string') continue
    const sup = normalizeTerm(text).match(SUPERLATIVES)
    if (sup || /#\s*1\b/.test(text)) out.push(`${label} "${text}": superlative "${sup ? sup[1] : '#1'}"`)
    for (const w of text.match(WORD) ?? []) {
      const letters = w.match(/\p{L}/gu) ?? []
      if (letters.length < 2 || w !== w.toUpperCase() || w === w.toLowerCase()) continue
      if (ALLOWED_ABBREVIATIONS.has(w) || factWords.has(w)) continue
      out.push(`${label} "${text}": all-caps word "${w}"`)
    }
    if (isHeadline && text.includes('!')) out.push(`${label} "${text}": "!" is not allowed in a headline`)
  }
  return out
}

const check = (problems: string[]): AdCheck => ({ ok: problems.length === 0, problems })

/** The three checks over one ad's copy. */
export function checkAd(c: AdCopy, f: AdFacts): AdChecks {
  return { limits: check(limitProblems(c)), facts: check(factProblems(c, f)), style: check(styleProblems(c, f)) }
}

export const passes = (checks: AdChecks) => checks.limits.ok && checks.facts.ok && checks.style.ok
