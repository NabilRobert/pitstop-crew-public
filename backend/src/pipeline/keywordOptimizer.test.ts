// v3 step 7 — Kai's step with the model and the critic loop stubbed out:
// what ends up as the ranking update for each Ciri outcome. No model calls,
// no DB writes.

import { describe, it, expect } from 'vitest'
import { kaiStep, accountSummary, canonicalJson, detectChanges, type KaiStepDeps, type StoredOpenRow } from './keywordOptimizer.js'
import type { RunWithCriticArgs } from '../agents/criticLoop.js'
import type { RevisionInput } from '../agents/revision.js'
import type { OpenSuggestion, AccountSummary } from '../optimizer/ranking.js'
import type { Candidate, EngineInput } from '../optimizer/engine.js'

const open: OpenSuggestion[] = [1, 2, 3].map((id) => ({
  id,
  type: 'pause_keyword',
  basis: 'evidence',
  confidence: 'medium',
  payload: { kind: 'pause_keyword' },
  evidence: { window_start: '2026-07-06', window_end: '2026-10-03', clicks: 50, impressions: 900, cost_micros: 80_000_000_000, conversions: 0, conversions_value_micros: 0, min_clicks_required: 37 },
  expectedImpact: null,
  campaignName: 'Search — Generic',
  adGroupName: 'Used Cars',
  keyword: { text: `"keyword ${id}"`, matchType: 'phrase' },
  searchTerm: null,
  explanation: id === 3 ? 'From an earlier run.' : null,
}))
const summary: AccountSummary = { windowStart: '2026-07-06', windowEnd: '2026-10-03', inventory: { source: 'demo', snapshotOn: '2026-10-06' }, campaigns: [] }
const ctx = { language: 'en', reportDate: '2026-10-06', pipelineRunId: 1 }

const answer = (order: number[]) => ({
  ranking: order.map((id, i) => ({ candidate_id: id, rank: i + 1, explanation: `Explanation ${id}.` })),
})

/** A stand-in for runWithCritic: drafts, then revises `revisions` times,
 * and stores the last draft with `status`. */
function fakeCritic(status: 'approved' | 'flagged', revisions = 0) {
  const stored = new Map<number, { content: string; status: string }>()
  const seen: { args?: RunWithCriticArgs; revisionsAsked: (RevisionInput | null)[] } = { revisionsAsked: [] }
  const runWithCritic = async (args: RunWithCriticArgs) => {
    seen.args = args
    let content = await args.generate(null)
    seen.revisionsAsked.push(null)
    for (let i = 0; i < revisions; i++) {
      const revision = { previousDraft: content, feedback: 'fix it', issues: [] }
      seen.revisionsAsked.push(revision)
      content = await args.generate(revision)
    }
    if (content.trim() === '') throw new Error('runWithCritic: keyword_optimizer returned an empty draft after retries')
    stored.set(7, { content, status })
    return 7
  }
  return { runWithCritic, getOutput: async (id: number) => stored.get(id) ?? null, seen }
}

describe('kaiStep', () => {
  it('applies ranks and the new explanations when Ciri approves, graded against exactly Kai’s input', async () => {
    const critic = fakeCritic('approved')
    const deps: KaiStepDeps = { rank: async () => answer([2, 1, 3]), ...critic }
    const r = await kaiStep(open, summary, ctx, deps)
    expect(r.approved).toBe(true)
    expect(r.updates).toEqual([
      { id: 2, rank: 1, explanation: 'Explanation 2.' },
      { id: 1, rank: 2, explanation: 'Explanation 1.' },
      { id: 3, rank: 3 }, // already explained: left as it is
    ])
    expect(critic.seen.args).toMatchObject({ agentType: 'keyword_optimizer', period: 'weekly', historicalContext: '', reportDate: '2026-10-06' })
    expect(JSON.parse(critic.seen.args!.supportingData).candidates).toHaveLength(3)
  })

  it('applies ranks only when Ciri leaves the draft flagged — a flagged explanation is never shown', async () => {
    const critic = fakeCritic('flagged')
    const r = await kaiStep(open, summary, ctx, { rank: async () => answer([1, 2, 3]), ...critic })
    expect(r.approved).toBe(false)
    expect(r.updates.every((u) => u.explanation === undefined)).toBe(true)
    expect(r.updates.map((u) => u.rank)).toEqual([1, 2, 3])
  })

  it('takes the final (revised) draft’s ranking, and hands Kai the critic’s revision input', async () => {
    const critic = fakeCritic('approved', 1)
    const calls: (RevisionInput | null)[] = []
    const r = await kaiStep(open, summary, ctx, {
      rank: async (_input, revision) => {
        calls.push(revision)
        return revision ? answer([3, 2, 1]) : answer([1, 2, 3])
      },
      ...critic,
    })
    expect(calls[0]).toBeNull()
    expect(calls[1]?.previousDraft).toContain('#1 [pause keyword] pause "keyword 1"')
    expect(r.updates.map((u) => u.id)).toEqual([3, 2, 1])
  })

  it('fails (so the run can keep the suggestions unranked) when nothing in Kai’s answer survives validation', async () => {
    const critic = fakeCritic('approved')
    await expect(kaiStep(open, summary, ctx, { rank: async () => ({ ranking: [{ candidate_id: 99, rank: 1 }] }), ...critic })).rejects.toThrow(/empty draft/)
  })

  it('passes a provider error straight through', async () => {
    const critic = fakeCritic('approved')
    await expect(kaiStep(open, summary, ctx, { rank: async () => { throw new Error('402 insufficient balance') }, ...critic })).rejects.toThrow('402')
  })
})

// 3.3 — a campaign proposal through the whole Kai step, model stubbed.
describe('kaiStep with a new_campaign proposal', () => {
  const proposal: OpenSuggestion = {
    id: 4,
    type: 'new_campaign',
    basis: 'prior',
    confidence: 'medium',
    payload: {
      kind: 'new_campaign',
      basis: 'aging_stock',
      name: 'Search — Toyota Rush',
      theme: null,
      ad_groups: [{ name: 'Toyota Rush', keywords: [{ text: 'rush bekas', match_type: 'phrase', source: 'stock' }], vehicle_ids: [11, 12, 13] }],
      starter_negatives: [{ text: 'lowongan', match_type: 'broad' }],
      budget: { daily_micros: 100_000_000_000, target_cpa_micros: 49_333_332_000, assumptions: { allowed_spend_share: 0.2, lead_to_sale_rate: 0.02 }, bound: 'ceiling' },
      stock: { units: 3, avg_days_listed: 91, avg_margin_idr: 12_333_333, total_value_idr: 606_500_000, snapshot_on: '2026-10-05' },
      overlaps: [{ campaign_id: 3, name: 'Search — Model + Suburb', shared_keywords: 1 }],
    },
    evidence: { window_start: '2026-07-06', window_end: '2026-10-02', clicks: null, impressions: null, cost_micros: null, conversions: null, conversions_value_micros: null, min_clicks_required: null, aging_units: 3 },
    expectedImpact: null,
    campaignName: null,
    adGroupName: null,
    keyword: null,
    searchTerm: null,
    explanation: null,
  }
  const reply = (explanation: string) => async () => ({
    ranking: [
      { candidate_id: 4, rank: 1, explanation },
      { candidate_id: 1, rank: 2, explanation: 'Explanation 1.' },
    ],
  })
  const list = [proposal, open[0]]

  it('stores an approved explanation that quotes only the proposal’s own numbers', async () => {
    const text = 'Your 3 Toyota Rush units have been listed 91 days on average and only 1 keyword reaches them. Unverified: Rp 100,000 a day.'
    const r = await kaiStep(list, summary, ctx, { rank: reply(text), ...fakeCritic('approved') })
    expect(r.updates[0]).toEqual({ id: 4, rank: 1, explanation: text })
    expect(r.validation.foreignNumbers).toEqual([])
  })

  it('never stores one with a number outside the proposal, even when Ciri approves; the rank still applies', async () => {
    const critic = fakeCritic('approved')
    const r = await kaiStep(list, summary, ctx, { rank: reply('3 Rush units could sell within 45 days.'), ...critic })
    expect(r.approved).toBe(true)
    expect(r.updates).toEqual([
      { id: 4, rank: 1 },
      { id: 1, rank: 2, explanation: 'Explanation 1.' },
    ])
    expect(r.validation.foreignNumbers).toEqual([{ candidateId: 4, numbers: ['45'], dropped: true }])
    // What Ciri grades shows the proposal without the dropped explanation.
    const graded = (await critic.getOutput(r.outputId))!.content
    expect(graded).toContain('#1 [new campaign, unverified] new campaign "Search — Toyota Rush" (aging stock, 1 ad group, 3 units)\n(no usable explanation this run)')
    expect(graded).not.toContain('45 days')
  })
})

describe('accountSummary', () => {
  it('totals keyword traffic per campaign that has any', () => {
    const k = (id: number, adGroupId: number, clicks: number) => ({
      id, adGroupId, text: 'x', matchType: 'phrase' as const, cpcBidMicros: null, firstServedOn: null, qualityScore: null, rankLostShare: null,
      stats: { impressions: 0, clicks, costMicros: clicks * 1000, conversions: clicks / 10, conversionsValueMicros: 0 },
    })
    const input = {
      windowStart: 'a', windowEnd: 'b',
      campaigns: [{ id: 1, name: 'Generic' }, { id: 2, name: 'PMax' }],
      adGroups: [{ id: 10, campaignId: 1, name: 'g' }],
      keywords: [k(1, 10, 20), k(2, 10, 30)],
      inventory: { source: 'demo', snapshotOn: '2026-10-06', vehicles: [], events: [], error: null },
    } as unknown as EngineInput
    expect(accountSummary(input).campaigns).toEqual([{ name: 'Generic', clicks: 50, costMicros: 50_000, conversions: 5 }])
  })
})

// 3.5 cost control — the model step runs only when something changed since
// the last completed run.
describe('detectChanges', () => {
  const candidate: Candidate = {
    type: 'pause_keyword',
    campaignId: 1,
    adGroupId: 10,
    keywordId: 100,
    searchTermId: null,
    payload: { kind: 'pause_keyword' },
    evidence: { window_start: '2026-07-06', window_end: '2026-10-03', clicks: 50, impressions: 900, cost_micros: 80_000_000_000, conversions: 0, conversions_value_micros: 0, min_clicks_required: 37, rules: ['pause.no_stock'] },
    basis: 'evidence',
    confidence: 'medium',
    expectedImpact: { wasted_spend_micros_per_week: 6_222_222_222 },
    inventorySnapshotOn: '2026-10-06',
    fingerprint: 'fp-1',
  }
  // As jsonb returns it: the same values, keys in another order.
  const stored: StoredOpenRow = {
    fingerprint: 'fp-1',
    payload: { kind: 'pause_keyword' },
    evidence: { rules: ['pause.no_stock'], clicks: 50, conversions: 0, cost_micros: 80_000_000_000, window_end: '2026-10-03', impressions: 900, window_start: '2026-07-06', min_clicks_required: 37, conversions_value_micros: 0 },
    basis: 'evidence',
    confidence: 'medium',
    expected_impact: { wasted_spend_micros_per_week: 6_222_222_222 },
  }
  const same = { previousRun: true, inserted: 0, superseded: 0, statusChanges: 0, storedOpen: [stored], recomputed: [candidate] }

  it('finds nothing new when the engine reproduces every open row exactly (jsonb key order ignored)', () => {
    expect(canonicalJson(stored.evidence)).toBe(canonicalJson(candidate.evidence))
    expect(detectChanges(same)).toEqual({ changed: false, reasons: [] })
  })

  it('counts a new suggestion, a superseded one, and a status change', () => {
    expect(detectChanges({ ...same, inserted: 2 }).reasons).toEqual(['2 new suggestions'])
    expect(detectChanges({ ...same, superseded: 1 }).reasons).toEqual(['1 superseded'])
    expect(detectChanges({ ...same, statusChanges: 1 }).reasons).toEqual(['1 status change since the last run'])
  })

  it('counts an open suggestion whose recomputed numbers or confidence moved', () => {
    const moreClicks = { ...candidate, evidence: { ...candidate.evidence, clicks: 51 } }
    expect(detectChanges({ ...same, recomputed: [moreClicks] }).reasons).toEqual(['1 open suggestion with changed numbers'])
    expect(detectChanges({ ...same, recomputed: [{ ...candidate, confidence: 'high' as const }] }).changed).toBe(true)
    expect(detectChanges({ ...same, recomputed: [{ ...candidate, expectedImpact: null }] }).changed).toBe(true)
  })

  it('ignores an open row the engine no longer produces (kept without inventory)', () => {
    expect(detectChanges({ ...same, recomputed: [] })).toEqual({ changed: false, reasons: [] })
  })

  it("ignores a new_ad's polished copy, but not a change to its template or facts (3.6)", () => {
    const template = { headlines: ['Toyota Innova Bekas', 'Mulai Rp 279 Juta', '2 Unit Tersedia'], descriptions: ['a.', 'b.'] }
    const ad = { kind: 'new_ad', ...template, copy_source: 'template', template, facts: { units: 2 }, checks: { limits: { ok: true, problems: [] } } }
    const polished = { ...ad, headlines: ['Toyota Innova Bekas', 'Innova Siap Pakai', '2 Unit Tersedia'], copy_source: 'model', checks: { style: { ok: true, problems: [] } } }
    const adCandidate = { ...candidate, type: 'new_ad' as const, payload: ad as unknown as Candidate['payload'] }
    const adSame = { ...same, storedOpen: [{ ...stored, payload: polished }], recomputed: [adCandidate] }
    expect(detectChanges(adSame)).toEqual({ changed: false, reasons: [] })
    const moreUnits = { ...adCandidate, payload: { ...ad, facts: { units: 3 } } as unknown as Candidate['payload'] }
    expect(detectChanges({ ...adSame, recomputed: [moreUnits] }).changed).toBe(true)
  })

  it('treats a first run (no earlier completed run) as new', () => {
    expect(detectChanges({ ...same, previousRun: false })).toEqual({ changed: true, reasons: ['no earlier completed run'] })
  })
})
