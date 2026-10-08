// Contract 3.6 — ad copy for the new_ad suggestion (docs/overhaul-v3-backend.md
// section 11.9): the deterministic template, and the validator behind
// AdCheckFlags, run on the template, on the model's polish, and again at
// launch against the current settings. Pure.
//
// The facts (AdFacts) are the only source of a number or a claim. The flags:
// - limits_ok:          3-15 headlines of at most 30 characters, 2-4
//                       descriptions of at most 90, paths of at most 15, none
//                       empty or repeated; and the format rules: no all-caps
//                       word over 3 letters, no '!' in a headline, no
//                       repeated punctuation;
// - numbers_from_facts: every number, in digits or spelled out, is a fact
//                       (a price after rounding);
// - claims_allowed:     every claim word is allowed by the dealer profile
//                       (inspection only in the settings' exact wording); no
//                       superlative or unverifiable claim.

import { normalizeTerm } from './intent.js'
import type { AdCheckFlags, AdFacts } from './types.js'

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

/** What the copy may use besides the facts: the settings' exact inspection
 * wording (only when facts.claims_used has 'inspection'). */
export interface CopyContext {
  inspectionWording: string | null
}

export interface AdCheckResult {
  flags: AdCheckFlags
  problems: { limits: string[]; numbers: string[]; claims: string[] }
}

export const toTexts = (lines: readonly string[]) => lines.map((text) => ({ text }))
export const fromTexts = (lines: readonly { text: string }[]) => lines.map((l) => l.text)

// --- formatting ----------------------------------------------------------------

/** A price in whole juta, rounded down: 87_500_000 → 87. */
export function wholeJuta(idr: number): number {
  return Math.floor(idr / 1_000_000)
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
 * words, at most PATH_MAX characters and never a cut word. Null when nothing
 * fits. */
export function pathSlug(text: string | null): string | null {
  if (!text) return null
  let slug = ''
  for (const word of normalizeTerm(text).split(' ')) {
    const next = slug ? `${slug}-${word}` : word
    if (next.length > PATH_MAX) break
    slug = next
  }
  return slug === '' ? null : slug
}

/** Parts joined in order; optional parts are dropped from the end until the
 * line fits. Null when the required parts alone don't fit. Never cuts a word. */
function fit(limit: number, required: string, optional: readonly (string | null)[] = [], end = ''): string | null {
  const opts = optional.filter((o): o is string => !!o)
  for (let n = opts.length; n >= 0; n--) {
    const line = `${required}${opts.slice(0, n).join('')}${end}`
    if (line.length <= limit) return line
  }
  return null
}

// --- the template ----------------------------------------------------------------

/** The deterministic copy (section 11.9): every line built from the facts;
 * a line that doesn't fit, repeats, or fails a check on its own is left out.
 * `winners` are winner keyword texts, best first. */
export function templateCopy(f: AdFacts, ctx: CopyContext, winners: readonly string[] = []): AdCopy {
  const subject = [f.make, f.model].filter(Boolean).join(' ') || 'Mobil'
  const short = f.model ?? f.make ?? 'Mobil'
  const claims = new Set(f.claims_used)
  const yearsDiffer = f.year_from !== null && f.year_to !== null && f.year_from !== f.year_to
  const years = f.year_from === null ? null : yearsDiffer ? `${f.year_from}-${f.year_to}` : String(f.year_from)
  const juta = f.price_from_idr === null ? 0 : wholeJuta(f.price_from_idr)
  const wording = claims.has('inspection') && ctx.inspectionWording ? ctx.inspectionWording.trim().replace(/\.+$/, '') : null
  const first = `${subject} Bekas`.length <= HEADLINE_MAX ? `${subject} Bekas` : `${short} Bekas`
  // The top winner, unless it only repeats the first headline's words.
  const winner = winners.map(titleCase).find((w) => !` ${normalizeTerm(first)} `.includes(` ${normalizeTerm(w)} `))

  const headlineIdeas = [
    first,
    winner ?? null,
    yearsDiffer ? `${short} ${years}` : null,
    juta > 0 ? `Mulai Rp ${juta} Juta` : null,
    f.units > 0 ? `Tersedia ${f.units} Unit` : null,
    f.area ? `Dijual di ${f.area}` : null,
    f.dealer,
    claims.has('installments') ? 'Cicilan & DP Ringan' : null,
    claims.has('trade_in') ? 'Terima Tukar Tambah' : null,
    claims.has('test_drive') ? 'Bisa Test Drive' : null,
    wording,
  ]

  const where = [f.area, f.city].filter(Boolean).join(', ') || f.dealer
  const claimWords = [
    ...(claims.has('installments') ? ['cicilan'] : []),
    ...(claims.has('trade_in') ? ['tukar tambah'] : []),
    ...(claims.has('test_drive') ? ['test drive'] : []),
  ]
  const claimList = claimWords.length <= 1 ? claimWords.join('') : `${claimWords.slice(0, -1).join(', ')} dan ${claimWords[claimWords.length - 1]}`
  const contact = f.whatsapp ? `Hubungi WA ${f.whatsapp}.` : null
  const descriptionIdeas = [
    fit(DESCRIPTION_MAX, `${subject} bekas`, [years ? ` tahun ${years}` : null, ` di ${where}`], '.'),
    f.units > 0
      ? juta > 0
        ? fit(DESCRIPTION_MAX, `Harga mulai Rp ${juta} juta, tersedia ${f.units} unit`, [` di ${f.dealer}`], '.')
        : fit(DESCRIPTION_MAX, `Tersedia ${f.units} unit`, [` di ${f.dealer}`], '.')
      : null,
    claimList ? fit(DESCRIPTION_MAX, `Bisa ${claimList}.`, [contact ? ` ${contact}` : null]) : contact,
    wording ? fit(DESCRIPTION_MAX, `${wording}.`, [` Kunjungi ${f.dealer}.`]) : null,
  ]

  // A line over its limit, repeated, or failing a check on its own is left out.
  const pick = (ideas: readonly (string | null)[], max: number, limit: number, kind: 'headline' | 'description') => {
    const out: string[] = []
    for (const raw of ideas) {
      if (!raw) continue
      const text = raw.trim().replace(/\s+/g, ' ')
      if (text === '' || text.length > limit || out.some((o) => o.toLowerCase() === text.toLowerCase())) continue
      const alone: AdCopy = { headlines: kind === 'headline' ? [text] : [], descriptions: kind === 'description' ? [text] : [], path1: null, path2: null }
      const r = checkAd(alone, f, ctx)
      if (!r.flags.numbers_from_facts || !r.flags.claims_allowed || formatProblems(alone, f).length > 0) continue
      out.push(text)
      if (out.length === max) break
    }
    return out
  }
  return {
    headlines: pick(headlineIdeas, HEADLINES_MAX, HEADLINE_MAX, 'headline'),
    descriptions: pick(descriptionIdeas, DESCRIPTIONS_MAX, DESCRIPTION_MAX, 'description'),
    path1: pathSlug(f.make),
    path2: pathSlug(f.model),
  }
}

// --- limits and format ------------------------------------------------------------

const lineList = (c: AdCopy) => [
  ...c.headlines.map((t, i) => ({ label: `headline ${i + 1}`, text: t, headline: true })),
  ...c.descriptions.map((t, i) => ({ label: `description ${i + 1}`, text: t, headline: false })),
]

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

const WORD = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu
const REPEATED_PUNCTUATION = /([^\p{L}\p{N}\s])\1/u

/** No all-caps word over 3 letters (unless the facts spell it that way: a
 * make, a model, the dealer's name or place), no '!' in a headline, no
 * repeated punctuation. */
function formatProblems(c: AdCopy, f: AdFacts): string[] {
  const out: string[] = []
  const factWords = new Set([f.make, f.model, f.dealer, f.city, f.area].flatMap((w) => (w ? (w.match(WORD) ?? []) : [])))
  for (const { label, text, headline } of lineList(c)) {
    if (typeof text !== 'string') continue
    for (const w of text.match(WORD) ?? []) {
      const letters = w.match(/\p{L}/gu) ?? []
      if (letters.length <= 3 || w !== w.toUpperCase() || factWords.has(w)) continue
      out.push(`${label} "${text}": all-caps word "${w}"`)
    }
    if (headline && text.includes('!')) out.push(`${label} "${text}": "!" is not allowed in a headline`)
    const rep = text.match(REPEATED_PUNCTUATION)
    if (rep) out.push(`${label} "${text}": repeated punctuation "${rep[0]}"`)
  }
  return out
}

// --- numbers ------------------------------------------------------------------------

const NUMBER_TOKEN = /\d+(?:[.,]\d+)*(?:\s*(?:juta|jt|ribu|rb|k)\b)?/gi

/** The values a digit token may mean: English and Indonesian separators, a
 * juta/ribu multiplier applied. */
function readings(token: string): number[] {
  const m = token.match(/^([\d.,]+)\s*([a-z]*)$/i)
  if (!m) return []
  const unit = m[2].toLowerCase()
  const mult = ['juta', 'jt'].includes(unit) ? 1e6 : ['ribu', 'rb', 'k'].includes(unit) ? 1e3 : 1
  const en = Number(m[1].replace(/,/g, ''))
  const id = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return [...new Set([en, id].filter(Number.isFinite).map((n) => Math.round(n * mult)))]
}

// Spelled-out numbers (Indonesian, and English up to twelve).
const DIGIT_WORDS: Record<string, number> = {
  nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}
const SE_WORDS: Record<string, number> = { sepuluh: 10, sebelas: 11, seratus: 100 }
const GROUP_WORDS = new Set(['belas', 'puluh', 'ratus'])
const SCALE_WORDS: Record<string, number> = { ribu: 1e3, seribu: 1e3, juta: 1e6, sejuta: 1e6, miliar: 1e9, milyar: 1e9 }

/** The values of the spelled-out numbers in a text: "dua ratus tujuh puluh
 * sembilan juta" → 279_000_000. A run of scale words alone (the "juta" after
 * "279") is not a number. */
export function spelledNumbers(text: string): number[] {
  const out: number[] = []
  let total = 0
  let group = 0
  let digit = 0
  let hasValue = false
  const flush = () => {
    if (hasValue) out.push(total + group + digit)
    total = group = digit = 0
    hasValue = false
  }
  for (const w of normalizeTerm(text).split(' ')) {
    if (w in DIGIT_WORDS) {
      if (digit !== 0) flush()
      digit = DIGIT_WORDS[w]
      hasValue = true
    } else if (w in SE_WORDS) {
      group += SE_WORDS[w]
      hasValue = true
    } else if (GROUP_WORDS.has(w) && hasValue) {
      if (w === 'belas') group += 10 + digit
      else if (w === 'puluh') group += digit * 10
      else group += digit * 100
      digit = 0
    } else if (w in SCALE_WORDS && (hasValue || w.startsWith('se'))) {
      total += (group + digit || 1) * SCALE_WORDS[w]
      group = digit = 0
      hasValue = true
    } else {
      flush()
    }
  }
  flush()
  return out
}

/** Numbers the copy may state: units, years, the lowest mileage, prices (the
 * rupiah figure, or rounded to whole or tenth juta within a juta of it), and
 * digits the facts' own words carry (a WhatsApp number, "XL7"). */
function numberAllowed(value: number, f: AdFacts, ctx: CopyContext): boolean {
  if ([f.units, f.year_from, f.year_to, f.mileage_from_km].includes(value)) return true
  for (const p of [f.price_from_idr, f.price_to_idr]) {
    if (p === null) continue
    if (value === p || (Math.abs(value - p) < 1_000_000 && value % 100_000 === 0)) return true
  }
  const words = [f.make, f.model, f.dealer, f.city, f.area, f.whatsapp, f.claims_used.includes('inspection') ? ctx.inspectionWording : null]
  return words.some((w) => !!w && (w.match(NUMBER_TOKEN) ?? []).some((t) => readings(t).includes(value)))
}

function numberProblems(c: AdCopy, f: AdFacts, ctx: CopyContext): string[] {
  const out: string[] = []
  for (const { label, text } of lineList(c)) {
    if (typeof text !== 'string') continue
    for (const token of text.match(NUMBER_TOKEN) ?? []) {
      if (!readings(token).some((v) => numberAllowed(v, f, ctx))) out.push(`${label} "${text}": "${token.trim()}" is not in the facts`)
    }
    for (const value of spelledNumbers(text)) {
      if (!numberAllowed(value, f, ctx)) out.push(`${label} "${text}": the spelled-out number ${value} is not in the facts`)
    }
  }
  return out
}

// --- claims -------------------------------------------------------------------------

// Claim vocabularies, matched on normalized text (lower case, punctuation as
// spaces). A claim may appear only when the dealer profile allows it.
const CLAIMS: { key: AdFacts['claims_used'][number]; label: string; re: RegExp }[] = [
  { key: 'installments', label: 'financing', re: /\b(kredit|cicil\w*|angsur\w*|dp|uang muka|leasing|financing|finance|pembiayaan)\b/ },
  { key: 'trade_in', label: 'trade-in', re: /\b(tukar tambah|trade in|tradein)\b/ },
  { key: 'test_drive', label: 'test drive', re: /\b(test drive|tes drive|testdrive)\b/ },
  { key: 'inspection', label: 'inspection', re: /\b(garansi|warranty|inspeksi|pemeriksaan|diperiksa|periksa|inspected|inspection|inspect)\b/ },
]
// Superlatives and unverifiable claims: never allowed.
const SUPERLATIVES = /\b(terbaik|termurah|terlaris|terlengkap|terpercaya|paling|nomor 1|nomor satu|no 1|juara|best|cheapest|lowest|dijamin|guaranteed|pasti)\b/
const UNVERIFIABLE = /\b(gratis|free|cashback|diskon|discount|promo|hadiah|bonus|bunga 0|0 bunga|bebas banjir|bebas tabrak)\b/

function claimProblems(c: AdCopy, f: AdFacts, ctx: CopyContext): string[] {
  const out: string[] = []
  const allowed = new Set(f.claims_used)
  const wording = allowed.has('inspection') && ctx.inspectionWording ? normalizeTerm(ctx.inspectionWording) : null
  for (const { label, text } of lineList(c)) {
    if (typeof text !== 'string') continue
    const norm = normalizeTerm(text)
    for (const claim of CLAIMS) {
      if (claim.key === 'inspection') {
        // The inspection claim only in the settings' exact wording.
        const rest = wording ? ` ${norm} `.split(` ${wording} `).join(' ') : norm
        if (claim.re.test(rest)) {
          out.push(
            allowed.has('inspection')
              ? `${label} "${text}": the inspection claim must use the wording "${ctx.inspectionWording}"`
              : `${label} "${text}": the inspection claim is not allowed`
          )
        }
        continue
      }
      if (claim.re.test(norm) && !allowed.has(claim.key)) out.push(`${label} "${text}": the ${claim.label} claim is not allowed`)
    }
    const sup = norm.match(SUPERLATIVES)
    if (sup || /#\s*1\b/.test(text)) out.push(`${label} "${text}": superlative "${sup ? sup[1] : '#1'}"`)
    const unverifiable = norm.match(UNVERIFIABLE)
    if (unverifiable) out.push(`${label} "${text}": "${unverifiable[1]}" is an unverifiable claim`)
  }
  return out
}

// --- the checks ---------------------------------------------------------------------

/** The validator behind AdCheckFlags. */
export function checkAd(c: AdCopy, f: AdFacts, ctx: CopyContext): AdCheckResult {
  const limits = [...limitProblems(c), ...formatProblems(c, f)]
  const numbers = numberProblems(c, f, ctx)
  const claims = claimProblems(c, f, ctx)
  return {
    flags: { limits_ok: limits.length === 0, numbers_from_facts: numbers.length === 0, claims_allowed: claims.length === 0 },
    problems: { limits, numbers, claims },
  }
}

export const passes = (r: AdCheckResult) => r.flags.limits_ok && r.flags.numbers_from_facts && r.flags.claims_allowed
export const problemList = (r: AdCheckResult) => [...r.problems.limits, ...r.problems.numbers, ...r.problems.claims]
