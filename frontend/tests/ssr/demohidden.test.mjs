// What the read-only demo account does not get: menu entries and typed-in addresses for the private pages and the docs.
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const req = createRequire(path.join(root, 'package.json'))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', configFile: path.join(root, 'vite.config.ts') })
let bad = 0
const eq = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.log('FAIL', n, JSON.stringify(a), JSON.stringify(b)) } }
try {
  const { navLinks, isDemoHidden } = await server.ssrLoadModule('/src/app/navLinks.ts')
  for (const p of ['/how-it-works', '/engineering-notes', '/api-reference', '/aska', '/time-machine', '/how-it-works/anything']) eq(`hidden ${p}`, isDemoHidden(p), true)
  for (const p of ['/', '/settings', '/campaigns', '/campaigns/3', '/keyword-optimizer', '/inventory', '/reports', '/reports/daily/4', '/system-health', '/learning', '/runs/12', '/how-it-works-not']) eq(`visible ${p}`, isDemoHidden(p), false)
  const demoMenu = navLinks.filter((l) => !isDemoHidden(l.to)).map((l) => l.to)
  eq('demo menu', demoMenu, ['/', '/campaigns', '/keyword-optimizer', '/inventory', '/reports', '/system-health', '/learning', '/settings'])
  eq('owner keeps every link', navLinks.length, 12)
  console.log(bad ? `${bad} FAILED` : 'DEMO HIDDEN CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
