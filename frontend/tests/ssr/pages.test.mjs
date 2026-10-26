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
  let problems = 0
  const pages = { EngineeringNotes: '/src/features/engineering-notes/EngineeringNotesPage.vue', HowItWorks: '/src/features/how-it-works/HowItWorksPage.vue', ApiReference: '/src/features/api-reference/ApiReferencePage.vue', Settings: '/src/features/settings/SettingsPage.vue' }
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale
    for (const [name, file] of Object.entries(pages)) {
      const C = (await server.ssrLoadModule(file)).default
      const router = vr.createRouter({ history: vr.createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
      router.push('/'); await router.isReady()
      const app = vue.createSSRApp(C); app.use(router); app.use(i18n)
      const html = await renderToString(app)
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      const missing = text.match(/\b(engineeringNotes|howItWorks|apiReference|settings|keywordOptimizer)\.[A-Za-z_.]+/g)
      const ko = /keyword-optimizer/.test(html)
      if (missing) { problems++; console.log(`[${locale}] ${name} MISSING`, [...new Set(missing)].slice(0, 6)) }
      if (/undefined|NaN|\[object/.test(text)) { problems++; console.log(`[${locale}] ${name} BAD VALUE`) }
      if (name !== 'Settings' && !ko) { problems++; console.log(`[${locale}] ${name} has no keyword-optimizer section`) }
      if (name === 'ApiReference') {
        for (const needle of ['PATCH', '/keyword-suggestions/:id', '/keyword-optimizer/run', 'bearer token']) if (!text.includes(needle)) { problems++; console.log(`[${locale}] ApiReference missing "${needle}"`) }
        if (/No auth on this boundary/.test(text)) { problems++; console.log('stale auth line still present') }
      }
    }
  }
  console.log(problems ? `${problems} PROBLEM(S)` : 'PAGE CHECKS PASSED')
  process.exitCode = problems ? 1 : 0
} finally { await server.close() }
