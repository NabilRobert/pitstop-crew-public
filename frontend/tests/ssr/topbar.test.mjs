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
  globalThis.document = { documentElement: { dataset: {} } } // theme.ts writes data-theme; vue is already loaded without a DOM
  const { i18n } = await server.ssrLoadModule('/src/i18n/index.ts')
  const TopBar = (await server.ssrLoadModule('/src/app/TopBar.vue')).default
  let problems = 0
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale
    const router = vr.createRouter({ history: vr.createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
    router.push('/keyword-optimizer'); await router.isReady()
    const app = vue.createSSRApp(TopBar); app.use(router); app.use(i18n); app.provide('dataSource', vue.ref('demo'))
    const html = await renderToString(app)
    const nav = html.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? ''
    const links = (nav.match(/<a /g) || []).length
    const nowrap = (nav.match(/whitespace-nowrap/g) || []).length
    const aria = (nav.match(/aria-current="page"/g) || []).length
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    console.log(`[${locale}] nav links=${links} nowrap=${nowrap} active=${aria} overflow-x-auto=${/overflow-x-auto/.test(nav)}`)
    if (links === 0 || nowrap !== links || aria !== 1 || !/overflow-x-auto/.test(nav)) { problems++; console.log('  PROBLEM in nav markup') }
    if (/topBar\.[a-zA-Z]+/.test(text) || /undefined|NaN/.test(text)) { problems++; console.log('  MISSING KEY / BAD VALUE', text.slice(0,200)) }
    // brand + controls must come before the nav, so the nav is its own full-width row
    if (html.indexOf('<nav') < html.indexOf('LOG OUT'.toLowerCase()) && html.indexOf('<nav') < html.search(/EN\b/)) { problems++; console.log('  nav is not last') }
  }
  console.log(problems ? `${problems} PROBLEM(S)` : 'TOPBAR CHECKS PASSED')
  process.exitCode = problems ? 1 : 0
} finally { await server.close() }
