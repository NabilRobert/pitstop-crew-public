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
  const { renderToString } = await import(pathToFileURL(nodeModule(root, 'vue/server-renderer/index.mjs')).href)
  globalThis.document = { documentElement: { dataset: {} } }
  const { i18n } = await server.ssrLoadModule('/src/i18n/index.ts')
  const View = (await server.ssrLoadModule('/src/features/keyword-optimizer/LaunchesLogView.vue')).default
  let bad = 0
  const flag = (c, m) => { if (c) { bad++; console.log('PROBLEM:', m) } }
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  const items = [
    { id: 3, created_at: '2026-10-08T06:30:00Z', mode: 'simulated', status: 'created', suggestion_id: 204, campaign: { id: 901, name: 'Search — Honda HR-V' }, objects: [{ kind: 'campaign', name: 'x', detail: 'paused' }], messages: ['Created in the demo data, paused.'], validate_only: false },
    { id: 2, created_at: '2026-10-08T06:29:00Z', mode: 'simulated', status: 'validated', suggestion_id: 204, campaign: null, objects: [], messages: ['Simulated check passed.'], validate_only: true },
    { id: 1, created_at: '2026-10-08T06:00:00Z', mode: 'simulated', status: 'failed', suggestion_id: 7, campaign: null, objects: [], messages: ['Duplicate campaign name.'], validate_only: false },
  ]
  const mount = async (props) => { const app = vue.createSSRApp(View, props); app.use(i18n); return renderToString(app) }
  for (const locale of ['en', 'id']) {
    i18n.global.locale.value = locale; const en = locale === 'en'
    let h = await mount({ items }); let t = text(h)
    flag(/campaignsList\./.test(t), `[${locale}] missing keys: ${t.match(/campaignsList\.[A-Za-z_.]+/g)}`)
    flag(/undefined|NaN|\[object|Infinity/.test(t), `[${locale}] bad value`)
    flag(!(en ? /Launches/ : /Peluncuran/).test(t) || !(en ? /Show the log/ : /Tampilkan catatan/).test(t), `[${locale}] collapsed by default with a Show button`)
    flag(/<li/.test(h), `[${locale}] entries are hidden until opened`)
    flag(!/aria-expanded="false"/.test(h), `[${locale}] state exposed`)
    flag(!(en ? /Every attempt to create a campaign/ : /Setiap percobaan membuat kampanye/).test(t) || !(en ? /nothing here was sent to Google Ads/ : /tidak ada yang dikirim ke Google Ads/).test(t), `[${locale}] says it is simulated`)
    // opened: every attempt is listed, newest first, with its status, the validate-only marker and its messages
    h = await mount({ items, startOpen: true }); t = text(h)
    flag((h.match(/<li/g) || []).length !== 3, `[${locale}] one entry per launch`)
    flag(!t.includes('Search — Honda HR-V') || !(en ? /Suggestion #204/ : /Saran #204/).test(t) || !(en ? /Suggestion #7/ : /Saran #7/).test(t), `[${locale}] campaign name, or the suggestion when there is none`)
    flag(!(en ? /Created/ : /Dibuat/).test(t) || !(en ? /Checked/ : /Diperiksa/).test(t) || !(en ? /Failed/ : /Gagal/).test(t), `[${locale}] statuses`)
    flag(!(en ? /check only/ : /hanya pemeriksaan/).test(t), `[${locale}] validate-only marker`)
    flag(!/Duplicate campaign name\./.test(t), `[${locale}] messages shown`)
    flag(t.indexOf('Honda HR-V') > t.indexOf('Suggestion #7') && en, `[${locale}] newest first`)
    flag(!(en ? /Simulated/ : /Simulasi/).test(t), `[${locale}] each entry says Simulated`)
    const evil = [{ ...items[0], campaign: { id: 1, name: '<img src=x onerror=alert(1)>' }, messages: ['<script>x</script>'] }]
    flag(/<img src=x|<script>x/.test(await mount({ items: evil, startOpen: true })), `[${locale}] unescaped log text`)
    t = text(await mount({ items: [] }))
    flag(!/3|0/.test(t), `[${locale}] empty count`)
  }
  console.log(bad ? `${bad} PROBLEM(S)` : 'LAUNCH LOG CHECKS PASSED')
  process.exitCode = bad ? 1 : 0
} finally { await server.close() }
