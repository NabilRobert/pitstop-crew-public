import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const req = createRequire(path.join(root, 'package.json'))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', configFile: path.join(root, 'vite.config.ts') })
let bad = 0
const eq = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.log('FAIL', n, JSON.stringify(a), JSON.stringify(b)) } }
try {
  const vue = await import(pathToFileURL(path.join(root, 'node_modules/vue/index.mjs')).href)
  const { renderToString } = await import(pathToFileURL(path.join(root, 'node_modules/vue/server-renderer/index.mjs')).href)
  globalThis.document = { documentElement: { dataset: {} }, hidden: false }
  const { useCampaignsList } = await server.ssrLoadModule('/src/features/dashboard/useCampaignsList.ts')
  const sug = (id, status) => ({ id, status, type: 'new_campaign', payload: { kind: 'new_campaign' }, campaign: null, ad_group: null })
  let list = { items: [sug(1, 'open')], total: 1, run: { id: 6, status: 'success', finished_at: 'a' }, inventory: { source: 'demo', snapshot_on: null } }
  let hits = 0
  globalThis.fetch = async (url) => {
    const u = String(url)
    let b = []
    if (u.includes('suggestions')) { hits++; b = list }
    else if (u.includes('summary')) b = { items: [] }
    return { ok: true, status: 200, json: async () => b }
  }
  const out = {}
  await renderToString(vue.createSSRApp({ setup() { Object.assign(out, useCampaignsList(vue.ref(90))); return () => null } }))
  await new Promise((r) => setTimeout(r, 50))
  eq('first load done', [out.loading.value, out.suggestions.value.length], [false, 1])
  eq('first check sets the baseline, no reload', await out.checkForNewResults(), false)
  eq('nothing new', await out.checkForNewResults(), false)
  list = { items: [sug(1, 'open'), sug(2, 'planned')], total: 2, run: { id: 7, status: 'success', finished_at: 'b' }, inventory: { source: 'demo', snapshot_on: null } }
  const before = out.loading.value
  const p = out.checkForNewResults()
  eq('quiet: loading not set', out.loading.value, before)
  eq('a new run is noticed', await p, true)
  eq('new suggestions shown', out.suggestions.value.length, 2)
  eq('error untouched', out.error.value, null)
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ detail: 'x' }) })
  eq('a failed check does nothing', [await out.checkForNewResults(), out.error.value, out.suggestions.value.length], [false, null, 2])
  console.log(bad ? `${bad} FAILED` : 'REFRESH LIST CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
