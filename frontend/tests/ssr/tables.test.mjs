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
  const { createSSRApp } = await import(pathToFileURL(path.join(root, 'node_modules/vue/index.mjs')).href)
  const { renderToString } = await import(pathToFileURL(path.join(root, 'node_modules/vue/server-renderer/index.mjs')).href)
  const { i18n } = await server.ssrLoadModule('/src/i18n/index.ts')
  const KT = (await server.ssrLoadModule('/src/features/dashboard/KeywordTable.vue')).default
  const ST = (await server.ssrLoadModule('/src/features/dashboard/SearchTermTable.vue')).default
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  const base = { impressions: 1000, clicks: 50, cost_micros: 80_000_000_000, conversions: 4, ctr: 5, ad_group: 'Used SUV', match_type: 'phrase', quality_score: 6, expected_ctr: 'average', ad_relevance: 'average', landing_page_experience: 'average' }
  const kwRows = [
    { ...base, keyword_id: 33, text: 'toyota fortuner bekas', search_impression_share: 0.6, rank_lost_share: 0.34, bid_micros: 1.8e9, value_micros: 4e8 * 1000, summary: fx.FIXTURE_KEYWORD_SUMMARY.items[1] },
    { ...base, keyword_id: 48, text: 'honda brio rs bekas', search_impression_share: null, rank_lost_share: null, bid_micros: null, value_micros: null, summary: fx.FIXTURE_KEYWORD_SUMMARY.items[2] },
    { ...base, keyword_id: 99, text: 'older backend row', search_impression_share: null, rank_lost_share: null, bid_micros: null, value_micros: null, summary: null },
  ]
  const stBase = { impressions: 100, clicks: 10, cost_micros: 1e10, conversions: 0, ctr: 10, match_flavor: 'broader', keyword: 'mobil bekas', wasted: true }
  const stRows = [
    { ...stBase, search_term_id: 1, search_term: 'lowongan sales mobil', intent: 'job_seeker', intent_confidence: 0.93, intent_method: 'rule', value_micros: null },
    { ...stBase, search_term_id: 2, search_term: 'fortuner vrz 2019', intent: 'buyer', intent_confidence: 0.71, intent_method: 'llm', value_micros: 6e10, conversions: 3, wasted: false },
    { ...stBase, search_term_id: 3, search_term: 'older backend term', intent: null, intent_confidence: null, intent_method: null, value_micros: null },
  ]
  let problems = 0
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale
    for (const [name, C, rows] of [['KeywordTable', KT, kwRows], ['SearchTermTable', ST, stRows], ['KeywordTable(empty)', KT, []], ['SearchTermTable(empty)', ST, []]]) {
      const app = createSSRApp(C, { rows }); app.use(i18n)
      const html = await renderToString(app)
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      const missing = text.match(/(keywordOptimizer|keywordTable|searchTermTable)\.[A-Za-z_.]+/g)
      if (missing) { problems++; console.log(`[${locale}] ${name} MISSING KEYS`, missing) }
      if (/undefined|NaN|\[object|null/.test(text)) { problems++; console.log(`[${locale}] ${name} BAD VALUE`, text.slice(0, 400)) }
      const cols = (html.match(/<th[ >]/g) || []).length
      const m = html.match(/colspan="(\d+)"/)
      if (m && Number(m[1]) !== cols) { problems++; console.log(`[${locale}] ${name} colspan ${m[1]} != ${cols} columns`) }
      if (locale === 'en' && name === 'KeywordTable') console.log(text.slice(0, 700))
    }
  }
  console.log(problems === 0 ? 'ALL TABLE CHECKS PASSED' : `${problems} PROBLEM(S)`)
  process.exitCode = problems ? 1 : 0
} finally { await server.close() }
