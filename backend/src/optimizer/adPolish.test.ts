// Contract 3.6 step c — Kai's ad polish with the model and the critic loop
// stubbed out: what she is sent, which of her ads are kept, what Ciri
// reads, and what is stored for each Ciri outcome. No model calls, no DB.

import { describe, it, expect } from 'vitest'
import { buildPolishInput, renderPolish, validatePolish, type PolishAd } from './adPolish.js'
import { checkAd, passes, templateCopy } from './adCopy.js'
import { buildFacts, type AdSettings } from './ads.js'
import type { NewAdPayload } from './types.js'
import type { Vehicle } from './inventory/types.js'
import { polishStep } from '../pipeline/keywordOptimizer.js'
import type { RunWithCriticArgs } from '../agents/criticLoop.js'

const SETTINGS: AdSettings = {
  dealerName: 'Pitstop Used Cars',
  dealerCity: 'Tangerang',
  dealerArea: 'Gading Serpong',
  dealerWhatsapp: '0812-5550-0123',
  landingUrl: null,
  claims: { installments: true, trade_in: false, test_drive: true, inspection: true },
  inspectionWording: 'Unit sudah melalui pemeriksaan',
}

const car = (id: number, priceIdr: number, year: number): Vehicle => ({
  id: String(id),
  make: 'Toyota',
  model: 'Innova',
  year,
  mileageKm: 40_000,
  priceIdr,
  acquisitionCostIdr: priceIdr - 12_000_000,
  status: 'available',
  listedOn: '2026-09-01',
  soldOn: null,
})

function adRow(id: number): PolishAd {
  const facts = buildFacts([car(1, 279_000_000, 2022), car(2, 300_000_000, 2023)], 'Toyota', 'Innova', SETTINGS, '2026-10-06')!
  const t = templateCopy(facts, ['innova reborn bekas'])
  const payload: NewAdPayload = {
    kind: 'new_ad',
    basis: 'uncovered_winner',
    ad_target: `ad_group:${id}|toyota|innova`,
    campaign_suggestion_id: null,
    campaign_name: 'Search — Model + Suburb',
    ad_group_name: 'Model — Toyota',
    replaces_ad_id: null,
    final_url: 'https://dealer.example.com/toyota',
    final_url_source: 'ad_group',
    path1: t.path1,
    path2: t.path2,
    headlines: t.headlines,
    descriptions: t.descriptions,
    copy_source: 'template',
    template: { headlines: t.headlines, descriptions: t.descriptions },
    facts,
    winner_keywords: [{ text: 'innova reborn bekas', source: 'keyword', keyword_id: 5, search_term_id: null }],
    checks: checkAd(t, facts),
  }
  return { id, payload }
}

const GOOD = {
  headlines: ['Toyota Innova Bekas', 'Innova Reborn Bekas', 'Mulai Rp 279 Juta', '2 Unit Siap Pakai', 'Pitstop Used Cars'],
  descriptions: ['Innova tahun 2022-2023, unit sudah melalui pemeriksaan.', 'Bisa kredit dan test drive di Gading Serpong.'],
}

describe('buildPolishInput', () => {
  it('sends the facts without vehicle ids or snapshot date, the allowed claims and the template', () => {
    const sent = JSON.parse(buildPolishInput([adRow(11)])).ads[0]
    expect(sent.candidate_id).toBe(11)
    expect(sent.facts).not.toHaveProperty('vehicle_ids')
    expect(sent.facts).not.toHaveProperty('snapshot_on')
    expect(sent.facts.price_min_idr).toBe(279_000_000)
    expect(sent.allowed_claims.join()).toContain('kredit')
    expect(sent.allowed_claims.join()).not.toContain('tukar tambah') // switched off
    expect(sent.template.headlines[0]).toBe('Toyota Innova Bekas')
    expect(sent.winner_keywords).toEqual(['innova reborn bekas'])
  })
})

describe('validatePolish', () => {
  const ads = [adRow(11), adRow(12)]

  it('accepts a returned ad that passes all three checks', () => {
    const v = validatePolish({ ads: [{ candidate_id: 11, ...GOOD }] }, ads)
    expect(v.accepted.map((a) => a.id)).toEqual([11])
    expect(passes(v.accepted[0].checks)).toBe(true)
    expect(v.rejected).toEqual([])
    expect(v.missing).toEqual([12])
  })

  it('rejects an id it was not sent, and one returned twice', () => {
    const v = validatePolish({ ads: [{ candidate_id: 99, ...GOOD }, { candidate_id: 11, ...GOOD }, { candidate_id: 11, ...GOOD }] }, ads)
    expect(v.accepted.map((a) => a.id)).toEqual([11])
    expect(v.rejected.map((r) => [r.candidateId, r.reason])).toEqual([
      [99, 'not an ad that was sent'],
      [11, 'returned twice'],
    ])
  })

  it('keeps the template for copy that fails a check: a number not in the facts, a switched-off claim, a superlative, "!"', () => {
    const bad = [
      { headlines: [...GOOD.headlines, 'Mulai Rp 250 Juta'], descriptions: GOOD.descriptions },
      { headlines: [...GOOD.headlines, 'Bisa Tukar Tambah'], descriptions: GOOD.descriptions },
      { headlines: [...GOOD.headlines, 'Innova Termurah'], descriptions: GOOD.descriptions },
      { headlines: [...GOOD.headlines, 'Cek Sekarang!'], descriptions: GOOD.descriptions },
      { headlines: GOOD.headlines.slice(0, 2), descriptions: GOOD.descriptions },
    ]
    for (const b of bad) {
      const v = validatePolish({ ads: [{ candidate_id: 11, ...b }] }, ads)
      expect(v.accepted).toEqual([])
      expect(v.rejected[0].candidateId).toBe(11)
    }
  })

  it('rejects a reply without an ads list, and an ad without text lists', () => {
    expect(validatePolish({ ranking: [] }, ads).rejected[0].reason).toContain('"ads"')
    expect(validatePolish({ ads: [{ candidate_id: 11, headlines: 'x', descriptions: [] }] }, ads).rejected[0].reason).toContain('lists of text')
  })
})

describe('renderPolish', () => {
  it('shows the polish where it was kept and the template, with the reason, elsewhere', () => {
    const ads = [adRow(11), adRow(12)]
    const v = validatePolish({ ads: [{ candidate_id: 11, ...GOOD }, { candidate_id: 12, headlines: ['A', 'B', 'C'], descriptions: ['Terbaik di kota.', 'x'] }] }, ads)
    const text = renderPolish(v, ads)
    expect(text).toContain('Ad #11: Search — Model + Suburb › Model — Toyota (uncovered_winner), polished by Kai')
    expect(text).toContain('Innova Reborn Bekas | Mulai Rp 279 Juta')
    expect(text).toMatch(/Ad #12: .*template kept \(.*superlative/)
    expect(text).toContain(`Headlines: ${ads[1].payload.template.headlines.join(' | ')}`)
  })
})

/** A stand-in for runWithCritic: one draft, stored with `status`. */
function fakeCritic(status: 'approved' | 'flagged') {
  const stored = new Map<number, { content: string; status: string }>()
  const seen: { args?: RunWithCriticArgs } = {}
  const runWithCritic = async (args: RunWithCriticArgs) => {
    seen.args = args
    stored.set(7, { content: await args.generate(null), status })
    return 7
  }
  return { runWithCritic, getOutput: async (id: number) => stored.get(id) ?? null, seen }
}

describe('polishStep', () => {
  const ctx = { language: 'en', reportDate: '2026-10-06', pipelineRunId: 1 }
  const ads = [adRow(11), adRow(12)]
  const reply = async () => ({
    ads: [
      { candidate_id: 11, ...GOOD },
      { candidate_id: 12, headlines: [...GOOD.headlines, 'Garansi 1 Tahun'], descriptions: GOOD.descriptions },
      { candidate_id: 40, ...GOOD },
    ],
  })

  it('makes no call when the run inserted no ad', async () => {
    let calls = 0
    const r = await polishStep([], ctx, { polish: async () => (calls++, {}), ...fakeCritic('approved') })
    expect(r).toBeNull()
    expect(calls).toBe(0)
  })

  it('stores only the valid ads of an approved draft; an unknown id or a failing check keeps the template', async () => {
    const critic = fakeCritic('approved')
    const r = (await polishStep(ads, ctx, { polish: reply, ...critic }))!
    expect(r.approved).toBe(true)
    expect(r.updates.map((u) => u.id)).toEqual([11])
    expect(r.updates[0].headlines).toEqual(GOOD.headlines)
    expect(r.validation.rejected.map((x) => x.candidateId)).toEqual([12, 40])
    expect(critic.seen.args?.supportingData).toBe(buildPolishInput(ads)) // Ciri grades against what Kai was given
  })

  it('stores nothing from a flagged draft', async () => {
    const r = (await polishStep(ads, ctx, { polish: reply, ...fakeCritic('flagged') }))!
    expect(r.approved).toBe(false)
    expect(r.updates).toEqual([])
  })

  it('throws when the model fails, so the caller keeps the templates', async () => {
    await expect(polishStep(ads, ctx, { polish: async () => { throw new Error('402 insufficient balance') }, ...fakeCritic('approved') })).rejects.toThrow('402')
  })
})
