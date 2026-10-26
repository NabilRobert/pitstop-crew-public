// Search-term intent — the rule layer and the pure helpers around it
// (docs/overhaul-v3-backend.md section 8). Rules run first and cover the
// common Indonesian / mixed-language patterns; only terms no rule matches
// go to the model (intentJob.ts). Every rule has an id that is stored with
// the label, so any classification can be traced back to why.
//
// Known limits, also shown in the UI: intent is a proxy, slang and
// code-switching are noisy, and Google withholds low-volume queries, so a
// keyword's intent mix covers only its visible terms.

import type { Intent } from './types.js'

// Bump to force every cached classification to be redone (a rule change,
// a prompt change). Cached rows with an older version are ignored.
export const CLASSIFIER_VERSION = 1

export const INTENTS: readonly Intent[] = ['buyer', 'researcher', 'job_seeker', 'student', 'competitor', 'consumer', 'unknown']

// Below this, a model label is stored as 'unknown' (a real label: "we
// can't tell"), keeping the model's confidence.
export const MIN_LABEL_CONFIDENCE = 0.5

// The non-buyer intents a keyword's spend can be wasted on (waste exposure).
export const WASTE_INTENTS: readonly Intent[] = ['job_seeker', 'student', 'consumer', 'researcher']

/** Lowercase, Unicode-normalized, punctuation stripped to spaces,
 * whitespace collapsed. The cache key, shared across ad groups. */
export function normalizeTerm(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export interface IntentRule {
  id: string
  intent: Intent
  confidence: number
  // Matches when any of these appears as a whole word or whole phrase.
  any: string[]
  // ...unless any of these appears too (e.g. "cara" is DIY, but "cara
  // kredit mobil bekas" is a buyer asking about financing).
  unless?: string[]
}

// Ordered: the first matching rule wins. Non-buyer rules come first, so
// "harga mobil baru" is a new-car search despite "harga", and "lowongan
// sales mobil bekas" is a job search despite "bekas". STARTING DEFAULT
// token lists — expected to grow as real search terms come in.
export const INTENT_RULES: readonly IntentRule[] = [
  {
    id: 'job_seeker.jobs',
    intent: 'job_seeker',
    confidence: 0.95,
    any: ['lowongan', 'loker', 'gaji', 'karir', 'karier', 'rekrutmen', 'lowongan kerja', 'vacancy', 'hiring', 'job', 'jobs'],
  },
  {
    id: 'student.coursework',
    intent: 'student',
    confidence: 0.9,
    any: ['skripsi', 'makalah', 'jurnal', 'tesis', 'pdf', 'ppt', 'kuliah', 'tugas kuliah'],
  },
  {
    id: 'competitor.marketplace',
    intent: 'competitor',
    confidence: 0.9,
    any: ['mobil123', 'olx', 'carmudi', 'carsome', 'momobil', 'caroline', 'oto com', 'otosia'],
  },
  {
    id: 'consumer.new_car',
    intent: 'consumer',
    confidence: 0.85,
    any: ['mobil baru', 'harga baru', 'new car', 'brand new', 'dealer resmi'],
  },
  {
    id: 'consumer.repair',
    intent: 'consumer',
    confidence: 0.9,
    any: ['bengkel', 'servis', 'service', 'perbaikan', 'tune up', 'ganti oli', 'oli', 'modifikasi'],
  },
  {
    id: 'consumer.parts',
    intent: 'consumer',
    confidence: 0.9,
    any: ['sparepart', 'spare part', 'onderdil', 'suku cadang', 'aki', 'ban', 'velg', 'kampas'],
  },
  {
    id: 'consumer.free',
    intent: 'consumer',
    confidence: 0.85,
    any: ['gratis', 'free', 'download'],
  },
  {
    id: 'consumer.diy',
    intent: 'consumer',
    confidence: 0.75,
    any: ['tutorial', 'diy', 'cara', 'sendiri', 'poles', 'cuci', 'merawat', 'perawatan'],
    unless: ['kredit', 'cicilan', 'dp', 'angsuran', 'beli', 'membeli', 'tukar tambah'],
  },
  {
    id: 'researcher.reviews',
    intent: 'researcher',
    confidence: 0.8,
    any: [
      'review', 'reviews', 'ulasan', 'perbandingan', 'vs', 'versus', 'spesifikasi', 'spek',
      'kelebihan', 'kekurangan', 'konsumsi bbm', 'tips',
    ],
  },
  {
    id: 'buyer.financing',
    intent: 'buyer',
    confidence: 0.9,
    any: ['kredit', 'cicilan', 'dp', 'angsuran', 'leasing', 'tukar tambah', 'trade in'],
  },
  {
    id: 'buyer.purchase',
    intent: 'buyer',
    confidence: 0.8,
    any: [
      'jual', 'dijual', 'beli', 'membeli', 'harga', 'murah', 'bekas', 'second', 'seken', 'used',
      'for sale', 'buy', 'cheap', 'showroom', 'dealer', 'dealership', 'near me', 'nearby',
      'terdekat', 'cash',
    ],
  },
]

export interface Classification {
  intent: Intent
  confidence: number
  method: 'rule' | 'llm'
  ruleId: string | null
}

function containsPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `)
}

/** The first matching rule's label, or null when no rule applies (the
 * term then goes to the model). `normalized` must come from
 * normalizeTerm. */
export function classifyByRules(normalized: string, rules: readonly IntentRule[] = INTENT_RULES): Classification | null {
  for (const rule of rules) {
    if (!rule.any.some((p) => containsPhrase(normalized, p))) continue
    if (rule.unless?.some((p) => containsPhrase(normalized, p))) continue
    return { intent: rule.intent, confidence: rule.confidence, method: 'rule', ruleId: rule.id }
  }
  return null
}

/** Validates one model batch. Accepts {"results":[{id, intent,
 * confidence}]}. Anything not in the batch, duplicated, with an unknown
 * label or a non-numeric confidence is dropped — those terms stay
 * unclassified and are retried on the next run rather than cached wrong.
 * A label below MIN_LABEL_CONFIDENCE is stored as 'unknown'. */
export function parseModelBatch(raw: unknown, batchIds: readonly number[]): Map<number, Classification> {
  const out = new Map<number, Classification>()
  const allowed = new Set(batchIds)
  const results = raw && typeof raw === 'object' ? (raw as { results?: unknown }).results : undefined
  if (!Array.isArray(results)) return out
  const seen = new Set<number>()
  const duplicated = new Set<number>()
  for (const r of results) {
    if (!r || typeof r !== 'object') continue
    const { id, intent, confidence } = r as { id?: unknown; intent?: unknown; confidence?: unknown }
    if (typeof id !== 'number' || !allowed.has(id)) continue
    if (seen.has(id)) duplicated.add(id)
    seen.add(id)
    if (typeof intent !== 'string' || !(INTENTS as readonly string[]).includes(intent)) continue
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) continue
    const c = Math.min(1, Math.max(0, confidence))
    out.set(id, {
      intent: c < MIN_LABEL_CONFIDENCE ? 'unknown' : (intent as Intent),
      confidence: Math.round(c * 100) / 100,
      method: 'llm',
      ruleId: null,
    })
  }
  // An id answered twice is ambiguous — trust neither answer.
  for (const id of duplicated) out.delete(id)
  return out
}

export interface TermWindowRow {
  keywordId: number
  text: string
  costMicros: number
  clicks: number
  conversions: number
}

export interface KeywordIntentSummary {
  intentMix: Partial<Record<Intent, number>> | null
  intentCoverage: number | null
  wasteExposure: number | null
}

const round4 = (n: number) => Math.round(n * 10000) / 10000

/** Per-keyword intent figures over a window (contract 3.0's
 * KeywordSummary fields), from each visible search term's window totals:
 * - intentMix: spend-weighted share per label over the keyword's
 *   classified terms (click-weighted on a window with no spend); null when
 *   none of its terms is classified yet.
 * - intentCoverage: visible search-term spend ÷ the keyword's spend.
 * - wasteExposure: share of the visible spend on non-buyer-intent terms
 *   that never converted in the window.
 * `intentOf` returns null for a term not classified yet. */
export function summarizeKeywordIntents(
  rows: readonly TermWindowRow[],
  keywordSpend: ReadonlyMap<number, number>,
  intentOf: (normalized: string) => Intent | null
): Map<number, KeywordIntentSummary> {
  const byKeyword = new Map<number, TermWindowRow[]>()
  for (const r of rows) {
    if (!byKeyword.has(r.keywordId)) byKeyword.set(r.keywordId, [])
    byKeyword.get(r.keywordId)!.push(r)
  }
  const out = new Map<number, KeywordIntentSummary>()
  for (const keywordId of new Set([...keywordSpend.keys(), ...byKeyword.keys()])) {
    const terms = byKeyword.get(keywordId) ?? []
    const visibleSpend = terms.reduce((s, t) => s + t.costMicros, 0)
    const spend = keywordSpend.get(keywordId) ?? 0

    const classified = terms
      .map((t) => ({ ...t, intent: intentOf(normalizeTerm(t.text)) }))
      .filter((t): t is TermWindowRow & { intent: Intent } => t.intent !== null)
    const bySpend = classified.reduce((s, t) => s + t.costMicros, 0) > 0
    const weight = (t: TermWindowRow) => (bySpend ? t.costMicros : t.clicks)
    const totalWeight = classified.reduce((s, t) => s + weight(t), 0)
    let intentMix: Partial<Record<Intent, number>> | null = null
    if (totalWeight > 0) {
      intentMix = {}
      for (const t of classified) intentMix[t.intent] = (intentMix[t.intent] ?? 0) + weight(t) / totalWeight
      for (const k of Object.keys(intentMix) as Intent[]) intentMix[k] = round4(intentMix[k]!)
    }

    const wasted = classified
      .filter((t) => WASTE_INTENTS.includes(t.intent) && t.conversions === 0)
      .reduce((s, t) => s + t.costMicros, 0)

    out.set(keywordId, {
      intentMix,
      intentCoverage: spend > 0 ? round4(Math.min(1, visibleSpend / spend)) : null,
      wasteExposure: visibleSpend > 0 && classified.length > 0 ? round4(wasted / visibleSpend) : null,
    })
  }
  return out
}
