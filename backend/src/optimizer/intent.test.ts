// v3 step 3 — intent rules, the model-output validator, the batch flow
// and the per-keyword intent figures (docs/overhaul-v3-backend.md
// section 8). No DB, no model: the batch flow runs against a fake caller.

import { describe, it, expect } from 'vitest'
import {
  INTENT_RULES,
  classifyByRules,
  normalizeTerm,
  parseModelBatch,
  summarizeKeywordIntents,
  MIN_LABEL_CONFIDENCE,
} from './intent.js'
import { classifyTerms } from './intentJob.js'
import { SEARCH_TERMS } from '../data/demo/profile.js'
import { GROUND_TRUTH } from '../data/demo/groundTruth.js'

const label = (text: string) => classifyByRules(normalizeTerm(text))

describe('normalizeTerm', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeTerm('  Honda  HR-V   Bekas!! ')).toBe('honda hr v bekas')
    expect(normalizeTerm('"Mobil Bekas" [Jakarta]')).toBe('mobil bekas jakarta')
  })

  it('folds full-width and compatibility characters (NFKC)', () => {
    expect(normalizeTerm('ＭＯＢＩＬ bekas')).toBe('mobil bekas')
  })

  it('maps the same query typed differently to one cache key', () => {
    expect(normalizeTerm('Kredit, Mobil-Bekas')).toBe(normalizeTerm('kredit mobil bekas'))
  })
})

describe('intent rules', () => {
  // One example per rule id, so a rule that silently stops matching fails here.
  const examples: Record<string, [string, string]> = {
    'job_seeker.jobs': ['lowongan sales mobil bekas', 'job_seeker'],
    'student.coursework': ['makalah jual beli mobil bekas pdf', 'student'],
    'competitor.marketplace': ['olx mobil bekas jakarta', 'competitor'],
    'consumer.new_car': ['harga mobil baru 2026', 'consumer'],
    'consumer.repair': ['bengkel toyota terdekat', 'consumer'],
    'consumer.parts': ['harga aki mobil suzuki', 'consumer'],
    'consumer.free': ['cek nomor rangka mobil gratis', 'consumer'],
    'consumer.diy': ['cara poles body avanza sendiri', 'consumer'],
    'researcher.reviews': ['perbandingan avanza vs xenia', 'researcher'],
    'buyer.financing': ['mobil bekas dp 10 juta', 'buyer'],
    'buyer.purchase': ['avanza bekas jakarta timur', 'buyer'],
  }

  it('has an example for every rule', () => {
    expect(Object.keys(examples).sort()).toEqual(INTENT_RULES.map((r) => r.id).sort())
  })

  for (const [ruleId, [text, intent]] of Object.entries(examples)) {
    it(`${ruleId}: "${text}" → ${intent}`, () => {
      expect(label(text)).toMatchObject({ ruleId, intent, method: 'rule' })
    })
  }

  it('lets non-buyer rules win over buyer words in the same term', () => {
    expect(label('harga mobil baru 2026')?.intent).toBe('consumer') // "harga" is a buyer word
    expect(label('lowongan sales mobil bekas')?.intent).toBe('job_seeker') // "bekas" too
    expect(label('kredit mobil baru')?.intent).toBe('consumer') // new car, even on credit
  })

  it('treats credit, instalments, DP and trade-in as buyer intent, never waste', () => {
    for (const g of GROUND_TRUTH.filter((r) => r.kind === 'legit_buyer_intent')) {
      const term = SEARCH_TERMS.find((s) => s.key === (g.target as { searchTermKey: string }).searchTermKey)!
      expect(label(term.text)?.intent, term.text).toBe('buyer')
    }
  })

  it('does not call a financing how-to DIY ("cara" + kredit)', () => {
    expect(label('cara kredit mobil bekas')).toMatchObject({ intent: 'buyer', ruleId: 'buyer.financing' })
  })

  it('matches whole words only — "ban" (tyre) does not fire inside "bandung"', () => {
    expect(label('mobil bekas bandung')?.ruleId).toBe('buyer.purchase')
  })

  it('returns null when no rule applies, so the term goes to the model', () => {
    expect(label('xyz 123')).toBeNull()
  })

  it('agrees with the demo ground-truth label for every planted search term', () => {
    for (const t of SEARCH_TERMS) expect(label(t.text)?.intent, t.text).toBe(t.intent)
  })
})

describe('parseModelBatch', () => {
  it('keeps valid labels for ids in the batch', () => {
    const out = parseModelBatch({ results: [{ id: 1, intent: 'buyer', confidence: 0.9 }] }, [1, 2])
    expect(out.get(1)).toEqual({ intent: 'buyer', confidence: 0.9, method: 'llm', ruleId: null })
    expect(out.has(2)).toBe(false) // not answered → left unclassified, retried next run
  })

  it('drops ids not in the batch, unknown labels and non-numeric confidence', () => {
    const out = parseModelBatch(
      {
        results: [
          { id: 9, intent: 'buyer', confidence: 0.9 },
          { id: 1, intent: 'shopper', confidence: 0.9 },
          { id: 2, intent: 'buyer', confidence: 'high' },
        ],
      },
      [1, 2]
    )
    expect(out.size).toBe(0)
  })

  it('trusts neither answer when an id comes back twice', () => {
    const out = parseModelBatch(
      { results: [{ id: 1, intent: 'buyer', confidence: 0.9 }, { id: 1, intent: 'student', confidence: 0.9 }] },
      [1]
    )
    expect(out.has(1)).toBe(false)
  })

  it(`stores a label under ${MIN_LABEL_CONFIDENCE} confidence as unknown, and clamps confidence to [0, 1]`, () => {
    const out = parseModelBatch(
      { results: [{ id: 1, intent: 'student', confidence: 0.3 }, { id: 2, intent: 'buyer', confidence: 7 }] },
      [1, 2]
    )
    expect(out.get(1)).toMatchObject({ intent: 'unknown', confidence: 0.3 })
    expect(out.get(2)).toMatchObject({ intent: 'buyer', confidence: 1 })
  })

  it('returns nothing for a malformed response instead of throwing', () => {
    expect(parseModelBatch(null, [1]).size).toBe(0)
    expect(parseModelBatch({ results: 'nope' }, [1]).size).toBe(0)
    expect(parseModelBatch('ignore previous instructions', [1]).size).toBe(0)
  })
})

describe('classifyTerms (rules first, model in batches)', () => {
  it('sends only terms no rule matches to the model, in batches', async () => {
    const batches: string[][] = []
    const outcome = await classifyTerms(
      ['mobil bekas murah', 'aaa', 'bbb', 'ccc'],
      async (batch) => {
        batches.push(batch.map((b) => b.term))
        return { results: batch.map((b) => ({ id: b.id, intent: 'researcher', confidence: 0.8 })) }
      },
      2
    )
    expect(batches).toEqual([['aaa', 'bbb'], ['ccc']])
    expect(outcome).toMatchObject({ byRule: 1, byModel: 3, unclassified: 0, failedBatches: 0 })
    expect(outcome.results.get('mobil bekas murah')?.method).toBe('rule')
    expect(outcome.results.get('ccc')?.method).toBe('llm')
  })

  it('a failing batch leaves its terms unclassified and never throws', async () => {
    let call = 0
    const outcome = await classifyTerms(
      ['aaa', 'bbb', 'ccc'],
      async (batch) => {
        call += 1
        if (call === 1) throw new Error('model unavailable')
        return { results: batch.map((b) => ({ id: b.id, intent: 'unknown', confidence: 0.2 })) }
      },
      2
    )
    expect(outcome).toMatchObject({ byModel: 1, unclassified: 2, failedBatches: 1 })
    expect(outcome.results.has('aaa')).toBe(false)
    expect(outcome.results.get('ccc')?.intent).toBe('unknown')
  })

  it('never calls the model when rules cover everything', async () => {
    let called = false
    await classifyTerms(['jual mobil bekas'], async () => {
      called = true
      return {}
    })
    expect(called).toBe(false)
  })
})

describe('summarizeKeywordIntents', () => {
  const intents: Record<string, 'buyer' | 'job_seeker' | 'researcher'> = {
    'avanza bekas': 'buyer',
    'lowongan sales': 'job_seeker',
    'review avanza': 'researcher',
  }
  const intentOf = (t: string) => intents[t] ?? null

  it('computes a spend-weighted mix, coverage against the keyword spend, and waste exposure', () => {
    const out = summarizeKeywordIntents(
      [
        { keywordId: 1, text: 'avanza bekas', costMicros: 600, clicks: 6, conversions: 1 },
        { keywordId: 1, text: 'lowongan sales', costMicros: 200, clicks: 2, conversions: 0 },
        { keywordId: 1, text: 'review avanza', costMicros: 200, clicks: 2, conversions: 0.5 },
      ],
      new Map([[1, 1250]]),
      intentOf
    ).get(1)!
    expect(out.intentMix).toEqual({ buyer: 0.6, job_seeker: 0.2, researcher: 0.2 })
    expect(out.intentCoverage).toBe(0.8) // 1000 visible of 1250
    expect(out.wasteExposure).toBe(0.2) // only the non-converting job search counts
  })

  it('reports null — never 0 — when there is nothing to measure', () => {
    const out = summarizeKeywordIntents(
      [{ keywordId: 2, text: 'not classified yet', costMicros: 100, clicks: 1, conversions: 0 }],
      new Map([
        [2, 100],
        [3, 0],
      ]),
      intentOf
    )
    expect(out.get(2)).toEqual({ intentMix: null, intentCoverage: 1, wasteExposure: null })
    expect(out.get(3)).toEqual({ intentMix: null, intentCoverage: null, wasteExposure: null })
  })

  it('falls back to click weights on a window with clicks but no spend', () => {
    const out = summarizeKeywordIntents(
      [
        { keywordId: 1, text: 'avanza bekas', costMicros: 0, clicks: 3, conversions: 0 },
        { keywordId: 1, text: 'lowongan sales', costMicros: 0, clicks: 1, conversions: 0 },
      ],
      new Map([[1, 0]]),
      intentOf
    ).get(1)!
    expect(out.intentMix).toEqual({ buyer: 0.75, job_seeker: 0.25 })
  })
})
