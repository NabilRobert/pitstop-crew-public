import { nodeModule } from './nodeModule.mjs'
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
  const vue = await import(pathToFileURL(nodeModule(root, 'vue/index.mjs')).href)
  const { renderToString } = await import(pathToFileURL(nodeModule(root, 'vue/server-renderer/index.mjs')).href)
  const vr = await import(pathToFileURL(nodeModule(root, 'vue-router/dist/vue-router.mjs')).href)
  globalThis.document = { documentElement: { dataset: {} } }
  const { i18n } = await server.ssrLoadModule('/src/i18n/index.ts')
  const m = await server.ssrLoadModule('/src/features/keyword-optimizer/boardModel.ts')
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  const Card = (await server.ssrLoadModule('/src/features/dashboard/CampaignCard.vue')).default
  const { useCampaignsList } = await server.ssrLoadModule('/src/features/dashboard/useCampaignsList.ts')
  let bad = 0
  const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { bad++; console.log('FAIL', n, 'got', JSON.stringify(g), 'want', JSON.stringify(w)) } }
  const flag = (c, msg) => { if (c) { bad++; console.log('PROBLEM:', msg) } }

  // ---- rollup
  const roll = m.campaignRollup(fx.FIXTURE_KEYWORD_ROWS, fx.FIXTURE_KEYWORD_SUMMARY.items, fx.FIXTURE_SUGGESTIONS)
  eq('campaigns with keywords', [...roll.keys()].sort(), [1, 2, 3])
  eq('keywords add up (includes paused / idle ones)', [...roll.values()].reduce((a, r) => a + r.keywords, 0), fx.FIXTURE_KEYWORD_SUMMARY.items.length)
  eq('verdicts add up per campaign', [...roll.values()].every((r) => Object.values(r.verdicts).reduce((a, b) => a + b, 0) === r.keywords), true)
  eq('brand verdicts', [roll.get(1).verdicts.winner, roll.get(1).keywords], [2, 2])
  eq('open suggestions only (campaign 2: 101,102,103,104,106,107,109 + the ad 302 = 8)', roll.get(2).openSuggestions, 8)
  eq('applied suggestion (90) not counted', fx.FIXTURE_SUGGESTIONS.find((s) => s.id === 90).status, 'applied')
  eq('model campaign open suggestions (105, 108 = 2)', roll.get(3).openSuggestions, 2)
  const noVerdicts = m.campaignRollup(fx.FIXTURE_KEYWORD_ROWS, [], [])
  eq('no summaries -> counted as none', noVerdicts.get(1).verdicts.none, 2)
  eq('empty input', m.campaignRollup([], [], []).size, 0)

  // ---- card render
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ')
  const mount = async (props) => {
    const router = vr.createRouter({ history: vr.createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
    router.push('/'); await router.isReady()
    const app = vue.createSSRApp(Card, props); app.use(router); app.use(i18n)
    return renderToString(app)
  }
  const row = { campaign: 'Search — Used Cars Generic', impressions: 1000, clicks: 1234, cost_micros: 3_000_000_000, conversions: 6, ctr: 1 }
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale
    let h = await mount({ row, campaignId: 2, rollup: roll.get(2), keywordInfoAvailable: true })
    let t = text(h)
    flag(/campaignsList\.|campaignDetail\.|keywordOptimizer\./.test(t), `[${locale}] missing keys: ${t.slice(0, 200)}`)
    flag(/undefined|NaN|\[object|Infinity/.test(t), `[${locale}] bad value`)
    flag(!h.includes('href="/campaigns/2"'), `[${locale}] card must link to /campaigns/2`)
    flag(!/8 suggestions waiting|8 saran menunggu/.test(t), `[${locale}] waiting count: ${t}`)
    flag(!/1,234|1\.234/.test(t), `[${locale}] clicks formatted`)
    // the campaign's keywords are written out on the card
    flag(!/toyota fortuner bekas/.test(t) || !/mobil bekas/.test(t), `[${locale}] card must list its keyword names`)
    // a short list shows everything, including a paused keyword, tagged
    const withPaused = { keywords: 2, keywordList: [{ keywordId: 1, text: 'live keyword', matchType: 'phrase', status: 'enabled', verdict: 'steady', spendMicros: 5 }, { keywordId: 2, text: 'old keyword', matchType: 'phrase', status: 'paused', verdict: 'steady', spendMicros: 0 }], verdicts: { winner: 0, wasting: 0, no_stock: 0, testing: 0, needs_data: 0, steady: 2, none: 0 }, openSuggestions: 0 }
    const pt = text(await mount({ row, campaignId: 1, rollup: withPaused, keywordInfoAvailable: true }))
    flag(!/live keyword/.test(pt) || !/old keyword/.test(pt) || !(locale === 'en' ? /Paused/ : /Dijeda/).test(pt), `[${locale}] a paused keyword is listed and tagged`)
    flag(!(locale === 'en' ? /Show all 14 keywords/ : /Tampilkan semua 14 kata kunci/).test(t), `[${locale}] more than 6 keywords -> a Show all button: ${t.slice(0, 700)}`)
    const small = await mount({ row, campaignId: 1, rollup: roll.get(1), keywordInfoAvailable: true })
    flag(/Show all|Tampilkan semua/.test(text(small)), `[${locale}] a campaign with 2 keywords needs no Show all button`)
    // no conversions -> dash, never 0 or Infinity
    h = await mount({ row: { ...row, conversions: 0 }, campaignId: 2, rollup: roll.get(2), keywordInfoAvailable: true })
    flag(!text(h).includes('—'), `[${locale}] cost per enquiry with no enquiries must be a dash`)
    // PMax/Display: no rollup but info available -> says no keywords
    h = await mount({ row, campaignId: 4, rollup: null, keywordInfoAvailable: true })
    flag(!/No keywords|Tanpa kata kunci/.test(text(h)), `[${locale}] no-keyword campaign message`)
    // keyword calls failed -> must NOT claim "no keywords"
    h = await mount({ row, campaignId: 2, rollup: null, keywordInfoAvailable: false })
    flag(/No keywords|Tanpa kata kunci/.test(text(h)), `[${locale}] unknown must not read as "no keywords"`)
    flag(!/aren't available|belum tersedia/.test(text(h)), `[${locale}] unavailable message`)
    // unknown campaign id: no link, still renders
    h = await mount({ row, campaignId: null, rollup: null, keywordInfoAvailable: true })
    flag(/href="\/campaigns\//.test(h), `[${locale}] no id -> no link`)
    // singular
    h = await mount({ row, campaignId: 1, rollup: { keywords: 1, keywordList: [{ keywordId: 1, text: 'only keyword', matchType: 'phrase', status: 'enabled', verdict: 'winner', spendMicros: 1 }], verdicts: { winner: 1, wasting: 0, no_stock: 0, testing: 0, needs_data: 0, steady: 0, none: 0 }, openSuggestions: 1 }, keywordInfoAvailable: true })
    if (locale === 'en') flag(!/1 keyword\b/.test(text(h)) || !/1 suggestion waiting/.test(text(h)), `singular forms: ${text(h)}`)
  }

  // simulated + no-data cards
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale
    let h = await mount({ row: { ...row, noData: true, impressions: 0, clicks: 0, cost_micros: 0, conversions: 0 }, campaignId: 9, rollup: null, keywordInfoAvailable: true, simulated: true })
    let tx = text(h)
    flag(!(locale === 'en' ? /Simulated/ : /Simulasi/).test(tx), `[${locale}] simulated campaign carries a Simulated tag`)
    flag(!(locale === 'en' ? /No data yet/ : /Belum ada data/).test(tx), `[${locale}] no-data card says so`)
    flag(/Rp\s?0\b|0\.0|NaN|Infinity|Enquiries|Prospek/.test(tx), `[${locale}] no-data card must not show zeros or the metrics grid: ${tx}`)
    flag(/clicks|klik/.test(tx), `[${locale}] no-data card hides the clicks line`)
    h = await mount({ row, campaignId: 2, rollup: roll.get(2), keywordInfoAvailable: true, simulated: false })
    flag((locale === 'en' ? /Simulated/ : /Simulasi/).test(text(h)), `[${locale}] a normal campaign has no Simulated tag`)
  }

  // ---- composable with a mocked API
  const delay = (ms) => new Promise((r) => setTimeout(r, ms))
  let kwFails = false
  globalThis.fetch = async (url) => {
    const u = String(url); const days = Number((u.match(/days=(\d+)/) || [])[1])
    if (days === 7) await delay(120)
    const json = (b) => ({ ok: true, status: 200, json: async () => b })
    if (u.includes('/campaigns')) return json([{ id: 1, name: 'Brand' }, { id: 2, name: 'Search — Used Cars Generic' }])
    if (u.includes('/keywords/summary') || u.includes('/keyword-suggestions') || (u.includes('/keywords/performance') && kwFails)) return { ok: false, status: kwFails ? 404 : 200, json: async () => ({}) }
    if (u.includes('/keywords/performance')) return json(fx.FIXTURE_KEYWORD_ROWS)
    if (u.includes('/performance')) return json([{ date: '2026-10-05', campaign: 'Brand', impressions: 10, clicks: 1, cost_micros: days, conversions: 1 }])
    return { ok: false, status: 404, json: async () => ({}) }
  }
  const days = vue.ref(90)
  const l = useCampaignsList(days)
  await delay(80)
  eq('list loaded', [l.loading.value, l.error.value], [false, null])
  eq('keyword calls failing leaves totals working; a campaign with no rows still gets a card marked noData', [l.campaignRows.value.length, l.campaignRows.value.filter((r) => r.noData).map((r) => r.campaign), l.keywordInfoAvailable.value, l.rollups.value.size], [2, ['Search — Used Cars Generic'], false, 0])
  days.value = 7; await delay(5); days.value = 30; await delay(300)
  eq('latest period wins', l.campaignRows.value.find((r) => r.campaign === 'Brand').cost_micros, 30)
  eq('not left loading', l.loading.value, false)

  console.log(bad ? `${bad} FAILED` : 'CAMPAIGNS LIST CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
