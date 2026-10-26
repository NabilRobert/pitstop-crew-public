import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const req = createRequire(path.join(root, 'package.json'))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
globalThis.fetch = async (u) => { throw new Error('unexpected network call in a fixtures test: ' + u) }
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', configFile: path.join(root, 'vite.config.ts'), define: { 'import.meta.env.VITE_KEYWORD_OPTIMIZER_FIXTURES': '"true"' } })
try {
  const vue = await import(pathToFileURL(path.join(root, 'node_modules/vue/index.mjs')).href)
  const { renderToString } = await import(pathToFileURL(path.join(root, 'node_modules/vue/server-renderer/index.mjs')).href)
  const vr = await import(pathToFileURL(path.join(root, 'node_modules/vue-router/dist/vue-router.mjs')).href)
  globalThis.document = { documentElement: { dataset: {} } }
  const { i18n } = await server.ssrLoadModule('/src/i18n/index.ts')
  const Card = (await server.ssrLoadModule('/src/features/keyword-optimizer/SuggestionCard.vue')).default
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  const api = await server.ssrLoadModule('/src/features/keyword-optimizer/keywordOptimizerApi.ts')
  let bad = 0
  const flag = (c, m) => { if (c) { bad++; console.log('PROBLEM:', m) } }
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  const mount = async (suggestion, canEdit = true) => {
    const router = vr.createRouter({ history: vr.createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
    router.push('/'); await router.isReady()
    const app = vue.createSSRApp(Card, { suggestion, canEdit, busy: false }); app.use(router); app.use(i18n)
    return renderToString(app)
  }
  const S = (id) => fx.FIXTURE_SUGGESTIONS.find((s) => s.id === id)
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale
    const en = locale === 'en'
    for (const id of [201, 202, 203, 204]) {
      const h = await mount(S(id)); const t = text(h)
      flag(/keywordOptimizer\.[A-Za-z_.]+/.test(t), `[${locale}] #${id} missing keys: ${t.match(/keywordOptimizer\.[A-Za-z_.]+/g)}`)
      flag(/undefined|NaN|\[object|Infinity/.test(t), `[${locale}] #${id} bad value: ${t.match(/.{0,30}(undefined|NaN|\[object|Infinity).{0,30}/)?.[0]}`)
    }
    // open proposal: Plan it + Dismiss, NOT "Mark applied"
    let t = text(await mount(S(201)))
    flag(!(en ? /Plan it/ : /Rencanakan/).test(t), `[${locale}] open proposal needs Plan it`)
    flag((en ? /Mark applied/ : /Tandai diterapkan/).test(t), `[${locale}] open proposal must not say Mark applied`)
    flag(!t.includes('Innova Zenix') || !t.includes('innova zenix bekas'), `[${locale}] ad groups and keywords shown`)
    flag(!/lowongan/.test(t), `[${locale}] starter negatives shown`)
    flag(!/Search — Model \+ Suburb/.test(t), `[${locale}] overlap warning names the campaign`)
    flag(!(en ? /1 shared keyword/ : /1 kata kunci sama/).test(t), `[${locale}] overlap singular`)
    flag(!(en ? /3 cars behind this proposal/ : /3 mobil di balik usulan ini/).test(t), `[${locale}] stock count plural: ${t.slice(0, 400)}`)
    flag(!(en ? /guess/ : /perkiraan/).test(t), `[${locale}] lead-to-sale assumption must be called a guess`)
    flag(!(en ? /cannot create campaigns/ : /belum bisa membuat kampanye/).test(t), `[${locale}] must say Pitstop cannot create campaigns yet`)
    flag(!/48\.000|48,000/.test(t) || !/100\.000|100,000/.test(t), `[${locale}] budget numbers`)
    flag(!(en ? /Held at your daily ceiling/ : /Ditahan pada batas atas harian/).test(t), `[${locale}] ceiling-bound proposal must say it was held at the ceiling`)
    flag(!/href="\/settings"/.test(await mount(S(201))), `[${locale}] owner gets a link to Settings`)
    flag(!(en ? /Unverified/ : /Belum terverifikasi/).test(t), `[${locale}] prior basis is marked unverified`)
    // floor-bound and unbound
    flag(!(en ? /Raised to your daily minimum/ : /Dinaikkan ke batas bawah harian/).test(text(await mount(S(203)))), `[${locale}] floor-bound message`)
    flag((en ? /Held at your daily|Raised to your daily/ : /Ditahan pada batas|Dinaikkan ke batas/).test(text(await mount(S(202)))), `[${locale}] an unclamped budget must not claim to be clamped`)
    // no margin data -> the target cost says so, never 0
    t = text(await mount(S(202)))
    flag(!(en ? /Not enough margin data/ : /Data margin belum cukup/).test(t), `[${locale}] null target cost message`)
    flag(/Rp\s?0\b/.test(t), `[${locale}] a missing target cost must not render as Rp 0`)
    flag(!/Theme: Family cars under Rp 200 juta|Tema: Family cars under Rp 200 juta/.test(t), `[${locale}] theme line`)
    flag(!/3 shared|0 shared/.test(t) ? false : true, 'n/a')
    flag(/Overlaps with campaigns|Tumpang tindih/.test(t), `[${locale}] no overlaps -> no warning`)
    // planned: badge, I created it, move back, dismiss
    t = text(await mount(S(204)))
    flag(!(en ? /Planned, not yet in Google Ads/ : /Direncanakan, belum ada di Google Ads/).test(t), `[${locale}] planned badge`)
    flag(!(en ? /I created it in Google Ads/ : /Sudah saya buat di Google Ads/).test(t), `[${locale}] I created it`)
    flag(!(en ? /Move back to suggestions/ : /Kembalikan ke saran/).test(t), `[${locale}] undo plan`)
    // linked: says it is live
    const linked = { ...S(204), status: 'applied', linked_campaign: { id: 9, name: 'Search — Honda HR-V' } }
    t = text(await mount(linked))
    flag(!(en ? /Now live in Google Ads as "Search — Honda HR-V"/ : /Kini aktif di Google Ads sebagai "Search — Honda HR-V"/).test(t), `[${locale}] linked campaign message`)
    flag(!(en ? /Reopen/ : /Buka lagi/).test(t), `[${locale}] applied proposal can be reopened`)
    // demo: no action buttons at all, but the brief downloads (a GET) remain
    const demoHtml = await mount(S(201), false); t = text(demoHtml)
    flag((en ? /Plan it/ : /Rencanakan/).test(t), `[${locale}] demo must not see Plan it`)
    flag(!(en ? /Download brief/ : /Unduh brief/).test(t), `[${locale}] demo can still download the brief`)
    // evil text from a keyword / campaign name must stay text
    const evil = JSON.parse(JSON.stringify(S(201))); evil.payload.name = '<img src=x onerror=alert(1)>'; evil.payload.ad_groups[0].keywords[0].text = '<script>x</script>'
    const eh = await mount(evil)
    flag(/<img src=x|<script>x/.test(eh), `[${locale}] unescaped proposal text`)
  }

  // ---- fixture-layer transition rules mirror the backend (contract 3.3)
  const must = async (name, fn, shouldThrow) => { let threw = false; try { await fn() } catch { threw = true } flag(threw !== shouldThrow, `${name}: expected ${shouldThrow ? 'a conflict' : 'success'}`) }
  const A = api.keywordOptimizerApi
  await must('plan a non-proposal', () => A.setStatus(101, 'planned'), true)
  await must('open -> planned (proposal)', () => A.setStatus(201, 'planned'), false)
  await must('planned -> open (undo)', () => A.setStatus(201, 'open'), false)
  await must('open -> planned again', () => A.setStatus(201, 'planned'), false)
  await must('planned -> applied (I created it)', () => A.setStatus(201, 'applied'), false)
  await must('applied -> planned is not allowed', () => A.setStatus(201, 'planned'), true)
  await must('applied -> open (reopen)', () => A.setStatus(201, 'open'), false)
  await must('open -> applied for a normal suggestion', () => A.setStatus(101, 'applied'), false)
  await must('applied -> dismissed directly is not allowed', () => A.setStatus(101, 'dismissed'), true)
  const brief = await A.exportBrief(201, 'txt'); const bt = await brief.text()
  flag(!bt.includes('Search — Toyota Innova Zenix') || !bt.includes('innova zenix bekas'), 'brief stand-in lists the campaign and keywords')
  await must('brief for a non-proposal', () => A.exportBrief(101, 'csv'), true)

  console.log(bad ? `${bad} PROBLEM(S)` : 'PROPOSAL CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
