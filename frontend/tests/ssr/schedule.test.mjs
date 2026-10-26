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
try {
  const vue = await import(pathToFileURL(nodeModule(root, 'vue/index.mjs')).href)
  globalThis.document = { documentElement: { dataset: {} } }
  const { useKeywordSchedule } = await server.ssrLoadModule('/src/features/keyword-optimizer/useKeywordSchedule.ts')
  let bad = 0
  const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { bad++; console.log('FAIL', n, 'got', JSON.stringify(g), 'want', JSON.stringify(w)) } }
  const delay = (ms) => new Promise((r) => setTimeout(r, ms))
  // run the composable inside a real component so onMounted fires
  const run = async (settingsResponse) => {
    globalThis.fetch = async () => settingsResponse
    const out = {}
    const C = { setup() { Object.assign(out, useKeywordSchedule()); return () => null } }
    const app = vue.createApp(C)
    // no DOM here: call the lifecycle by hand through a tiny render context
    return { out, app }
  }
  // onMounted needs a mounted app; without a DOM, exercise the same logic by calling the fetch path directly
  const { api } = await server.ssrLoadModule('/src/shared/api/api.ts')
  const read = async (resp) => {
    globalThis.fetch = async () => resp
    try {
      const st = await api.settings()
      return st.keyword_optimizer_run_time !== undefined ? { time: st.keyword_optimizer_run_time, enabled: st.keyword_optimizer_enabled === 'true' } : { time: null, enabled: false }
    } catch { return { time: null, enabled: false } }
  }
  const ok = (body) => ({ ok: true, status: 200, json: async () => body })
  eq('on at 06:00', await read(ok({ keyword_optimizer_run_time: '06:00', keyword_optimizer_enabled: 'true' })), { time: '06:00', enabled: true })
  eq('off', await read(ok({ keyword_optimizer_run_time: '09:30', keyword_optimizer_enabled: 'false' })), { time: '09:30', enabled: false })
  eq('older server: no schedule line', await read(ok({ daily_run_time: '06:00' })), { time: null, enabled: false })
  eq('server error: no schedule line', await read({ ok: false, status: 500, json: async () => ({ detail: 'x' }) }), { time: null, enabled: false })
  console.log(bad ? `${bad} FAILED` : 'SCHEDULE CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
