import { nodeModule } from './nodeModule.mjs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const req = createRequire(path.join(root, 'package.json'))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
// minimal browser stubs for modules that touch storage at import time
const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', configFile: path.join(root, 'vite.config.ts') })
try {
  const { createSSRApp } = await import(pathToFileURL(nodeModule(root, 'vue/index.mjs')).href)
  const { renderToString } = await import(pathToFileURL(nodeModule(root, 'vue/server-renderer/index.mjs')).href)
  const { i18n } = await server.ssrLoadModule('/src/i18n/index.ts')
  const Card = (await server.ssrLoadModule('/src/features/keyword-optimizer/SuggestionCard.vue')).default
  const Inv = (await server.ssrLoadModule('/src/features/keyword-optimizer/InventoryPanel.vue')).default
  const Export = (await server.ssrLoadModule('/src/features/keyword-optimizer/NegativesExportPanel.vue')).default
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  const view = await server.ssrLoadModule('/src/features/keyword-optimizer/suggestionView.ts')
  let problems = 0
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale
    for (const s of fx.FIXTURE_SUGGESTIONS) {
      const app = createSSRApp(Card, { suggestion: s, canEdit: true, busy: false })
      app.use(i18n)
      const html = await renderToString(app)
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      // untranslated keys show up as the raw key path
      const missing = text.match(/keywordOptimizer\.[A-Za-z_.]+/g)
      if (missing) { problems++; console.log(`[${locale}] #${s.id} MISSING KEYS`, missing) }
      if (/undefined|NaN|\[object/.test(text)) { problems++; console.log(`[${locale}] #${s.id} BAD VALUE`, text.slice(0, 300)) }
      if (locale === 'en') console.log(`#${s.id} ${s.type}: ${view.suggestionTitle(s, (k, p) => i18n.global.t(k, p))}`)
    }
    // demo/read-only: no action buttons
    const ro = createSSRApp(Card, { suggestion: fx.FIXTURE_SUGGESTIONS[0], canEdit: false, busy: false }); ro.use(i18n)
    const roHtml = await renderToString(ro)
    if (/<button/.test(roHtml)) { problems++; console.log(`[${locale}] read-only card still renders buttons`) }
    const ex = createSSRApp(Export, { count: 3 }); ex.use(i18n)
    const exHtml = (await renderToString(ex)).replace(/<[^>]+>/g, ' ')
    if (/keywordOptimizer\./.test(exHtml)) { problems++; console.log(`[${locale}] export panel missing keys`) }
  }
  // XSS: search-term text must be escaped
  const evil = { ...fx.FIXTURE_SUGGESTIONS[0], payload: { kind: 'negative_keyword', text: '<img src=x onerror=alert(1)>', match_type: 'phrase', scope: 'campaign', collisions: [{ search_term: '<script>x</script>', conversions: 1 }] }, explanation: '<b>bold</b>' }
  const a = createSSRApp(Card, { suggestion: evil, canEdit: true, busy: false }); a.use(i18n)
  const evilHtml = await renderToString(a)
  if (/<img src=x|<script>x|<b>bold/.test(evilHtml)) { problems++; console.log('UNESCAPED HTML RENDERED') } else console.log('escaping ok')
  console.log(problems === 0 ? 'ALL RENDER CHECKS PASSED' : `${problems} PROBLEM(S)`)
  process.exitCode = problems ? 1 : 0
} finally { await server.close() }
