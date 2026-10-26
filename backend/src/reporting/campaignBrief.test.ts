// Contract 3.3 — the campaign brief files (GET /keyword-suggestions/:id/brief).

import { describe, it, expect } from 'vitest'
import { buildBriefCsv, buildBriefTxt, BRIEF_CSV_HEADERS, BRIEF_CSV_VERIFIED } from './campaignBrief.js'
import { parseBriefQuery } from './keywordSuggestions.js'
import type { NewCampaignPayload } from '../optimizer/types.js'

function proposal(over: Partial<NewCampaignPayload> = {}): NewCampaignPayload {
  return {
    kind: 'new_campaign',
    basis: 'uncovered_stock',
    name: 'Search — Wuling Almaz',
    theme: null,
    ad_groups: [
      {
        name: 'Wuling Almaz',
        keywords: [
          { text: 'almaz bekas', match_type: 'phrase', source: 'stock' },
          { text: 'wuling almaz bekas', match_type: 'exact', source: 'stock' },
          { text: 'almaz second', match_type: 'broad', source: 'stock' },
        ],
        vehicle_ids: [55, 56, 57],
      },
    ],
    starter_negatives: [
      { text: 'lowongan', match_type: 'broad' },
      { text: 'mobil baru', match_type: 'phrase' },
    ],
    budget: { daily_micros: 100_000_000_000, target_cpa_micros: 77_333_332_000, assumptions: { allowed_spend_share: 0.2, lead_to_sale_rate: 0.02 }, bound: 'ceiling' },
    stock: { units: 3, avg_days_listed: 5, avg_margin_idr: 19_333_333, total_value_idr: 717_500_000, snapshot_on: '2026-10-05' },
    overlaps: [{ campaign_id: 3, name: 'Search — Model + Suburb', shared_keywords: 1 }],
    ...over,
  }
}

describe('brief CSV (Google Ads Editor-style, UNVERIFIED)', () => {
  it('pins the exact header row, and says the columns are unverified', () => {
    expect(buildBriefCsv(proposal()).split('\r\n')[0]).toBe('Campaign,Campaign daily budget,Ad group,Keyword,Criterion type,Status')
    expect(BRIEF_CSV_HEADERS).toEqual(['Campaign', 'Campaign daily budget', 'Ad group', 'Keyword', 'Criterion type', 'Status'])
    expect(BRIEF_CSV_VERIFIED).toBe(false)
  })

  it('has a paused campaign row with the budget in whole rupiah, then ad groups, keywords and campaign negatives', () => {
    expect(buildBriefCsv(proposal()).split('\r\n')).toEqual([
      'Campaign,Campaign daily budget,Ad group,Keyword,Criterion type,Status',
      'Search — Wuling Almaz,100000,,,,Paused',
      'Search — Wuling Almaz,,Wuling Almaz,,,Enabled',
      'Search — Wuling Almaz,,Wuling Almaz,almaz bekas,Phrase,Enabled',
      'Search — Wuling Almaz,,Wuling Almaz,wuling almaz bekas,Exact,Enabled',
      'Search — Wuling Almaz,,Wuling Almaz,almaz second,Broad,Enabled',
      'Search — Wuling Almaz,,,lowongan,Campaign Negative Broad,Enabled',
      'Search — Wuling Almaz,,,mobil baru,Campaign Negative Phrase,Enabled',
      '',
    ])
  })

  it('neutralizes every text field against formula injection, and quotes commas and quotes', () => {
    const evil = proposal({
      name: '=HYPERLINK("http://x","y")',
      ad_groups: [{ name: '+ad group', keywords: [{ text: '-2+3', match_type: 'exact', source: 'stock' }, { text: '@SUM(A1)', match_type: 'phrase', source: 'stock' }], vehicle_ids: [] }],
      starter_negatives: [{ text: '\tcmd', match_type: 'broad' }, { text: 'a, b', match_type: 'phrase' }],
    })
    const lines = buildBriefCsv(evil).split('\r\n')
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x"",""y"")",100000,,,,Paused`)
    expect(lines[2]).toContain(`,'+ad group,`)
    expect(lines[3]).toContain(`,'-2+3,Exact,`)
    expect(lines[4]).toContain(`,'@SUM(A1),Phrase,`)
    expect(lines[5]).toContain(`,'\tcmd,Campaign Negative Broad,`)
    expect(lines[6]).toContain(`,"a, b",Campaign Negative Phrase,`)
    for (const line of lines.slice(1, -1)) for (const cell of line.split(',')) expect(cell).not.toMatch(/^[=+\-@\t\r]/)
  })
})

describe('brief TXT', () => {
  it('is a readable outline with Google keyword notation and every figure from the payload', () => {
    expect(buildBriefTxt(proposal())).toBe(
      [
        'Campaign: Search — Wuling Almaz',
        'Why: stock that no keyword or campaign advertises',
        'Daily budget: Rp 100,000 (held at your daily ceiling)',
        'Target cost per lead: Rp 77,333 — unverified: assumes a 2% lead-to-sale rate and 20% of margin as ad spend',
        'Stock (inventory of 2026-10-05): 3 units, listed 5 days on average, average margin Rp 19,333,333, total value Rp 717,500,000',
        '',
        'Ad group: Wuling Almaz',
        '  "almaz bekas"',
        '  [wuling almaz bekas]',
        '  almaz second',
        '',
        'Negative keywords (campaign level):',
        '  lowongan',
        '  "mobil baru"',
        '',
        'Already targeted by:',
        '  Search — Model + Suburb (1 shared keyword)',
        '',
        'Create it paused in Google Ads, check it, then enable it. Nothing here was applied to your account.',
        '',
      ].join('\n')
    )
  })

  it('says which setting held the budget, or nothing when neither did, and copes with unknown margin', () => {
    const floor = buildBriefTxt(proposal({ budget: { ...proposal().budget, bound: 'floor', target_cpa_micros: null } }))
    expect(floor).toContain('Daily budget: Rp 100,000 (held at your daily floor)')
    expect(floor).toContain('Target cost per lead: unknown (no margin data)')
    expect(buildBriefTxt(proposal({ budget: { ...proposal().budget, bound: null } }))).toContain('Daily budget: Rp 100,000\n')
  })

  it('neutralizes untrusted text at the start of every line it could open', () => {
    const txt = buildBriefTxt(
      proposal({
        theme: '=cmd',
        ad_groups: [{ name: '=evil', keywords: [{ text: '=1+1', match_type: 'broad', source: 'stock' }], vehicle_ids: [] }],
        starter_negatives: [{ text: '@x', match_type: 'broad' }],
        overlaps: [{ campaign_id: 1, name: '-bad', shared_keywords: 2 }],
      })
    )
    expect(txt).toContain("Why: stock that no keyword or campaign advertises ('=cmd)")
    expect(txt).toContain("Ad group: '=evil")
    expect(txt).toContain("  '=1+1\n")
    expect(txt).toContain("  '@x\n")
    expect(txt).toContain("  '-bad (2 shared keywords)")
  })
})

describe('GET /keyword-suggestions/:id/brief query', () => {
  it('defaults to csv, takes txt, rejects anything else', () => {
    expect(parseBriefQuery({})).toEqual({ ok: true, value: { format: 'csv' } })
    expect(parseBriefQuery({ format: 'txt' })).toEqual({ ok: true, value: { format: 'txt' } })
    expect(parseBriefQuery({ format: 'xlsx' })).toEqual({ ok: false, detail: 'format must be csv or txt' })
  })
})
