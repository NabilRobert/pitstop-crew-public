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
  const { renderToString } = await import(pathToFileURL(path.join(root, 'node_modules/vue/server-renderer/index.mjs')).href)
  const vr = await import(pathToFileURL(path.join(root, 'node_modules/vue-router/dist/vue-router.mjs')).href)
  globalThis.document = { documentElement: { dataset: {} } }
  const { i18n } = await server.ssrLoadModule('/src/i18n/index.ts')
  const Panel = (await server.ssrLoadModule('/src/features/keyword-optimizer/KeywordBoardPanel.vue')).default
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  let bad = 0
  const flag = (c, m) => { if (c) { bad++; console.log('PROBLEM:', m) } }
  const mount = async (props) => {
    const router = vr.createRouter({ history: vr.createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
    router.push('/'); await router.isReady()
    const app = vue.createSSRApp(Panel, props); app.use(router); app.use(i18n)
    return renderToString(app)
  }
  const base = { rows: fx.FIXTURE_KEYWORD_ROWS, summaries: fx.FIXTURE_KEYWORD_SUMMARY.items, suggestions: fx.FIXTURE_SUGGESTIONS, canEdit: true, busyIds: new Set(), noRunYet: false }
  const campaign2 = fx.FIXTURE_KEYWORD_SUMMARY.items.filter((m) => m.campaign.id === 2).length
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ')
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale
    const all = await mount({ ...base, campaignId: null })
    const one = await mount({ ...base, campaignId: 2, periodDays: 7 })
    const brand = await mount({ ...base, campaignId: 1 })
    const noteCount = (h) => (h.match(/class="note /g) || []).length
    flag(noteCount(one) !== campaign2, `[${locale}] campaign 2 should show ${campaign2} notes, got ${noteCount(one)}`)
    flag(noteCount(brand) !== 2, `[${locale}] brand campaign should show 2 notes, got ${noteCount(brand)}`)
    flag(noteCount(all) < noteCount(one), `[${locale}] account-wide must show at least as many as one campaign`)
    flag(/All campaigns|Semua kampanye/.test(text(one)), `[${locale}] campaign chips must be hidden on a campaign's own page`)
    flag(!/All campaigns|Semua kampanye/.test(text(all)), `[${locale}] account-wide board must have campaign chips`)
    flag(!/Stickers are always judged|Stiker selalu dinilai/.test(text(one)), `[${locale}] period note missing when period != 90`)
    flag(/Stickers are always judged|Stiker selalu dinilai/.test(text(all)), `[${locale}] period note should not show account-wide`)
    // scoping leaks: brand campaign must not show other campaigns' advice (fortuner / mobil bekas tapes)
    flag(/Block "lowongan"|Blokir "lowongan"/.test(text(brand)), `[${locale}] campaign 1 shows campaign 2's advice`)
    flag(!/Block "lowongan"|Blokir "lowongan"/.test(text(one)), `[${locale}] campaign 2 should show its own advice`)
    for (const [n, h] of [['all', all], ['one', one], ['brand', brand]]) {
      const tx = text(h)
      flag(/keywordOptimizer\.[A-Za-z_.]+/.test(tx), `[${locale}] ${n} missing keys`)
      flag(/undefined|NaN|\[object|Infinity/.test(tx), `[${locale}] ${n} bad value`)
    }
    // search box present, and the board is told to filter (client-side filtering itself is covered in board.mjs)
    flag(!/type="search"/.test(one) || !/type="search"/.test(all), `[${locale}] search box on both boards`)
    flag(/role="status"/.test(one) && /No keyword matches|Tidak ada kata kunci yang cocok/.test(text(one)), `[${locale}] no search message before searching`)
    // no verdicts: still renders, says so, no stickers
    const bare = await mount({ ...base, summaries: [], campaignId: 2, summaryMissing: true })
    flag(/class="note__sticker/.test(bare), `[${locale}] no verdicts must mean no stickers`)
    flag(!/verdicts|penilaian/.test(text(bare)), `[${locale}] summaryMissing message`)
    // a campaign with no rows
    const empty = await mount({ ...base, rows: [], campaignId: 2 })
    flag(noteCount(empty) !== campaign2, `no rows but summaries -> a note per listed keyword (${campaign2}), got ${noteCount(empty)}`)
    const none = await mount({ ...base, rows: [], summaries: [], campaignId: 2 })
    flag(noteCount(none) !== 0, 'no rows and no summaries -> no notes')
    // paused keyword (id 67, campaign 2) is tagged, idle one (68, campaign 3) is not marked paused
    flag(!(locale === 'en' ? /Paused/ : /Dijeda/).test(text(one)), `[${locale}] paused note must carry a Paused tag`)
    flag((locale === 'en' ? /Paused/ : /Dijeda/).test(text(await mount({ ...base, campaignId: 3 }))), `[${locale}] campaign 3 has no paused keyword`)
    flag(!/note--paused/.test(one), 'paused class')
  }
  console.log(bad ? `${bad} PROBLEM(S)` : 'PANEL CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
