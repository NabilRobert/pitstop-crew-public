// v3 step 7 — the deterministic check on Kai's output
// (docs/overhaul-v3-backend.md section 11.3) and the text Ciri grades.
// No model calls.

import { describe, it, expect } from 'vitest'
import { buildKaiInput, findForeignNumbers, renderRanking, validateRanking, MAX_EXPLANATION_CHARS, type OpenSuggestion } from './ranking.js'

function suggestion(id: number, over: Partial<OpenSuggestion> = {}): OpenSuggestion {
  return {
    id,
    type: 'negative_keyword',
    basis: 'evidence',
    confidence: 'medium',
    payload: { kind: 'negative_keyword', text: 'lowongan sales mobil bekas', match_type: 'exact', scope: 'campaign', collisions: [] },
    evidence: {
      window_start: '2026-07-06',
      window_end: '2026-10-03',
      clicks: 12,
      impressions: 240,
      cost_micros: 19_200_000_000,
      conversions: 0,
      conversions_value_micros: 0,
      min_clicks_required: 37,
      ad_group_conversion_rate: 0.0787,
    },
    expectedImpact: { wasted_spend_micros_per_week: 1_493_333_333 },
    campaignName: 'Search — Used Cars Generic',
    adGroupName: 'Used Cars Generic',
    keyword: { text: 'mobil bekas', matchType: 'broad' },
    searchTerm: 'lowongan sales mobil bekas',
    explanation: null,
    ...over,
  }
}

const candidates = [suggestion(11), suggestion(12, { type: 'pause_keyword', payload: { kind: 'pause_keyword' }, searchTerm: null }), suggestion(13, { explanation: 'Earlier run.' })]

describe('validateRanking', () => {
  it('orders by Kai’s rank, renumbers 1..n and keeps explanations only where one was asked for', () => {
    const v = validateRanking(
      {
        ranking: [
          { candidate_id: 12, rank: 5, explanation: 'Pause it.' },
          { candidate_id: 11, rank: 2, explanation: '  Block it.  ' },
          { candidate_id: 13, rank: 9, explanation: 'Should be ignored.' },
        ],
      },
      candidates
    )
    expect(v.items).toEqual([
      { candidateId: 11, rank: 1, explanation: 'Block it.' },
      { candidateId: 12, rank: 2, explanation: 'Pause it.' },
      { candidateId: 13, rank: 3, explanation: null },
    ])
    expect(v.rejected).toEqual([])
    expect(v.unranked).toEqual([])
  })

  it('rejects ids outside the candidate set, both copies of a duplicated id, and non-numeric ranks', () => {
    const v = validateRanking(
      {
        ranking: [
          { candidate_id: 99, rank: 1, explanation: 'Invented.' },
          { candidate_id: 11, rank: 2, explanation: 'a' },
          { candidate_id: 11, rank: 3, explanation: 'b' },
          { candidate_id: 12, rank: 'first', explanation: 'c' },
          'garbage',
        ],
      },
      candidates
    )
    expect(v.items).toEqual([])
    expect(v.rejected.map((r) => r.reason).sort()).toEqual(['bad_rank', 'duplicate', 'duplicate', 'malformed', 'unknown_id'])
    expect(v.unranked).toEqual([11, 12, 13])
  })

  it('survives a malformed response and clips an overlong explanation', () => {
    expect(validateRanking(null, candidates).items).toEqual([])
    expect(validateRanking({ ranking: 'nope' }, candidates).unranked).toHaveLength(3)
    const long = validateRanking({ ranking: [{ candidate_id: 11, rank: 1, explanation: 'x'.repeat(2000) }] }, candidates)
    expect(long.items[0].explanation).toHaveLength(MAX_EXPLANATION_CHARS)
  })

  it('flags (does not drop) an explanation quoting a number outside the candidate’s data', () => {
    const v = validateRanking({ ranking: [{ candidate_id: 11, rank: 1, explanation: 'It cost Rp 19.200 over 12 clicks, about 45% of spend.' }] }, candidates)
    expect(v.items[0].explanation).toContain('45%')
    expect(v.foreignNumbers).toEqual([{ candidateId: 11, numbers: ['45'], dropped: false }])
  })
})

describe('findForeignNumbers', () => {
  const c = suggestion(11)

  it('accepts the candidate’s own numbers in the forms a person writes them', () => {
    for (const text of [
      '12 clicks and 0 conversions', // raw counts
      'Rp 19,200 spent', // cost_micros as rupiah, English separators
      'Rp 19.200 terbuang', // Indonesian separators
      'about Rp 1,493 a week', // expected impact, rounded
      'past the 37-click bar', // min_clicks_required
      'the ad group converts at 7.9%', // a 0-1 share as a percent
      'Rp 19 ribu', // a "ribu" multiplier
      'in the window 2026-07-06 to 2026-10-03', // its own window dates
    ]) {
      expect(findForeignNumbers(text, c), text).toEqual([])
    }
  })

  it('catches invented or derived figures', () => {
    expect(findForeignNumbers('saving Rp 50,000 a month', c)).toEqual(['50,000'])
    expect(findForeignNumbers('3 times the average', c)).toEqual(['3'])
    expect(findForeignNumbers('since 2026-01-15', c)).toEqual(['2026-01-15'])
  })

  it('allows numbers that are part of the search term or keyword text', () => {
    const t = suggestion(1, { searchTerm: 'avanza g 2019 bekas', payload: { kind: 'promote_search_term', text: 'avanza g 2019 bekas', to_match_type: 'exact', ad_group_id: 5 } })
    expect(findForeignNumbers('"avanza g 2019 bekas" converts', t)).toEqual([])
  })
})

describe('Kai input and the graded text', () => {
  it('gives Kai the contract’s field names, the target names and which rows need an explanation', () => {
    const input = JSON.parse(
      buildKaiInput(candidates, {
        windowStart: '2026-07-06',
        windowEnd: '2026-10-03',
        inventory: { source: 'demo', snapshotOn: '2026-10-06' },
        campaigns: [{ name: 'Search — Used Cars Generic', clicks: 900, costMicros: 1_500_000_000_000, conversions: 70.456 }],
      })
    )
    expect(input.account.campaigns[0]).toEqual({ name: 'Search — Used Cars Generic', clicks: 900, cost_micros: 1_500_000_000_000, conversions: 70.46 })
    expect(input.candidates.map((c: { candidate_id: number; needs_explanation: boolean }) => [c.candidate_id, c.needs_explanation])).toEqual([
      [11, true],
      [12, true],
      [13, false],
    ])
    expect(input.candidates[0]).toMatchObject({ keyword: 'mobil bekas (broad)', search_term: 'lowongan sales mobil bekas', payload: { text: 'lowongan sales mobil bekas' } })
    expect(input.candidates[0].payload.kind).toBeUndefined()
  })

  it('renders the ranking as readable text, marking unverified rows and earlier explanations', () => {
    const text = renderRanking(
      [
        { candidateId: 11, rank: 1, explanation: 'Job seekers, not buyers.' },
        { candidateId: 13, rank: 2, explanation: null },
      ],
      [...candidates.slice(0, 2), suggestion(13, { basis: 'prior', explanation: 'x' })]
    )
    expect(text).toBe(
      '#1 [negative keyword] negative exact "lowongan sales mobil bekas" (Search — Used Cars Generic)\nJob seekers, not buyers.\n\n' +
        '#2 [negative keyword, unverified] negative exact "lowongan sales mobil bekas" (Search — Used Cars Generic)\n(explained in an earlier run)'
    )
  })
})

// 3.3 — a campaign proposal's explanation may quote only the proposal's own
// numbers; one that quotes anything else is dropped, not just flagged.
describe('new_campaign explanations', () => {
  const campaign = suggestion(21, {
    type: 'new_campaign',
    basis: 'prior',
    payload: {
      kind: 'new_campaign',
      basis: 'uncovered_stock',
      name: 'Search — Wuling Almaz',
      theme: null,
      ad_groups: [{ name: 'Wuling Almaz', keywords: [{ text: 'almaz bekas', match_type: 'phrase', source: 'stock' }], vehicle_ids: [55, 56, 57] }],
      starter_negatives: [{ text: 'lowongan', match_type: 'broad' }],
      budget: { daily_micros: 100_000_000_000, target_cpa_micros: 77_333_332_000, assumptions: { allowed_spend_share: 0.2, lead_to_sale_rate: 0.02 }, bound: 'ceiling' },
      stock: { units: 3, avg_days_listed: 67, avg_margin_idr: 19_333_333, total_value_idr: 717_500_000, snapshot_on: '2026-10-05' },
      overlaps: [],
    },
    evidence: {
      window_start: '2026-07-06',
      window_end: '2026-10-02',
      clicks: null,
      impressions: null,
      cost_micros: null,
      conversions: null,
      conversions_value_micros: null,
      min_clicks_required: null,
      rules: ['campaign.uncovered_stock'],
      existing_keywords: 0,
      models: [{ make: 'Wuling', model: 'Almaz', units: 3 }],
    },
    expectedImpact: null,
    campaignName: null,
    adGroupName: null,
    keyword: null,
    searchTerm: null,
  })
  const set = [campaign, suggestion(11)]

  it('keeps an explanation built from the proposal’s own units, days, margin and budget', () => {
    const text =
      'You have 3 Wuling Almaz units, listed 67 days on average with a Rp 19.3 juta margin each, and nothing advertises them. ' +
      'Unverified: the Rp 100,000 daily budget (held at your ceiling) and the Rp 77,333 target assume a 2% lead-to-sale rate.'
    expect(findForeignNumbers(text, campaign)).toEqual([])
    const v = validateRanking({ ranking: [{ candidate_id: 21, rank: 1, explanation: text }, { candidate_id: 11, rank: 2, explanation: null }] }, set)
    expect(v.items[0]).toEqual({ candidateId: 21, rank: 1, explanation: text })
    expect(v.foreignNumbers).toEqual([])
  })

  it('drops an explanation with an invented figure, or one borrowed from another candidate, and records why', () => {
    for (const [text, foreign] of [
      ['3 Almaz units could bring 14 leads a week.', ['14']],
      ['3 Almaz units; a search term there passed the 37-click bar.', ['37']], // candidate 11's own figure
      ['3 Almaz units worth Rp 900 juta.', ['900 juta']],
    ] as const) {
      const v = validateRanking({ ranking: [{ candidate_id: 21, rank: 1, explanation: text }, { candidate_id: 11, rank: 2, explanation: 'Block it.' }] }, set)
      expect(v.items[0]).toEqual({ candidateId: 21, rank: 1, explanation: null })
      expect(v.foreignNumbers).toEqual([{ candidateId: 21, numbers: [...foreign], dropped: true }])
      // Other types keep the STARTING DEFAULT: flagged, not dropped.
      expect(v.items[1].explanation).toBe('Block it.')
    }
  })

  it('rejects an unknown candidate id next to a campaign proposal', () => {
    const v = validateRanking({ ranking: [{ candidate_id: 21, rank: 1, explanation: '3 units.' }, { candidate_id: 99, rank: 2, explanation: 'Made up.' }] }, set)
    expect(v.rejected).toEqual([{ candidate_id: 99, reason: 'unknown_id' }])
    expect(v.items.map((i) => i.candidateId)).toEqual([21])
  })
})
