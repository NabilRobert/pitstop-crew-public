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
  const { api, ApiError } = await server.ssrLoadModule('/src/shared/api/api.ts')
  const cases = [[404, {}, 'Request failed: 404'], [409, { detail: 'A run is in progress' }, 'A run is in progress'], [429, { detail: 'cap reached' }, 'cap reached']]
  let bad = 0
  for (const [status, body, msg] of cases) {
    globalThis.fetch = async () => ({ ok: false, status, json: async () => body })
    try { await api.keywordSuggestions({}); bad++; console.log('did not throw', status) }
    catch (e) { const ok = e instanceof ApiError && e instanceof Error && e.status === status && e.message === msg; if (!ok) { bad++; console.log('FAIL', status, e) } }
  }
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ detail: 'x' }) })
  try { await api.inventorySummary() } catch (e) { if (store.has('pitstop-auth-token')) { bad++; console.log('token not cleared on 401') } }
  console.log(bad ? `${bad} FAILED` : 'API ERROR CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
