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
  const load = async (f) => (await server.ssrLoadModule(`/src/features/keyword-optimizer/${f}`)).default
  const [CorkBoard, Headline, Legend, Drawer, Note] = await Promise.all(['CorkBoard.vue', 'BoardHeadline.vue', 'BoardLegend.vue', 'NoteDrawer.vue', 'StickyNote.vue'].map(load))
  const m = await server.ssrLoadModule('/src/features/keyword-optimizer/boardModel.ts')
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  const notes = m.buildNotes(fx.FIXTURE_KEYWORD_ROWS, fx.FIXTURE_KEYWORD_SUMMARY.items, fx.FIXTURE_SUGGESTIONS)
  const all = { campaignId: null, verdict: 'all', showAll: false }
  const vis = m.visibleNotes(notes, all)
  let problems = 0
  const flag = (cond, msg) => { if (cond) { problems++; console.log('PROBLEM:', msg) } }
  const mount = async (C, props) => {
    const router = vr.createRouter({ history: vr.createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
    router.push('/'); await router.isReady()
    const app = vue.createSSRApp(C, props); app.use(router); app.use(i18n)
    return renderToString(app)
  }
  const textOf = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const common = (name, locale, html) => {
    const text = textOf(html)
    const missing = text.match(/keywordOptimizer\.[A-Za-z_.]+|keywordTable\.[A-Za-z_.]+/g)
    flag(missing, `[${locale}] ${name} missing keys ${[...new Set(missing || [])].slice(0, 5)}`)
    flag(/undefined|NaN|\[object|Infinity/.test(text), `[${locale}] ${name} bad value: ${text.match(/.{0,40}(undefined|NaN|\[object|Infinity).{0,40}/)?.[0]}`)
    return text
  }
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale
    const h = m.headline(fx.FIXTURE_SUGGESTIONS), nums = m.boardNumbers(notes)
    let html = await mount(Headline, { headline: h, numbers: nums, noRunYet: false })
    let text = common('Headline', locale, html)
    if (locale === 'en') {
      flag(!text.includes('14 things to do this week'), 'headline plural 14: ' + text.slice(0, 120))
      flag(!/5 to stop wasting money/.test(text) || !/3 to do more of what works/.test(text) || !/6 new to try/.test(text), 'headline parts: ' + text.slice(0, 220))
    }
    html = await mount(Headline, { headline: { total: 1, stop: 1, grow: 0, fresh: 0 }, numbers: nums, noRunYet: false })
    if (locale === 'en') flag(!textOf(html).includes('1 thing to do this week'), 'singular headline')
    html = await mount(Headline, { headline: { total: 0, stop: 0, grow: 0, fresh: 0 }, numbers: { nowhereMicros: null, winnersMicros: null }, noRunYet: true })
    text = common('Headline(noRun)', locale, html)
    flag(!text.includes('—'), 'null money numbers should show a dash')
    html = await mount(Legend, {}); common('Legend', locale, html)
    html = await mount(CorkBoard, { notes: vis.shown, hidden: vis.hidden, ideas: m.looseIdeas(fx.FIXTURE_SUGGESTIONS), canEdit: true, appliedCount: 1, dismissedCount: 0 })
    text = common('CorkBoard', locale, html)
    flag((html.match(/class="note /g) || []).length !== vis.shown.length, `note count ${(html.match(/class="note /g) || []).length} != ${vis.shown.length}`)
    flag(!/draggable="true"/.test(html), 'owner tapes should be draggable')
    flag(/Show \d+ more keywords|Tampilkan \d+ kata kunci lagi/.test(text) !== (vis.hidden > 0), 'show-all button state')
    // read-only demo: nothing draggable, bins say view only
    html = await mount(CorkBoard, { notes: vis.shown, hidden: 0, ideas: m.looseIdeas(fx.FIXTURE_SUGGESTIONS), canEdit: false, appliedCount: 0, dismissedCount: 0 })
    flag(/draggable="true"/.test(html), 'demo must not get draggable tapes')
    flag(!/View only|Hanya lihat/.test(textOf(html)), 'demo bins should say view only')
    // empty board
    html = await mount(CorkBoard, { notes: [], hidden: 0, ideas: [], canEdit: true, appliedCount: 0, dismissedCount: 0 })
    flag(!/No keywords match this filter|Tidak ada kata kunci/.test(textOf(html)), 'empty board message')
    // a note with no verdict (older backend): no sticker, still renders
    const bare = { ...notes[0], verdict: null, summary: null }
    html = await mount(Note, { note: bare, canEdit: true }); common('Note(no verdict)', locale, html)
    flag(/class="note__sticker/.test(html), 'no verdict must mean no sticker')
    // evil text stays text
    const evil = { ...notes[0], text: '<img src=x onerror=alert(1)>' }
    html = await mount(Note, { note: evil, canEdit: true })
    flag(/<img src=x/.test(html), 'unescaped keyword text')
    // drawer
    html = await mount(Drawer, { note: notes.find((n) => n.keywordId === 33), suggestions: notes.find((n) => n.keywordId === 33).all, canEdit: true, busyIds: new Set() })
    text = common('Drawer', locale, html)
    flag(!/role="dialog"/.test(html) || !/aria-modal="true"/.test(html), 'drawer dialog semantics')
    html = await mount(Drawer, { note: null, suggestions: fx.FIXTURE_SUGGESTIONS.filter((s) => s.id === 107), canEdit: false, busyIds: new Set() })
    text = common('Drawer(idea)', locale, html)
    flag(/<button[^>]*>\s*(Mark applied|Tandai diterapkan)/.test(html), 'demo drawer must not offer Mark applied')
  }
  console.log(problems ? `${problems} PROBLEM(S)` : 'BOARD UI CHECKS PASSED')
  process.exitCode = problems ? 1 : 0
} finally { await server.close() }
