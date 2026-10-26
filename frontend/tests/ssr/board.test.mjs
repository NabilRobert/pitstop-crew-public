import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const req = createRequire(path.join(root, 'package.json'))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', configFile: path.join(root, 'vite.config.ts') })
try {
  const m = await server.ssrLoadModule('/src/features/keyword-optimizer/boardModel.ts')
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  let bad = 0
  const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { bad++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)) } }

  const notes = m.buildNotes(fx.FIXTURE_KEYWORD_ROWS, fx.FIXTURE_KEYWORD_SUMMARY.items, fx.FIXTURE_SUGGESTIONS)
  eq('one note per listed keyword (rows + paused/idle ones that have none)', notes.length, fx.FIXTURE_KEYWORD_SUMMARY.items.length)
  eq('paused keyword is a zero-spend note marked paused', (({ status, spendMicros }) => [status, spendMicros])(notes.find((n) => n.keywordId === 67)), ['paused', 0])
  eq('idle enabled keyword is a note too', (({ status, spendMicros, verdict }) => [status, spendMicros, verdict])(notes.find((n) => n.keywordId === 68)), ['enabled', 0, 'needs_data'])
  eq('no summary text -> no ghost notes', m.buildNotes([], [{ keyword_id: 1, verdict: 'steady', intent_mix: null, intent_coverage: null, conversions_by_action: [], stock_count: null, avg_days_listed: null, waste_exposure: null }], []).length, 0)
  eq('sorted by spend desc', notes.every((n, i) => i === 0 || notes[i - 1].spendMicros >= n.spendMicros), true)
  eq('sizes cover L/M/S', [...new Set(notes.map((n) => n.size))].sort(), ['L', 'M', 'S'])
  eq('largest spender is L', notes[0].size, 'L')
  eq('smallest spender is S', notes.at(-1).size, 'S')

  // rows summed across days
  const twoDays = [{ ...fx.FIXTURE_KEYWORD_ROWS[0], cost_micros: 5, clicks: 1, conversions: 1 }, { ...fx.FIXTURE_KEYWORD_ROWS[0], date: '2026-10-04', cost_micros: 7, clicks: 2, conversions: 0.5 }]
  const n2 = m.buildNotes(twoDays, [], [])[0]
  eq('sums per-day rows', [n2.spendMicros, n2.clicks, n2.conversions], [12, 3, 1.5])
  eq('no summary -> verdict null', n2.verdict, null)

  // suggestions attach by keyword id; open vs all
  const fortuner = notes.find((n) => n.keywordId === 33)
  eq('fortuner has open advice', fortuner.open.map((s) => s.id).sort(), [104, 109])
  eq('fortuner best-ranked first (rank 2 before null)', fortuner.open[0].id, 104)
  const mobil = notes.find((n) => n.keywordId === 31)
  eq('mobil bekas advice', mobil.open.map((s) => s.id), [101])
  eq('verdicts come from the summary', [fortuner.verdict, mobil.verdict, notes.find((n) => n.keywordId === 48).verdict], ['winner', 'wasting', 'no_stock'])

  // loose ideas: keyword null AND open
  eq('loose ideas', m.looseIdeas(fx.FIXTURE_SUGGESTIONS).map((s) => s.id).sort(), [103, 107, 108, 302])

  // headline counts open only (5 stop; 3 grow; fresh = new_keyword 108 + new_campaign 201,202,203; applied 90 and planned 204 excluded)
  eq('headline', m.headline(fx.FIXTURE_SUGGESTIONS), { total: 14, stop: 5, grow: 3, fresh: 6 })
  eq('headline of nothing', m.headline([]), { total: 0, stop: 0, grow: 0, fresh: 0 })

  // numbers
  const nums = m.boardNumbers(notes)
  const sumSpend = (vs) => notes.filter((n) => vs.includes(n.verdict)).reduce((a, n) => a + n.spendMicros, 0)
  eq('nowhere = wasting + no_stock', nums.nowhereMicros, sumSpend(['wasting', 'no_stock']))
  eq('winners', nums.winnersMicros, sumSpend(['winner']))
  eq('numbers null without verdicts', m.boardNumbers(m.buildNotes(fx.FIXTURE_KEYWORD_ROWS, [], [])), { nowhereMicros: null, winnersMicros: null })

  // visibility
  const all = { campaignId: null, verdict: 'all', showAll: false }
  const v = m.visibleNotes(notes, all)
  eq('limit respected or advice exceeds it', v.shown.length <= Math.max(24, notes.filter((n) => n.open.length).length), true)
  eq('every advised keyword is shown', notes.filter((n) => n.open.length).every((n) => v.shown.some((s) => s.keywordId === n.keywordId)), true)
  eq('hidden count adds up', v.shown.length + v.hidden, notes.length)
  eq('shown stays in spend order', v.shown.every((n, i) => i === 0 || v.shown[i - 1].spendMicros >= n.spendMicros), true)
  eq('show all shows all', m.visibleNotes(notes, { ...all, showAll: true }).shown.length, notes.length)
  eq('verdict filter', m.visibleNotes(notes, { ...all, verdict: 'wasting', showAll: true }).shown.every((n) => n.verdict === 'wasting'), true)
  eq('campaign filter', m.visibleNotes(notes, { ...all, campaignId: 1, showAll: true }).shown.map((n) => n.keywordId).sort(), [61, 62])
  eq('hidden count adds up with paused notes', v.shown.length + v.hidden, notes.length)
  eq('small boards are never trimmed', m.visibleNotes(notes.slice(0, 5), all).hidden, 0)

  eq('campaigns', m.campaignsOf(notes).map((c) => c.id), [1, 2, 3].sort((a, b) => 0 || a - b).filter((id) => true).sort((a, b) => {
    const name = (i) => ({ 1: 'Brand', 2: 'Search — Used Cars Generic', 3: 'Search — Model + Suburb' })[i]
    return name(a).localeCompare(name(b))
  }))

  // tilt: bounded + deterministic
  const tilts = [...Array(500).keys()].map(m.tiltDegrees)
  eq('tilt within -2.5..2.5', tilts.every((t) => t >= -2.5 && t <= 2.5), true)
  eq('tilt deterministic', m.tiltDegrees(33), m.tiltDegrees(33))

  eq('cost per conversion', m.costPerConversionMicros({ spendMicros: 100, conversions: 4 }), 25)
  eq('cost per conversion with none is null, not 0 or Infinity', m.costPerConversionMicros({ spendMicros: 100, conversions: 0 }), null)

  // an ad inside a proposed campaign is shown in that poster, not as an idea of its own
  eq('proposal ads are not loose ideas', m.looseIdeas(fx.FIXTURE_SUGGESTIONS).some((s) => s.id === 301), false)
  eq('adsOfProposal finds the ad for proposal 201', m.adsOfProposal(fx.FIXTURE_SUGGESTIONS, 201).map((s) => s.id), [301])
  eq('adsOfProposal ignores other proposals and dismissed ads', [m.adsOfProposal(fx.FIXTURE_SUGGESTIONS, 202).length, m.adsOfProposal(fx.FIXTURE_SUGGESTIONS.map((s) => (s.id === 301 ? { ...s, status: 'dismissed' } : s)), 201).length], [0, 0])
  // proposals have their own lane
  eq('open proposals', m.proposalsByStatus(fx.FIXTURE_SUGGESTIONS, 'open').map((s) => s.id).sort(), [201, 202, 203])
  eq('planned proposals', m.proposalsByStatus(fx.FIXTURE_SUGGESTIONS, 'planned').map((s) => s.id), [204])
  // search
  const q = (query, extra = {}) => m.visibleNotes(notes, { campaignId: null, verdict: 'all', showAll: false, query, ...extra })
  eq('search finds by keyword', q('fortuner').shown.map((n) => n.keywordId).sort((a, b) => a - b), [33, 34, 35, 36])
  eq('search is case-insensitive and trims', q('  FORTUNER  ').shown.length, 4)
  eq('every word must match', q('fortuner vrz').shown.map((n) => n.keywordId), [34])
  eq('search by campaign name', q('brand').shown.map((n) => n.keywordId).sort((a, b) => a - b), [1, 61, 62].filter((id) => notes.some((n) => n.keywordId === id)))
  eq('search by ad group', q('honda brio').shown.every((n) => /brio/i.test(n.text + n.adGroup)), true)
  eq('no match -> nothing, no crash', q('zzzz').shown.length, 0)
  eq('searching ignores the 24 limit', q('bekas').shown.length, notes.filter((n) => /bekas/i.test(n.text + n.campaign.name + n.adGroup)).length)
  eq('blank query = normal board', q('   ').shown.length, m.visibleNotes(notes, { campaignId: null, verdict: 'all', showAll: false }).shown.length)
  eq('search + verdict filter combine', q('bekas', { verdict: 'wasting' }).shown.every((n) => n.verdict === 'wasting'), true)
  eq('regex characters are plain text', q('(.*)').shown.length, 0)
  // roll-up keyword list
  const roll2 = m.campaignRollup(fx.FIXTURE_KEYWORD_ROWS, fx.FIXTURE_KEYWORD_SUMMARY.items, fx.FIXTURE_SUGGESTIONS)
  eq('campaign keyword list is by spend', roll2.get(2).keywordList.every((k, i, a) => i === 0 || a[i - 1].spendMicros >= k.spendMicros), true)
  eq('list includes paused and idle keywords', [67].every((id) => roll2.get(2).keywordList.some((k) => k.keywordId === id && k.status === 'paused')) && roll2.get(3).keywordList.some((k) => k.keywordId === 68), true)
  eq('list length matches count', Object.values(roll2.get(2)).length > 0 && roll2.get(2).keywordList.length, roll2.get(2).keywords)
  // tie order: equal rank (null) and equal timestamp -> id ascending, whatever order the server sent
  const mk = (id) => ({ ...fx.FIXTURE_SUGGESTIONS.find((s) => s.id === 201), id, rank: null, created_at: '2026-10-07T06:20:00Z', status: 'open', keyword: null })
  eq('unranked tie order is id ascending', m.proposalsByStatus([mk(69), mk(68), mk(67)], 'open').map((s) => s.id), [67, 68, 69])
  console.log(bad ? `${bad} FAILED` : 'BOARD MODEL CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
