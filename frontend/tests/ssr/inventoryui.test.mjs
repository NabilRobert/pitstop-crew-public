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
  const View = (await server.ssrLoadModule('/src/features/keyword-optimizer/InventoryView.vue')).default
  const Table = (await server.ssrLoadModule('/src/features/keyword-optimizer/InventoryTable.vue')).default
  const fx = await server.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
  let bad = 0
  const flag = (c, m) => { if (c) { bad++; console.log('PROBLEM:', m) } }
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  const mount = async (C, props) => {
    const router = vr.createRouter({ history: vr.createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
    router.push('/'); await router.isReady()
    const app = vue.createSSRApp(C, props); app.use(router); app.use(i18n); return renderToString(app)
  }
  const inv = fx.FIXTURE_INVENTORY
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale; const en = locale === 'en'
    store.clear()
    let h = await mount(View, { inventory: inv, collapseKey: 'k1' }); let t = text(h)
    flag(/keywordOptimizer\.|inventoryPage\./.test(t), `[${locale}] missing keys: ${t.match(/keywordOptimizer\.[A-Za-z_.0-9-]+/g)}`)
    flag(/undefined|NaN|\[object|Infinity/.test(t), `[${locale}] bad value: ${t.match(/.{0,30}(undefined|NaN|\[object|Infinity).{0,30}/)?.[0]}`)
    flag(!(en ? /Hide inventory/ : /Sembunyikan inventaris/).test(t), `[${locale}] a hide button`)
    flag(!/aria-expanded="true"/.test(h), `[${locale}] hide button exposes its state`)
    flag((h.match(/<tr/g) || []).length !== 1 + inv.by_model.length, `[${locale}] one table row per model`)
    flag(!(en ? /Showing 5 of 5 models/ : /Menampilkan 5 dari 5 model/).test(t), `[${locale}] showing count: ${t.slice(0, 300)}`)
    // chips show how many models each would leave
    flag(!(en ? /Toyota \(2\)/ : /Toyota \(2\)/).test(t) && !/TOYOTA \(2\)/i.test(t), `[${locale}] make chips carry counts`)
    flag(!(en ? /In stock \(4\)/ : /Ada stok \(4\)/).test(t), `[${locale}] in-stock chip count`)
    flag(!(en ? /No stock but advertised \(1\)/ : /Tanpa stok tetapi diiklankan \(1\)/).test(t), `[${locale}] advertised-but-out chip count`)
    for (const col of ['model', 'available', 'daysListed', 'price', 'margin', 'keywords']) void col
    flag((h.match(/aria-sort="/g) || []).length !== 6, `[${locale}] every column is sortable and says its sort state`)
    flag(!/aria-sort="ascending"/.test(h), `[${locale}] the model column starts sorted ascending`)
    flag(!(en ? /advertised, no stock/ : /diiklankan, tanpa stok/).test(t), `[${locale}] Brio RS is called out`)
    // hidden: remembered, the table and filters are gone, a Show button replaces Hide
    store.set('k2', 'hidden')
    h = await mount(View, { inventory: inv, collapseKey: 'k2' }); t = text(h)
    flag(/<table/.test(h) || /type="search"/.test(h), `[${locale}] hidden inventory must not render the table or filters`)
    flag(!(en ? /Show inventory/ : /Tampilkan inventaris/).test(t), `[${locale}] show button when hidden`)
    flag(!/aria-expanded="false"/.test(h), `[${locale}] hidden state exposed`)
    // no collapse key: always open, no hide button (the dedicated page)
    t = text(await mount(View, { inventory: inv }))
    flag((en ? /Hide inventory/ : /Sembunyikan inventaris/).test(t), `[${locale}] no key -> no hide button`)
    // unavailable degrades; no filters or table
    h = await mount(View, { inventory: fx.FIXTURE_INVENTORY_UNAVAILABLE, collapseKey: 'k3' }); t = text(h)
    flag(!(en ? /Inventory is unavailable/ : /Inventaris tidak tersedia/).test(t) || /<table/.test(h), `[${locale}] unavailable state`)
    // empty list: no filter bar, no crash
    h = await mount(View, { inventory: { ...inv, by_model: [] } }); flag(/<table/.test(h) || /type="search"/.test(h), `[${locale}] no models -> no table`)
    // table: empty text and escaping
    h = await mount(Table, { rows: [], sortKey: 'model', sortDir: 'asc', emptyText: 'Nothing here' }); flag(!text(h).includes('Nothing here'), 'table empty text')
    const evil = [{ make: '<img src=x onerror=alert(1)>', model: '<script>x</script>', available: 1, avg_days_listed: 3, avg_price_idr: 1, avg_margin_idr: null, linked_keyword_count: 0 }]
    h = await mount(Table, { rows: evil, sortKey: 'price', sortDir: 'desc', emptyText: '' })
    flag(/<img src=x|<script>x/.test(h), `[${locale}] unescaped make/model`)
    flag(!/aria-sort="descending"/.test(h), `[${locale}] descending state`)
    flag(!/—/.test(text(h)), `[${locale}] null margin renders a dash, not 0`)
  }
  console.log(bad ? `${bad} PROBLEM(S)` : 'INVENTORY UI CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
