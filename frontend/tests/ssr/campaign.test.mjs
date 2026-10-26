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
  const vue = await import(pathToFileURL(path.join(root, 'node_modules/vue/index.mjs')).href)
  globalThis.document = { documentElement: { dataset: {} } }
  const { useCampaignDetail } = await server.ssrLoadModule('/src/features/dashboard/useCampaignDetail.ts')
  const seen = []
  const kw = (id, text, cost, conv) => ({ date: '2026-10-05', keyword_id: id, text, match_type: 'phrase', ad_group_id: 3, ad_group: 'Used SUV', campaign_id: 2, campaign: 'Camp A', impressions: 100, clicks: 10, cost_micros: cost, conversions: conv, quality_score: 6, expected_ctr: 'average', ad_relevance: 'average', landing_page_experience: 'average' })
  const delay = (ms) => new Promise((r) => setTimeout(r, ms))
  globalThis.fetch = async (url) => {
    const u = String(url); const days = Number((u.match(/days=(\d+)/) || [])[1])
    seen.push(u.replace(/^.*?:\/\/[^/]+/, ''))
    // the 7-day period answers SLOWLY, to prove a late response can't overwrite a newer period
    if (days === 7) await delay(120)
    const json = (body) => ({ ok: true, status: 200, json: async () => body })
    if (u.includes('/campaigns')) return json([{ id: 2, name: 'Camp A', status: 'ENABLED' }])
    if (u.includes('/ad-groups/performance')) return json([{ date: '2026-10-05', ad_group_id: 3, ad_group: 'Used SUV', campaign_id: 2, campaign: 'Camp A', impressions: 100, clicks: 10, cost_micros: 1, conversions: 1 }])
    if (u.includes('/asset-groups/performance')) return json([])
    if (u.includes('/keywords/summary')) return json({ coverage: 0.5, items: [{ keyword_id: 1, verdict: 'winner', intent_mix: null, intent_coverage: null, conversions_by_action: [], stock_count: 2, avg_days_listed: 5, waste_exposure: null }] })
    if (u.includes('/keywords/performance')) return json([kw(1, `kw days ${days}`, days * 1000, 1)])
    if (u.includes('/search-terms/performance')) return json([])
    if (u.includes('/ads/performance')) return json([])
    if (u.includes('/performance')) return json([
      { date: '2026-10-05', campaign: 'Camp A', impressions: 1000 * days, clicks: 10 * days, cost_micros: 5000 * days, conversions: days / 7, search_impression_share: null },
      { date: '2026-10-05', campaign: 'Other', impressions: 999999, clicks: 999999, cost_micros: 999999, conversions: 999, search_impression_share: null },
    ])
    return { ok: false, status: 404, json: async () => ({}) }
  }
  let bad = 0
  const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)) } }
  const days = vue.ref(90)
  const d = useCampaignDetail(vue.ref(2), days)
  await delay(60)
  eq('loaded', d.loading.value, false)
  eq('90d totals are this campaign only', d.totals.value, { impressions: 90000, clicks: 900, cost_micros: 450000, conversions: 90 / 7 })
  eq('raw keyword rows exposed', d.keywordPerfRows.value.map((r) => r.text), ['kw days 90'])
  eq('summaries exposed', d.keywordSummaries.value.map((s) => s.verdict), ['winner'])
  eq('row joined to summary', d.keywordRows.value[0].summary?.verdict, 'winner')
  eq('periods requested = 90', seen.filter((s) => /days=/.test(s)).every((s) => /days=90/.test(s)), true)

  // switch to the SLOW 7-day period, then immediately to 30: the late 7-day answer must lose
  seen.length = 0
  days.value = 7
  await delay(5)
  days.value = 30
  await delay(300)
  eq('latest period wins (30), not the slow 7', d.keywordPerfRows.value.map((r) => r.text), ['kw days 30'])
  eq('totals follow the latest period', d.totals.value.cost_micros, 5000 * 30)
  eq('not left loading', d.loading.value, false)
  console.log(bad ? `${bad} FAILED` : 'CAMPAIGN DETAIL CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
