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
  globalThis.document = { documentElement: { dataset: {} } }
  const { i18n } = await server.ssrLoadModule('/src/i18n/index.ts')
  const Lane = (await server.ssrLoadModule('/src/features/keyword-optimizer/CampaignProposalLane.vue')).default
  const Section = (await server.ssrLoadModule('/src/features/keyword-optimizer/ProposalsSection.vue')).default
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  let bad = 0
  const flag = (c, m) => { if (c) { bad++; console.log('PROBLEM:', m) } }
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  const open = fx.FIXTURE_SUGGESTIONS.filter((s) => s.type === 'new_campaign' && s.status === 'open')
  const planned = fx.FIXTURE_SUGGESTIONS.filter((s) => s.type === 'new_campaign' && s.status === 'planned')
  const mount = async (C, props) => { const app = vue.createSSRApp(C, props); app.use(i18n); return renderToString(app) }
  flag(open.length !== 3 || planned.length !== 1, 'fixtures: 3 open proposals and 1 planned expected')
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale
    const en = locale === 'en'
    // ---- proposed lane
    let h = await mount(Lane, { mode: 'proposed', items: open, canEdit: true, busyIds: new Set() }); let t = text(h)
    flag(/keywordOptimizer\.|campaignsList\./.test(t), `[${locale}] missing keys: ${t.match(/(keywordOptimizer|campaignsList)\.[A-Za-z_.]+/g)}`)
    flag(/undefined|NaN|\[object|Infinity/.test(t), `[${locale}] bad value`)
    flag(!(en ? /New campaigns the AI proposes/ : /Kampanye baru yang diusulkan AI/).test(t), `[${locale}] lane title says what these are`)
    flag((h.match(/proposal__stamp/g) || []).length !== 3, `[${locale}] every proposal carries a stamp`)
    flag(!(en ? /Proposed/ : /Diusulkan/).test(t), `[${locale}] stamp text`)
    flag(!t.includes('Search — Toyota Innova Zenix') || !t.includes('innova zenix bekas'), `[${locale}] name and the keywords are written out on the card`)
    flag(!/<details/.test(h), `[${locale}] keywords sit in a details element`)
    flag(!(en ? /3 cars in stock · 1 ad groups · 4 keywords/ : /3 mobil di stok · 1 grup iklan · 4 kata kunci/).test(t), `[${locale}] facts line: ${t.slice(0, 500)}`)
    flag(!(en ? /Plan it/ : /Rencanakan/).test(t) || !(en ? /Dismiss/ : /Abaikan/).test(t), `[${locale}] owner actions`)
    flag(!(en ? /Nothing has been created in Google Ads/ : /Belum ada yang dibuat di Google Ads/).test(t), `[${locale}] lane says nothing was created`)
    flag(!(en ? /Unverified/ : /Belum terverifikasi/).test(t), `[${locale}] prior basis is marked`)
    // demo: details only
    t = text(await mount(Lane, { mode: 'proposed', items: open, canEdit: false, busyIds: new Set() }))
    flag((en ? /Plan it/ : /Rencanakan/).test(t), `[${locale}] demo must not see Plan it`)
    flag(!(en ? /Details/ : /Detail/).test(t), `[${locale}] demo can open details`)
    // busy disables
    h = await mount(Lane, { mode: 'proposed', items: open, canEdit: true, busyIds: new Set([open[0].id]) })
    flag(!/disabled/.test(h), `[${locale}] busy proposal disables its actions`)
    // ---- planned lane
    h = await mount(Lane, { mode: 'planned', items: planned, canEdit: true, busyIds: new Set() }); t = text(h)
    flag(!(en ? /Planned campaigns/ : /Kampanye yang direncanakan/).test(t) || !(en ? /Planned/ : /Direncanakan/).test(t), `[${locale}] planned lane title and stamp`)
    flag(!/proposal--planned/.test(h) || /proposal--proposed/.test(h), `[${locale}] planned cards look different from proposed ones`)
    flag(!(en ? /I created it in Google Ads/ : /Sudah saya buat di Google Ads/).test(t), `[${locale}] I created it`)
    flag((en ? /Plan it/ : /Rencanakan/).test(t), `[${locale}] a planned card cannot be planned again`)
    flag(!(en ? /cannot create campaigns/ : /belum bisa membuat kampanye/).test(t), `[${locale}] must say Pitstop cannot create campaigns yet`)
    // escaping
    const evil = JSON.parse(JSON.stringify(open[0])); evil.payload.name = '<img src=x onerror=alert(1)>'; evil.payload.ad_groups[0].keywords[0].text = '<script>x</script>'
    const eh = await mount(Lane, { mode: 'proposed', items: [evil], canEdit: true, busyIds: new Set() })
    flag(/<img src=x|<script>x/.test(eh), `[${locale}] unescaped text`)
    // ---- section: both lanes, or nothing at all
    t = text(await mount(Section, { suggestions: fx.FIXTURE_SUGGESTIONS, canEdit: true, busyIds: new Set() }))
    flag(!(en ? /New campaigns the AI proposes/ : /Kampanye baru yang diusulkan AI/).test(t) || !(en ? /Planned campaigns/ : /Kampanye yang direncanakan/).test(t), `[${locale}] section shows both lanes`)
    h = await mount(Section, { suggestions: fx.FIXTURE_SUGGESTIONS.filter((s) => s.type !== 'new_campaign'), canEdit: true, busyIds: new Set() })
    flag(/proposal__stamp|New campaigns the AI/.test(h), `[${locale}] no proposals -> section renders nothing`)
    h = await mount(Section, { suggestions: [], canEdit: true, busyIds: new Set() })
    flag(text(h).trim().length > 0 && /proposal/.test(h), `[${locale}] empty section is empty`)
  }
  console.log(bad ? `${bad} PROBLEM(S)` : 'PROPOSAL LANES CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
