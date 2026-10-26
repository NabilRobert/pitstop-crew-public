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
  const { isUnitInterval: f } = await server.ssrLoadModule('/src/features/settings/settingsValidators.ts')
  const cases = [
    ['0.2', false, true], ['0', false, true], ['1', false, true], ['1.01', false, false], ['-0.1', false, false], ['', false, false], ['  ', false, false], ['abc', false, false], ['NaN', false, false], ['Infinity', false, false],
    ['0', true, false], ['0.05', true, true], ['1', true, true], ['0.0001', true, true],
  ]
  let bad = 0
  for (const [v, ex, want] of cases) { const got = f(v, ex); if (got !== want) { bad++; console.log('FAIL', JSON.stringify(v), 'exclusiveZero=' + ex, 'got', got, 'want', want) } }
  const { isWholeRupiah: r } = await server.ssrLoadModule('/src/features/settings/settingsValidators.ts')
  const rc = [['20000', true], [' 100000 ', true], ['1', true], ['0', false], ['', false], ['  ', false], ['-5', false], ['1.5', false], ['1e5', false], ['20.000', false], ['20,000', false], ['abc', false], ['99999999999999999999', false], ['9007199254740991', true]]
  for (const [v, want] of rc) { const got = r(v); if (got !== want) { bad++; console.log('FAIL isWholeRupiah', JSON.stringify(v), 'got', got, 'want', want) } }
  const { isValidRunTime: tm } = await server.ssrLoadModule('/src/features/settings/settingsValidators.ts')
  const tc = [['06:00', true], ['00:00', true], ['23:59', true], ['24:00', false], ['6:00', false], ['06:60', false], ['06:00:00', false], ['', false], ['ab:cd', false], [' 06:00', false]]
  for (const [v, want] of tc) { const got = tm(v); if (got !== want) { bad++; console.log('FAIL isValidRunTime', JSON.stringify(v), 'got', got, 'want', want) } }
  const D = await server.ssrLoadModule('/src/features/settings/settingsValidators.ts')
  const dc = [
    ['isDealerName', 'Pitstop Used Cars', true], ['isDealerName', '', false], ['isDealerName', '   ', false], ['isDealerName', 'x'.repeat(40), true], ['isDealerName', 'x'.repeat(41), false],
    ['isShortText', '', true], ['isShortText', 'Gading Serpong', true], ['isShortText', 'x'.repeat(41), false],
    ['isPhone', '0812-5550-0123', true], ['isPhone', '+62 812 5550 0123', true], ['isPhone', '', true], ['isPhone', '0812-5550-0123-4567-890', false], ['isPhone', '0812 abc', false], ['isPhone', '<script>', false],
    ['isLandingUrl', '', true], ['isLandingUrl', '  ', true], ['isLandingUrl', 'https://pitstop.example', true], ['isLandingUrl', 'http://x.id/a?b=1', true], ['isLandingUrl', 'ftp://x.id', false], ['isLandingUrl', 'javascript:alert(1)', false], ['isLandingUrl', 'pitstop.example', false],
  ]
  for (const [fn, v, want] of dc) { const got = D[fn](v); if (got !== want) { bad++; console.log('FAIL', fn, JSON.stringify(v).slice(0, 40), 'got', got, 'want', want) } }
  const wording = [['x'.repeat(60), true], ['x'.repeat(61), false], ['', true]]
  for (const [v, want] of wording) { const got = D.isShortText(v, 60); if (got !== want) { bad++; console.log('FAIL wording', v.length, got) } }
  console.log(bad ? `${bad} FAILED` : `all ${cases.length + rc.length + tc.length + dc.length + wording.length} validation cases pass`)
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
