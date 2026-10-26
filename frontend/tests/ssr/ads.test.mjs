import { nodeModule } from './nodeModule.mjs'
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
  const vue = await import(pathToFileURL(nodeModule(root, 'vue/index.mjs')).href)
  const { renderToString } = await import(pathToFileURL(nodeModule(root, 'vue/server-renderer/index.mjs')).href)
  const vr = await import(pathToFileURL(nodeModule(root, 'vue-router/dist/vue-router.mjs')).href)
  globalThis.document = { documentElement: { dataset: {} } }
  const { i18n } = await server.ssrLoadModule('/src/i18n/index.ts')
  const Card = (await server.ssrLoadModule('/src/features/keyword-optimizer/SuggestionCard.vue')).default
  const Lane = (await server.ssrLoadModule('/src/features/keyword-optimizer/CampaignProposalLane.vue')).default
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  const view = await server.ssrLoadModule('/src/features/keyword-optimizer/suggestionView.ts')
  let bad = 0
  const flag = (c, m) => { if (c) { bad++; console.log('PROBLEM:', m) } }
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/\s+/g, ' ')
  const S = (id) => fx.FIXTURE_SUGGESTIONS.find((s) => s.id === id)
  const mount = async (C, props) => {
    const router = vr.createRouter({ history: vr.createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
    router.push('/'); await router.isReady()
    const app = vue.createSSRApp(C, props); app.use(router); app.use(i18n); return renderToString(app)
  }
  // fixtures obey the contract's own limits (so the checks the UI shows are true of the fixtures)
  for (const id of [301, 302, 303]) {
    const p = S(id).payload
    flag(p.headlines.length < 3 || p.headlines.length > 15, `#${id} 3-15 headlines`)
    flag(p.descriptions.length < 2 || p.descriptions.length > 4, `#${id} 2-4 descriptions`)
    flag(p.headlines.some((h) => h.text.length > 30), `#${id} a headline over 30 characters: ${p.headlines.filter((h) => h.text.length > 30).map((h) => h.text)}`)
    flag(p.descriptions.some((d) => d.text.length > 90), `#${id} a description over 90 characters: ${p.descriptions.filter((d) => d.text.length > 90).map((d) => d.text)}`)
    flag((p.path1 ?? '').length > 15 || (p.path2 ?? '').length > 15, `#${id} path over 15`)
  }
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale; const en = locale === 'en'
    for (const id of [301, 302, 303]) {
      const h = await mount(Card, { suggestion: S(id), canEdit: true, busy: false }); const t = text(h)
      flag(/keywordOptimizer\.[A-Za-z_.0-9]+/.test(t), `[${locale}] #${id} missing keys: ${t.match(/keywordOptimizer\.[A-Za-z_.0-9]+/g)}`)
      flag(/undefined|NaN|\[object|Infinity/.test(t), `[${locale}] #${id} bad value: ${t.match(/.{0,30}(undefined|NaN|\[object|Infinity).{0,30}/)?.[0]}`)
    }
    // open ad for a proposed campaign: preview, checks, facts, Plan it
    let h = await mount(Card, { suggestion: S(301), canEdit: true, busy: false }); let t = text(h)
    flag(!/Toyota Innova Zenix Bekas \| Innova Zenix 2023-2024 \| Mulai Rp 395 Juta/.test(t), `[${locale}] preview joins the first three headlines: ${t.slice(0, 500)}`)
    flag(!(en ? /Fits Google's limits/ : /Sesuai batas Google/).test(t) || !(en ? /Numbers come from your stock/ : /Angka berasal dari stok Anda/).test(t) || !(en ? /Only claims you allow/ : /Hanya klaim yang Anda izinkan/).test(t), `[${locale}] three check badges`)
    flag(!(en ? /Reworded by the model and checked/ : /Ditulis ulang oleh model dan diperiksa/).test(t), `[${locale}] polished marker`)
    flag(!(en ? /3 cars in stock/ : /3 mobil di stok/).test(t), `[${locale}] units plural`)
    flag(!(en ? /No proven winners for this model yet/ : /Belum ada jagoan yang terbukti/).test(t), `[${locale}] no-winners line`)
    flag(!(en ? /No landing page is set yet/ : /Halaman tujuan belum diatur/).test(t), `[${locale}] no-landing line when final_url is null`)
    flag(!(en ? /Plan it/ : /Rencanakan/).test(t), `[${locale}] open ad can be planned`)
    flag(!/30<\/span>|\/30/.test(h) || !/\/90/.test(h), `[${locale}] character counters shown`)
    flag(!(en ? /Written for a campaign the AI proposes/ : /Ditulis untuk kampanye yang diusulkan AI/).test(t), `[${locale}] basis line`)
    // replacement ad for an existing ad group: shows what it replaces, winners, template marker
    t = text(await mount(Card, { suggestion: S(302), canEdit: true, busy: false }))
    flag(!(en ? /Replaces: Used SUV, ad 1, rated poor/ : /Menggantikan: Used SUV, ad 1, dinilai buruk/).test(t), `[${locale}] replaces line: ${t.slice(0, 600)}`)
    flag(!/toyota fortuner bekas ?, fortuner vrz bekas/.test(t), `[${locale}] winners listed`)
    flag(!(en ? /Plain template copy/ : /Teks templat biasa/).test(t), `[${locale}] template marker when not polished`)
    flag(!(en ? /Installments \/ DP/ : /Cicilan \/ DP/).test(t) || !(en ? /Inspected/ : /Sudah diperiksa/).test(t), `[${locale}] claims used are listed`)
    // planned ad on an existing ad group: I created it; planned ad with a campaign: only the note
    t = text(await mount(Card, { suggestion: S(303), canEdit: true, busy: false }))
    flag(!(en ? /I created it in Google Ads/ : /Sudah saya buat di Google Ads/).test(t), `[${locale}] planned existing ad: I created it`)
    const planned301 = { ...S(301), status: 'planned' }
    t = text(await mount(Card, { suggestion: planned301, canEdit: true, busy: false }))
    flag(!(en ? /Created together with its campaign/ : /Dibuat bersama kampanyenya/).test(t) || (en ? /I created it/ : /Sudah saya buat/).test(t), `[${locale}] an ad of a proposed campaign has no I-created-it button`)
    // failing checks are shown as failures (defensive: the backend never stores them)
    const failing = JSON.parse(JSON.stringify(S(302))); failing.payload.checks = { limits_ok: false, numbers_from_facts: false, claims_allowed: false }
    h = await mount(Card, { suggestion: failing, canEdit: true, busy: false })
    flag((h.match(/✗/g) || []).length !== 3, `[${locale}] three failing badges`)
    // over-limit text is flagged red in the counters
    const over = JSON.parse(JSON.stringify(S(302))); over.payload.headlines[0].text = 'x'.repeat(31)
    flag(!/font-bold text-flag-critical/.test(await mount(Card, { suggestion: over, canEdit: true, busy: false })), `[${locale}] over-limit counter turns red`)
    // demo: preview yes, buttons no
    t = text(await mount(Card, { suggestion: S(302), canEdit: false, busy: false }))
    flag((en ? /Plan it/ : /Rencanakan/).test(t), `[${locale}] demo must not see Plan it`)
    // escaping
    const evil = JSON.parse(JSON.stringify(S(302))); evil.payload.headlines[0].text = '<img src=x onerror=alert(1)>'; evil.payload.facts.dealer = '<script>x</script>'
    flag(/<img src=x|<script>x/.test(await mount(Card, { suggestion: evil, canEdit: true, busy: false })), `[${locale}] unescaped ad text`)
    // poster: the ads written for a proposed campaign are inside it
    h = await mount(Lane, { mode: 'proposed', items: [S(201)], all: fx.FIXTURE_SUGGESTIONS, canEdit: true, busyIds: new Set() }); t = text(h)
    flag(!(en ? /Show the ads \(1\)/ : /Tampilkan iklan \(1\)/).test(t) || !t.includes('Toyota Innova Zenix Bekas | Innova Zenix 2023-2024'), `[${locale}] poster shows its ad: ${t.slice(0, 400)}`)
    t = text(await mount(Lane, { mode: 'proposed', items: [S(202)], all: fx.FIXTURE_SUGGESTIONS, canEdit: true, busyIds: new Set() }))
    flag(/Show the ads|Tampilkan iklan/.test(t), `[${locale}] a proposal with no ads shows no ads section`)
  }
  // titles and tape come from the facts
  const tt = (k, p) => (i18n.global.t(k, p))
  i18n.global.locale.value = 'en'
  flag(view.suggestionTitle(S(302), tt) !== 'Try a new ad for Toyota Fortuner', 'ad title: ' + view.suggestionTitle(S(302), tt))
  flag(view.adSubject({ ...S(301).payload, facts: { ...S(301).payload.facts, make: null, model: null } }) !== 'Innova Zenix', 'subject falls back to the ad group name')
  console.log(bad ? `${bad} PROBLEM(S)` : 'AD CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
