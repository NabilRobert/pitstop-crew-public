// A throwaway fixture-backed API on :8000 so the frontend can be looked at in a browser without the backend.
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const req = createRequire(path.join(root, 'package.json'))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', configFile: path.join(root, 'vite.config.ts') })
const fx = await vite.ssrLoadModule('/src/features/keyword-optimizer/fixtures.ts')
const suggestions = structuredClone(fx.FIXTURE_SUGGESTIONS)
const rows = fx.FIXTURE_KEYWORD_ROWS
const camps = new Map()
for (const r of rows) camps.set(r.campaign_id, r.campaign)
const campaigns = [...camps].map(([id, name]) => ({ id, name, simulated: false }))
campaigns.push({ id: 999, name: 'Search — Stock — Honda Jazz (SIMULATED)', simulated: true })
const perf = []
for (const c of campaigns.filter((c) => !c.simulated)) {
  const mine = rows.filter((r) => r.campaign_id === c.id)
  for (let d = 0; d < 90; d += 3) {
    const date = new Date(Date.UTC(2026, 9, 5) - d * 86400000).toISOString().slice(0, 10)
    perf.push({ date, campaign: c.name, impressions: Math.round(mine.reduce((a, r) => a + r.impressions, 0) / 30), clicks: Math.round(mine.reduce((a, r) => a + r.clicks, 0) / 30), cost_micros: Math.round(mine.reduce((a, r) => a + r.cost_micros, 0) / 30), conversions: mine.reduce((a, r) => a + r.conversions, 0) / 30, search_impression_share: null, search_budget_lost_impression_share: null, search_rank_lost_impression_share: null })
  }
}
const settings = { daily_run_time: '06:00', weekly_run_time: '07:00', grade_forces_revision: 'true', report_recipient_email: '', report_language: 'en', auto_reports_enabled: 'false', keyword_optimizer_enabled: 'true', keyword_optimizer_run_time: '06:00', keyword_test_budget_share: '0.1', keyword_min_confidence_p: '0.8', inventory_allowed_spend_share: '0.2', inventory_lead_to_sale_rate: '0.1', campaign_daily_budget_floor_idr: '20000', campaign_daily_budget_ceiling_idr: '100000', dealer_name: 'Pitstop Used Cars', dealer_city: 'Tangerang', dealer_area: 'Gading Serpong', dealer_whatsapp: '0812-5550-0123', dealer_landing_url: '', ads_claim_installments: 'true', ads_claim_trade_in: 'true', ads_claim_test_drive: 'true', ads_claim_inspection: 'true', ads_inspection_wording: 'Unit sudah melalui pemeriksaan', ads_write_enabled: 'false', ads_write_mode: 'simulated', monthly_cost_cap_usd: '20' }
const launches = []
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); res.end(JSON.stringify(body)) }
http.createServer((rq, res) => {
  const u = new URL(rq.url, 'http://x'); const p = u.pathname
  if (rq.method === 'OPTIONS') return send(res, 204, {})
  let buf = ''; rq.on('data', (c) => (buf += c)); rq.on('end', () => {
    const body = buf ? JSON.parse(buf) : {}
    if (p === '/auth/verify') return send(res, 200, { ok: true, role: process.env.MOCK_ROLE ?? 'owner' })
    if (p === '/config') return send(res, 200, { data_source: 'demo' })
    if (p === '/campaigns') return send(res, 200, campaigns)
    if (p === '/performance') return send(res, 200, perf)
    if (p === '/keywords/performance') return send(res, 200, rows)
    if (p === '/keywords/summary') return send(res, 200, fx.FIXTURE_KEYWORD_SUMMARY)
    if (p === '/inventory/summary') return send(res, 200, fx.FIXTURE_INVENTORY)
    if (p === '/settings') { if (rq.method === 'PUT') Object.assign(settings, body); return send(res, 200, settings) }
    if (p === '/launches') return send(res, 200, launches)
    if (p === '/keyword-suggestions' && rq.method === 'GET') return send(res, 200, { ...fx.FIXTURE_SUGGESTIONS_RESPONSE, items: suggestions, total: suggestions.length })
    const m = p.match(/^\/keyword-suggestions\/(\d+)$/)
    if (m && rq.method === 'PATCH') { const s = suggestions.find((x) => x.id === +m[1]); if (s) s.status = body.status; return send(res, 200, s ?? {}) }
    send(res, 200, [])
  })
}).listen(8000, () => console.log('mock api on 8000'))
