import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const req = createRequire(path.join(root, 'package.json'))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
globalThis.fetch = async (u) => { throw new Error('unexpected network call: ' + u) }
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', configFile: path.join(root, 'vite.config.ts'), define: { 'import.meta.env.VITE_KEYWORD_OPTIMIZER_FIXTURES': '"true"' } })
try {
  const vue = await import(pathToFileURL(path.join(root, 'node_modules/vue/index.mjs')).href)
  const { renderToString } = await import(pathToFileURL(path.join(root, 'node_modules/vue/server-renderer/index.mjs')).href)
  const vr = await import(pathToFileURL(path.join(root, 'node_modules/vue-router/dist/vue-router.mjs')).href)
  globalThis.document = { documentElement: { dataset: {} } }
  const { i18n } = await server.ssrLoadModule('/src/i18n/index.ts')
  const m = await server.ssrLoadModule('/src/features/keyword-optimizer/launchModel.ts')
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  const api = await server.ssrLoadModule('/src/features/keyword-optimizer/keywordOptimizerApi.ts')
  const Panel = (await server.ssrLoadModule('/src/features/keyword-optimizer/ReviewLaunchPanel.vue')).default
  let bad = 0
  const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { bad++; console.log('FAIL', n, 'got', JSON.stringify(g), 'want', JSON.stringify(w)) } }
  const flag = (c, msg) => { if (c) { bad++; console.log('PROBLEM:', msg) } }
  const S = (id) => fx.FIXTURE_SUGGESTIONS.find((s) => s.id === id)
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')

  // ---- pure model
  eq('planned campaign launches as a campaign', m.launchKind(S(204)), 'campaign')
  eq('open campaign cannot launch', m.launchKind(S(201)), null)
  eq('planned ad for an existing group launches as an ad', m.launchKind(S(303)), 'ad')
  eq('a planned ad of a proposed campaign never launches alone', m.launchKind({ ...S(301), status: 'planned' }), null)
  eq('a non-launchable type', m.launchKind({ ...S(101), status: 'planned' }), null)
  eq('confirm name: campaign name', m.confirmNameOf(S(204)), 'Search — Honda HR-V')
  eq('confirm name: the ad group for an ad', m.confirmNameOf(S(303)), 'Used Sedan')
  eq('confirm name: nothing for others', m.confirmNameOf(S(101)), null)
  eq('exact, case-sensitive confirmation', [m.confirmationMatches('Search — Honda HR-V', 'Search — Honda HR-V'), m.confirmationMatches('search — honda hr-v', 'Search — Honda HR-V'), m.confirmationMatches('Search — Honda HR-V ', 'Search — Honda HR-V'), m.confirmationMatches('', 'x'), m.confirmationMatches('x', null)], [true, false, false, false, false])
  const objs = m.plannedObjects(S(204), [])
  eq('campaign objects, in creation order', objs.map((o) => o.kind), ['budget', 'campaign', 'ad_group', 'keyword', 'keyword', 'negative'])
  eq('the campaign is created paused', objs.find((o) => o.kind === 'campaign').detail, 'paused')
  eq('counts', m.countByKind(objs), { budget: 1, campaign: 1, ad_group: 1, ad: 0, keyword: 2, negative: 1 })
  const withAd = [{ ...S(301), status: 'planned' }]
  const camp201 = { ...S(201), status: 'planned' }
  eq('planned ads that go with a campaign', m.adsToLaunchWith([camp201, ...withAd, S(302)], 201).map((s) => s.id), [301])
  eq('an open ad does not go out', m.adsToLaunchWith([camp201, S(301)], 201).length, 0)
  const o2 = m.plannedObjects(camp201, withAd)
  eq('the ad is created inside its ad group', o2.slice(o2.findIndex((o) => o.kind === 'ad_group'), o2.findIndex((o) => o.kind === 'ad_group') + 6).map((o) => o.kind).includes('ad'), true)
  eq('ad count', m.countByKind(o2).ad, 1)
  const base = { canEdit: true, writeEnabled: true, launchable: true, alreadyCreated: false, creating: false, typed: 'a', expected: 'a' }
  eq('create enabled when everything holds', m.canCreateLaunch(base), true)
  for (const [k, v] of [['canEdit', false], ['writeEnabled', false], ['writeEnabled', null], ['launchable', false], ['alreadyCreated', true], ['creating', true], ['typed', 'b'], ['expected', null]]) eq(`create disabled when ${k}=${v}`, m.canCreateLaunch({ ...base, [k]: v }), false)

  // ---- fixture launch flow mirrors the backend's rules
  const A = api.keywordOptimizer ?? api.keywordOptimizerApi
  const must = async (name, fn, shouldThrow) => { let threw = false; try { await fn() } catch { threw = true } flag(threw !== shouldThrow, `${name}: expected ${shouldThrow ? 'an error' : 'success'}`) }
  await must('not planned', () => A.launch({ suggestion_id: 101, validate_only: true, confirm_name: 'x' }), true)
  await must('wrong confirmation', () => A.launch({ suggestion_id: 204, validate_only: false, confirm_name: 'search — honda hr-v' }), true)
  await must('unknown suggestion', () => A.launch({ suggestion_id: 99999, validate_only: true, confirm_name: 'x' }), true)
  let v; await must('validate only', async () => { v = await A.launch({ suggestion_id: 204, validate_only: true, confirm_name: 'Search — Honda HR-V' }) }, false)
  eq('validate-only writes nothing and has no id', [v.id, v.status, v.campaign], [null, 'validated', null])
  eq('204 still planned after validate-only', S(204).status === 'planned' || (await A.suggestions({ status: 'planned' })).items.some((s) => s.id === 204), true)
  let c; await must('create', async () => { c = await A.launch({ suggestion_id: 204, validate_only: false, confirm_name: 'Search — Honda HR-V' }) }, false)
  eq('created, with a campaign and paused objects', [c.status, c.campaign.name, c.objects.some((o) => o.kind === 'campaign' && o.detail === 'paused')], ['created', 'Search — Honda HR-V', true])
  const after = (await A.suggestions({ status: 'all' })).items.find((s) => s.id === 204)
  eq('the proposal is now applied and linked', [after.status, after.linked_campaign.name], ['applied', 'Search — Honda HR-V'])
  await must('creating twice', () => A.launch({ suggestion_id: 204, validate_only: false, confirm_name: 'Search — Honda HR-V' }), true)
  await must('ad for an existing group', () => A.launch({ suggestion_id: 303, validate_only: false, confirm_name: 'Used Sedan' }), false)
  const log = await A.launches(10)
  eq('audit log has the validate-only, both creations, newest first', [log.length, log[0].validate_only, log.at(-1).validate_only], [3, false, true])

  // ---- panel render
  const mount = async (props) => {
    const router = vr.createRouter({ history: vr.createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
    router.push('/'); await router.isReady()
    const app = vue.createSSRApp(Panel, props); app.use(router); app.use(i18n); return renderToString(app)
  }
  const planned = { ...S(204), status: 'planned' }
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale; const en = locale === 'en'
    let h = await mount({ suggestion: planned, all: [planned], canEdit: true, writeEnabled: true }); let t = text(h)
    flag(/keywordOptimizer\.[A-Za-z_.0-9]+/.test(t), `[${locale}] missing keys: ${t.match(/keywordOptimizer\.[A-Za-z_.0-9]+/g)}`)
    flag(/undefined|NaN|\[object|Infinity/.test(t), `[${locale}] bad value`)
    flag(!(en ? /SIMULATED/ : /SIMULASI/).test(t) || !(en ? /Nothing is sent to Google Ads/ : /Tidak ada yang dikirim ke Google Ads/).test(t), `[${locale}] must say it is a simulation`)
    flag(!(en ? /Everything is created paused/ : /Semuanya dibuat dalam keadaan dijeda/).test(t), `[${locale}] paused note`)
    flag(!t.includes('Search — Honda HR-V') || !t.includes('honda hr-v bekas'), `[${locale}] lists what will be created`)
    flag(!/id="launch-confirm"/.test(h), `[${locale}] confirmation box for the owner`)
    flag(!/<button[^>]*disabled[^>]*>\s*(Create \(simulated\)|Buat \(simulasi\))/.test(h), `[${locale}] Create is disabled until the name is typed`)
    flag(!(en ? /1 campaign, 1 budget, 1 ad groups, 0 ads, 2 keywords, 1 blocked words/ : /1 kampanye, 1 anggaran, 1 grup iklan, 0 iklan, 2 kata kunci, 1 kata diblokir/).test(t), `[${locale}] counts line: ${t.slice(0, 700)}`)
    // switched off or unknown: says so and Create is disabled
    for (const we of [false, null]) {
      h = await mount({ suggestion: planned, all: [planned], canEdit: true, writeEnabled: we }); t = text(h)
      flag(!(en ? /Creating is switched off/ : /Pembuatan sedang dimatikan/).test(t), `[${locale}] writeEnabled=${we} must read as off`)
      flag(!/<button[^>]*disabled[^>]*>\s*(Create \(simulated\)|Buat \(simulasi\))/.test(h), `[${locale}] writeEnabled=${we}: Create disabled`)
    }
    // demo: can review, cannot confirm or create
    h = await mount({ suggestion: planned, all: [planned], canEdit: false, writeEnabled: true }); t = text(h)
    flag(/id="launch-confirm"/.test(h) || (en ? /Create \(simulated\)/ : /Buat \(simulasi\)/).test(t), `[${locale}] demo must not get the confirmation box or Create`)
    flag(!(en ? /only the owner can create it/ : /hanya pemilik yang dapat membuatnya/).test(t), `[${locale}] demo note`)
    flag(!t.includes('honda hr-v bekas'), `[${locale}] demo can still review the objects`)
    // an ad for an existing group asks for the AD GROUP name
    const ad = S(303); h = await mount({ suggestion: ad, all: [ad], canEdit: true, writeEnabled: true }); t = text(h)
    flag(!(en ? /type the ad group name exactly/ : /ketik nama grup iklan persis/).test(t), `[${locale}] ad launches confirm the ad group name`)
    // escaping
    const evil = JSON.parse(JSON.stringify(planned)); evil.payload.name = '<img src=x onerror=alert(1)>'; evil.payload.ad_groups[0].keywords[0].text = '<script>x</script>'
    flag(/<img src=x|<script>x/.test(await mount({ suggestion: evil, all: [evil], canEdit: true, writeEnabled: true })), `[${locale}] unescaped names`)
  }
  console.log(bad ? `${bad} PROBLEM(S)` : 'LAUNCH CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
