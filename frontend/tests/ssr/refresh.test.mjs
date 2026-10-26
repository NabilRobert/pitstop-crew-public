import { nodeModule } from './nodeModule.mjs'
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
  const vue = await import(pathToFileURL(nodeModule(root, 'vue/index.mjs')).href)
  const { renderToString } = await import(pathToFileURL(nodeModule(root, 'vue/server-renderer/index.mjs')).href)
  globalThis.document = { documentElement: { dataset: {} }, hidden: false }
  const { useKeywordOptimizer } = await server.ssrLoadModule('/src/features/keyword-optimizer/useKeywordOptimizer.ts')
  const sug = (id, status) => ({ id, status, type: 'new_campaign' })
  let body
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/keyword-optimizer/run')) return { ok: true, status: 202, json: async () => ({ run_id: 7 }) }
    return { ok: true, status: 200, json: async () => body }
  }
  let reloads = 0
  const out = {}
  await renderToString(vue.createSSRApp({ setup() { Object.assign(out, useKeywordOptimizer(() => { reloads++ })); return () => null } }))
  body = { items: [sug(1, 'open')], total: 1, run: { id: 6, status: 'success', finished_at: 'a' }, inventory: { source: 'demo', snapshot_on: null } }
  await out.reload()
  eq('loaded', out.items.value.length, 1)
  eq('quiet refresh with no change', await out.refresh(), false)
  await out.runNow()
  eq('waiting after run now', [out.waitingForRun.value, out.runMessage.value], [true, '7'])
  body = { ...body, run: { id: 7, status: 'running', finished_at: null } }
  eq('running run is a change', await out.refresh(), true)
  eq('still waiting while running', out.waitingForRun.value, true)
  body = { items: [sug(1, 'open'), sug(2, 'open'), sug(3, 'open')], total: 3, run: { id: 7, status: 'success', finished_at: 'b' }, inventory: { source: 'demo', snapshot_on: null } }
  eq('finished run brings the new suggestions', await out.refresh(), true)
  eq('suggestions now 3', out.items.value.length, 3)
  eq('waiting cleared and banner dropped', [out.waitingForRun.value, out.runMessage.value], [false, null])
  eq('loading never flipped by refresh', out.loading.value, false)
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ detail: 'x' }) })
  eq('a failed quiet check changes nothing', [await out.refresh(), out.error.value, out.items.value.length], [false, null, 3])
  console.log(bad ? `${bad} FAILED` : 'REFRESH CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
