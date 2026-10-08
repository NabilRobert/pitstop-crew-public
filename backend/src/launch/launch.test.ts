// Contract 3.6 — the simulated launch without a database: the plans, their
// validation (checks against the current settings, budget bounds, duplicate
// names), the order of the refusals, the simulated writer, POST /launches end
// to end over a scripted fake client (one transaction, one audit row per
// call, a failed write rolled back but still audited, the master's Launch
// shape), GET /launches items, and the demo refusal.

import { describe, it, expect } from 'vitest'
import { SWITCHED_OFF, buildAdPlan, buildCampaignPlan, decideLaunch, parseLaunchBody, planObjects, validatePlan, type LaunchAd, type LaunchState, type PlanContext } from './plan.js'
import { SimulatedAdsWriter, writerFor } from './writer.js'
import { DEMO_REFUSAL, parseLaunchListQuery, performLaunch, recordDemoRefusal, toListItem, type LaunchDeps } from './launches.js'
import { auditDemoLaunch } from '../api/routes/launches.js'
import { checkAd, templateCopy, toTexts } from '../optimizer/adCopy.js'
import { buildFacts, copyContext, type AdSettings } from '../optimizer/ads.js'
import type { AdTarget, NewAdPayload, NewCampaignPayload } from '../optimizer/types.js'
import type { Vehicle } from '../optimizer/inventory/types.js'

const SETTINGS: AdSettings = {
  dealerName: 'Pitstop Used Cars',
  dealerCity: 'Tangerang',
  dealerArea: 'Gading Serpong',
  dealerWhatsapp: '0812-5550-0123',
  landingUrl: null,
  claims: { installments: true, trade_in: true, test_drive: true, inspection: true },
  inspectionWording: 'Unit sudah melalui pemeriksaan',
}
const RAW_SETTINGS: Record<string, string> = {
  dealer_name: 'Pitstop Used Cars',
  dealer_city: 'Tangerang',
  dealer_area: 'Gading Serpong',
  dealer_whatsapp: '0812-5550-0123',
  dealer_landing_url: '',
  ads_claim_installments: 'true',
  ads_claim_trade_in: 'true',
  ads_claim_test_drive: 'true',
  ads_claim_inspection: 'true',
  ads_inspection_wording: 'Unit sudah melalui pemeriksaan',
  ads_write_enabled: 'true',
  ads_write_mode: 'simulated',
  campaign_daily_budget_floor_idr: '20000',
  campaign_daily_budget_ceiling_idr: '100000',
}
const PLAN_CTX: PlanContext = { existingCampaignNames: ['Search — Generic'], settings: SETTINGS, budgetFloorIdr: 20_000, budgetCeilingIdr: 100_000 }

const NAME = 'Search — Stock — Toyota Innova'
const proposal: NewCampaignPayload = {
  kind: 'new_campaign',
  basis: 'aging_stock',
  name: NAME,
  theme: null,
  ad_groups: [
    {
      name: 'Toyota Innova',
      keywords: [
        { text: 'innova bekas', match_type: 'phrase', source: 'existing_keyword' },
        { text: 'Innova Bekas', match_type: 'phrase', source: 'stock' }, // same keyword, other case
        { text: 'toyota innova bekas', match_type: 'exact', source: 'stock' },
      ],
      vehicle_ids: [1, 2],
    },
  ],
  starter_negatives: [{ text: 'rental', match_type: 'broad' }],
  budget: { daily_micros: 50_000_000_000, target_cpa_micros: null, assumptions: { allowed_spend_share: 0.2, lead_to_sale_rate: 0.1 }, bound: null },
  stock: { units: 2, avg_days_listed: 40, avg_margin_idr: 12_000_000, total_value_idr: 579_000_000, snapshot_on: '2026-10-06' },
  overlaps: [],
}

const car = (id: number, priceIdr: number, year: number): Vehicle => ({
  id: String(id),
  make: 'Toyota',
  model: 'Innova',
  year,
  mileageKm: 40_000,
  priceIdr,
  acquisitionCostIdr: priceIdr - 12_000_000,
  status: 'available',
  listedOn: '2026-09-01',
  soldOn: null,
})

function ad(id: number, target: AdTarget = { kind: 'proposed_campaign', campaign_suggestion_id: 50, ad_group_name: 'Toyota Innova' }, over: Partial<NewAdPayload> = {}): LaunchAd {
  const facts = buildFacts([car(1, 279_000_000, 2022), car(2, 300_000_000, 2023)], 'Toyota', 'Innova', SETTINGS, '2026-10-06')!
  const t = templateCopy(facts, copyContext(SETTINGS), ['innova bekas'])
  return {
    id,
    payload: {
      kind: 'new_ad',
      target,
      basis: target.kind === 'proposed_campaign' ? 'new_campaign' : 'weak_ad',
      headlines: toTexts(t.headlines),
      descriptions: toTexts(t.descriptions),
      path1: t.path1,
      path2: t.path2,
      final_url: null,
      facts,
      winner_keywords: [],
      replaces_ad: null,
      checks: checkAd(t, facts, copyContext(SETTINGS)).flags,
      polished: false,
      ...over,
    },
  }
}
const groupAd = (id: number) => ad(id, { kind: 'existing_ad_group', ad_group_id: 5 })

describe('parseLaunchBody', () => {
  it('needs a positive integer suggestion_id and a string confirm_name; validate_only defaults to false', () => {
    expect(parseLaunchBody({ suggestion_id: 5, confirm_name: NAME })).toEqual({ suggestionId: 5, confirmName: NAME, validateOnly: false, problems: [] })
    expect(parseLaunchBody({ suggestion_id: '5', confirm_name: 3, validate_only: 'yes' }).problems).toHaveLength(3)
    expect(parseLaunchBody(null).problems).toHaveLength(2)
  })
})

describe('plans and their validation', () => {
  it('pauses everything, drops a repeated keyword, puts each planned ad in its ad group and the negatives at campaign level', () => {
    const plan = buildCampaignPlan(proposal, [ad(60)])
    if (plan.kind !== 'new_campaign') throw new Error('expected a campaign plan')
    expect(plan.campaign).toEqual({ name: NAME, daily_budget_micros: 50_000_000_000, status: 'paused' })
    expect(plan.ad_groups[0].keywords.map((k) => [k.text, k.match_type, k.status])).toEqual([
      ['innova bekas', 'phrase', 'paused'],
      ['toyota innova bekas', 'exact', 'paused'],
    ])
    expect(plan.ad_groups[0].ads.map((a) => [a.suggestion_id, a.status, a.headlines[0]])).toEqual([[60, 'paused', 'Toyota Innova Bekas']])
    expect(plan.negatives).toEqual([{ text: 'rental', match_type: 'broad' }])
    const v = validatePlan(plan, [ad(60)], PLAN_CTX)
    expect(v.problems).toEqual([])
    expect(v.messages.join(' ')).toContain('Daily budget Rp 50.000 is within Rp 20.000–Rp 100.000')
    expect(v.messages.join(' ')).toContain('no final URL yet')
  })

  it('lists the objects a Launch reports', () => {
    const kinds = planObjects(buildCampaignPlan(proposal, [ad(60)])).map((o) => o.kind)
    expect(kinds).toEqual(['budget', 'campaign', 'ad_group', 'keyword', 'keyword', 'ad', 'negative'])
    const one = planObjects(buildAdPlan(groupAd(61), { id: 5, name: 'Model — Toyota', campaignId: 2, campaignName: 'Search — Model' }))
    expect(one).toEqual([{ kind: 'ad', name: 'Pitcrew ad #61', detail: expect.stringContaining('"Model — Toyota" (Search — Model)') }])
  })

  it('refuses an existing campaign name, an ad group without keywords, and a budget outside the floor/ceiling settings', () => {
    const empty = { ...proposal, ad_groups: [{ ...proposal.ad_groups[0], keywords: [] }] }
    const v = validatePlan(buildCampaignPlan(empty, []), [], { ...PLAN_CTX, existingCampaignNames: [` ${NAME.toUpperCase()} `] })
    expect(v.problems.join('\n')).toContain('already exists')
    expect(v.problems.join('\n')).toContain('has no keyword')
    const big = validatePlan(buildCampaignPlan(proposal, []), [], { ...PLAN_CTX, budgetCeilingIdr: 40_000 })
    expect(big.problems).toEqual(['the daily budget Rp 50.000 is outside the bounds Rp 20.000–Rp 40.000'])
    // A ceiling below the floor: the floor wins (contract 3.4).
    expect(validatePlan(buildCampaignPlan(proposal, []), [], { ...PLAN_CTX, budgetFloorIdr: 50_000, budgetCeilingIdr: 10_000 }).problems).toEqual([])
  })

  it('checks the ads against the current settings: a trade-in line fails once the claim is switched off', () => {
    const a = ad(60)
    expect(a.payload.headlines.map((h) => h.text)).toContain('Terima Tukar Tambah')
    const off = { ...SETTINGS, claims: { ...SETTINGS.claims, trade_in: false } }
    expect(validatePlan(buildCampaignPlan(proposal, [a]), [a], { ...PLAN_CTX, settings: off }).problems.join()).toContain('trade-in')
  })
})

describe('decideLaunch', () => {
  const ok: LaunchState = {
    body: { suggestionId: 50, confirmName: NAME, validateOnly: false, problems: [] },
    writeEnabled: true,
    suggestion: { type: 'new_campaign', status: 'planned', targetKind: null, confirmName: NAME },
    hasCreatedLaunch: false,
    planProblems: [],
  }
  const http = (s: LaunchState) => {
    const d = decideLaunch(s)
    return d.action === 'refuse' ? d.http : d.action
  }

  it('answers in the section 11.9 order: body, kill switch, then the suggestion, then the plan', () => {
    expect(http(ok)).toBe('write')
    expect(http({ ...ok, body: { ...ok.body, problems: ['x'] }, writeEnabled: false })).toBe(400)
    expect(http({ ...ok, writeEnabled: false, suggestion: null })).toBe(409)
    expect(decideLaunch({ ...ok, writeEnabled: false })).toMatchObject({ problems: [SWITCHED_OFF] })
    expect(http({ ...ok, suggestion: null })).toBe(404)
    expect(http({ ...ok, suggestion: { ...ok.suggestion!, status: 'open', type: 'pause_keyword' } })).toBe(409)
    expect(http({ ...ok, suggestion: { ...ok.suggestion!, type: 'pause_keyword' } })).toBe(400)
    expect(http({ ...ok, suggestion: { ...ok.suggestion!, type: 'new_ad', targetKind: 'proposed_campaign' } })).toBe(400)
    expect(http({ ...ok, body: { ...ok.body, confirmName: NAME.replace('—', '-') } })).toBe(400)
    expect(http({ ...ok, suggestion: { ...ok.suggestion!, confirmName: null } })).toBe(400)
    expect(http({ ...ok, hasCreatedLaunch: true, planProblems: ['bad'] })).toBe(409)
    expect(http({ ...ok, planProblems: ['bad'] })).toBe(400)
  })

  it('refuses validate_only too while the kill switch is off', () => {
    expect(http({ ...ok, body: { ...ok.body, validateOnly: true }, writeEnabled: false })).toBe(409)
    expect(http({ ...ok, body: { ...ok.body, validateOnly: true } })).toBe('validated')
  })
})

// --- a scripted client -------------------------------------------------------------

interface FakeDb {
  suggestion: { id: number; suggestion_type: string; status: string; payload: unknown } | null
  created?: boolean
  plannedAds?: LaunchAd[]
  adGroup?: { id: number; name: string; campaign_id: number; campaign_name: string } | null
  campaigns?: string[]
  failOn?: RegExp
}

function fakeDb(db: FakeDb) {
  const log: string[] = []
  const audits: Record<string, unknown>[] = []
  let nextId = 900
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim()
      log.push(s)
      if (db.failOn?.test(s)) throw new Error('disk full')
      if (/FROM keyword_suggestions WHERE id = \$1 FOR UPDATE/.test(s)) return { rows: db.suggestion ? [db.suggestion] : [], rowCount: db.suggestion ? 1 : 0 }
      if (/payload->'target'->>'kind' = 'proposed_campaign'/.test(s)) return { rows: db.plannedAds ?? [], rowCount: (db.plannedAds ?? []).length }
      if (/FROM ad_groups ag JOIN campaigns/.test(s)) return { rows: db.adGroup ? [db.adGroup] : [], rowCount: db.adGroup ? 1 : 0 }
      if (/FROM launches WHERE suggestion_id/.test(s)) return { rows: [], rowCount: db.created ? 1 : 0 }
      if (/^SELECT name FROM campaigns/.test(s)) return { rows: (db.campaigns ?? []).map((name) => ({ name })), rowCount: 0 }
      if (/payload->>'name' AS name/.test(s)) return { rows: db.suggestion ? [{ name: (db.suggestion.payload as { name: string }).name }] : [], rowCount: 1 }
      if (/^INSERT INTO launches/.test(s)) {
        const [suggestion_id, campaign_name, mode, validate_only, status, http_status, problems, plan, created, requested_by, campaign_id, request, result] = params
        const row = {
          id: audits.length + 1,
          suggestion_id,
          campaign_name,
          mode,
          validate_only,
          status,
          http_status,
          problems: JSON.parse(problems as string),
          plan: plan === null ? null : JSON.parse(plan as string),
          created: created === null ? null : JSON.parse(created as string),
          requested_by,
          campaign_id,
          request: JSON.parse(request as string),
          result: JSON.parse(result as string),
        }
        audits.push(row)
        return { rows: [{ id: row.id }], rowCount: 1 }
      }
      if (/^INSERT INTO/.test(s)) return { rows: [{ id: nextId++ }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    },
  }
  const deps = (settings: Record<string, string> = RAW_SETTINGS): LaunchDeps => ({
    getSettings: async () => settings,
    withTransaction: async (fn) => {
      log.push('BEGIN')
      const r = await fn(client as never)
      log.push('COMMIT')
      return r
    },
    now: () => new Date('2026-10-08T07:00:00.000Z'),
  })
  const writes = () => log.filter((s) => /^(INSERT INTO (campaigns|ad_groups|keywords|ads|negative_keywords)|UPDATE)/.test(s))
  return { client, deps, log, audits, writes }
}

const planned = () => ({ id: 50, suggestion_type: 'new_campaign', status: 'planned', payload: proposal })
const body = (over: Record<string, unknown> = {}) => ({ suggestion_id: 50, confirm_name: NAME, ...over })
const OFF = { ...RAW_SETTINGS, ads_write_enabled: 'false' }

describe('SimulatedAdsWriter and writerFor', () => {
  it('writes the campaign as simulated demo data with its budget, every object paused, the ad labelled, negatives at campaign level', async () => {
    const f = fakeDb({ suggestion: null })
    const created = await new SimulatedAdsWriter().create(f.client as never, buildCampaignPlan(proposal, [ad(60)]))
    expect(created.ad_group_ids).toHaveLength(1)
    expect(created.keyword_ids).toHaveLength(2)
    expect(created.ad_ids).toHaveLength(1)
    expect(created.negative_keyword_ids).toHaveLength(1)
    const inserts = f.log.filter((s) => s.startsWith('INSERT'))
    expect(inserts[0]).toMatch(/INSERT INTO campaigns \(name, status, data_source, simulated, daily_budget_micros\) VALUES \(\$1, \$2, \$3, TRUE, \$4\)/)
    expect(inserts.find((s) => s.includes('negative_keywords'))).toContain("'campaign'")
  })

  it('writes one paused ad into an existing ad group for a new_ad plan', async () => {
    const f = fakeDb({ suggestion: null })
    const created = await new SimulatedAdsWriter().create(f.client as never, buildAdPlan(groupAd(61), { id: 5, name: 'Model — Toyota', campaignId: 2, campaignName: 'Search — Model' }))
    expect(created).toEqual({ campaign_id: 2, ad_group_ids: [], keyword_ids: [], ad_ids: [900], negative_keyword_ids: [] })
    expect(f.log.filter((s) => s.startsWith('INSERT'))).toEqual([expect.stringMatching(/^INSERT INTO ads /)])
  })

  it("throws for any mode but 'simulated'", () => {
    expect(writerFor('simulated').mode).toBe('simulated')
    expect(() => writerFor('live')).toThrow(/only "simulated"/)
  })
})

describe('POST /launches (performLaunch)', () => {
  it('400 on a bad body', async () => {
    const f = fakeDb({ suggestion: planned() })
    const r = await performLaunch({ suggestion_id: 'x' }, f.deps())
    expect(r).toMatchObject({ http: 400, launch: null })
    expect(f.audits[0]).toMatchObject({ status: 'rejected', http_status: 400, suggestion_id: null })
  })

  it('409 "Creating campaigns is switched off in Settings" when ads_write_enabled is false, validate_only included', async () => {
    for (const validate_only of [false, true]) {
      const f = fakeDb({ suggestion: planned(), plannedAds: [ad(60)] })
      const r = await performLaunch(body({ validate_only }), f.deps(OFF))
      expect(r).toEqual({ http: 409, launch: null, detail: SWITCHED_OFF })
      expect(f.writes()).toEqual([])
      expect(f.audits).toHaveLength(1)
      expect(f.audits[0].result).toMatchObject({ status: 'failed', messages: [SWITCHED_OFF] })
    }
  })

  it('404 for an unknown suggestion, audited with the id it asked for', async () => {
    const f = fakeDb({ suggestion: null })
    const r = await performLaunch(body({ suggestion_id: 77 }), f.deps())
    expect(r.http).toBe(404)
    expect(f.audits[0]).toMatchObject({ suggestion_id: 77, campaign_name: null, status: 'rejected', http_status: 404 })
  })

  it('409 when not planned, and when already launched', async () => {
    expect((await performLaunch(body(), fakeDb({ suggestion: { ...planned(), status: 'open' } }).deps())).http).toBe(409)
    expect((await performLaunch(body(), fakeDb({ suggestion: planned(), created: true }).deps())).http).toBe(409)
  })

  it('400 on a wrong type, a confirm_name that is not exact, and a plan that fails validation', async () => {
    const wrong = fakeDb({ suggestion: { id: 50, suggestion_type: 'pause_keyword', status: 'planned', payload: { kind: 'pause_keyword' } } })
    expect((await performLaunch(body(), wrong.deps())).http).toBe(400)
    const f = fakeDb({ suggestion: planned(), plannedAds: [ad(60)] })
    const r = await performLaunch(body({ confirm_name: NAME.toLowerCase() }), f.deps())
    expect(r).toMatchObject({ http: 400, detail: `confirm_name must be exactly "${NAME}"` })
    const dup = await performLaunch(body(), fakeDb({ suggestion: planned(), campaigns: [NAME] }).deps())
    expect(dup).toMatchObject({ http: 400, detail: expect.stringContaining('already exists') })
  })

  it('validate_only writes nothing but its audit row and answers a Launch with id null', async () => {
    const f = fakeDb({ suggestion: planned(), plannedAds: [ad(60)] })
    const r = await performLaunch(body({ validate_only: true }), f.deps())
    expect(r.http).toBe(200)
    expect(r.launch).toMatchObject({ id: null, created_at: '2026-10-08T07:00:00.000Z', mode: 'simulated', status: 'validated', suggestion_id: 50, campaign: null })
    expect(r.launch!.objects.map((o) => o.kind)).toEqual(['budget', 'campaign', 'ad_group', 'keyword', 'keyword', 'ad', 'negative'])
    expect(r.launch!.messages.join(' ')).toContain('nothing was created')
    expect(f.writes()).toEqual([])
    expect(f.audits).toHaveLength(1)
    expect(f.audits[0]).toMatchObject({ status: 'validated', validate_only: true, request: { suggestion_id: 50, confirm_name: NAME, validate_only: true } })
  })

  it('creates everything paused in one transaction, applies the proposal and its planned ads linked to the new campaign, 200 with the Launch', async () => {
    const f = fakeDb({ suggestion: planned(), plannedAds: [ad(60)], campaigns: ['Search — Generic'] })
    const r = await performLaunch(body(), f.deps())
    expect(r.http).toBe(200)
    expect(r.launch).toMatchObject({ id: 1, status: 'created', campaign: { id: 900, name: NAME } })
    expect(r.launch!.messages.join(' ')).toContain('nothing was sent to Google Ads')
    const update = f.log.find((s) => s.startsWith('UPDATE keyword_suggestions'))!
    expect(update).toContain("status = 'applied', linked_campaign_id = $2")
    expect(f.log.filter((s) => s === 'BEGIN' || s === 'COMMIT')).toEqual(['BEGIN', 'COMMIT'])
    expect(f.audits[0]).toMatchObject({ status: 'created', http_status: 200, campaign_id: 900 })
  })

  it('launches a planned new_ad on an existing ad group, confirmed by the ad group name', async () => {
    const adRow = { id: 61, suggestion_type: 'new_ad', status: 'planned', payload: groupAd(61).payload }
    const adGroup = { id: 5, name: 'Model — Toyota', campaign_id: 2, campaign_name: 'Search — Model' }
    expect((await performLaunch({ suggestion_id: 61, confirm_name: 'Search — Model' }, fakeDb({ suggestion: adRow, adGroup }).deps())).http).toBe(400)
    const f = fakeDb({ suggestion: adRow, adGroup })
    const r = await performLaunch({ suggestion_id: 61, confirm_name: 'Model — Toyota' }, f.deps())
    expect(r.launch).toMatchObject({ status: 'created', campaign: { id: 2, name: 'Search — Model' }, objects: [{ kind: 'ad', name: 'Pitcrew ad #61' }] })
    expect(f.writes().map((s) => s.split(' (')[0])).toEqual(['INSERT INTO ads', expect.stringContaining('UPDATE keyword_suggestions')])
  })

  it('refuses a new_ad for a proposed campaign on its own (400)', async () => {
    const adRow = { id: 60, suggestion_type: 'new_ad', status: 'planned', payload: ad(60).payload }
    expect((await performLaunch({ suggestion_id: 60, confirm_name: 'Toyota Innova' }, fakeDb({ suggestion: adRow }).deps())).http).toBe(400)
  })

  it('rolls a failed write back to the savepoint and still audits it (500)', async () => {
    const f = fakeDb({ suggestion: planned(), plannedAds: [ad(60)], failOn: /^INSERT INTO ads/ })
    const r = await performLaunch(body(), f.deps())
    expect(r).toMatchObject({ http: 500, launch: null, detail: expect.stringContaining('disk full') })
    expect(f.log).toContain('ROLLBACK TO SAVEPOINT launch_write')
    expect(f.log.indexOf('ROLLBACK TO SAVEPOINT launch_write')).toBeLessThan(f.log.findIndex((s) => s.startsWith('INSERT INTO launches')))
    expect(f.audits[0]).toMatchObject({ status: 'failed', http_status: 500, created: null, result: { status: 'failed' } })
  })
})

describe('GET /launches items', () => {
  it('lists the stored Launch with the audit row id and validate_only', () => {
    const result = { created_at: '2026-10-08T07:00:00.000Z', mode: 'simulated', status: 'validated' as const, suggestion_id: 50, campaign: null, objects: [], messages: ['ok'] }
    const item = toListItem({ id: 9, suggestion_id: 50, campaign_name: NAME, mode: 'simulated', validate_only: true, status: 'validated', http_status: 200, problems: [], plan: null, created: null, requested_by: 'owner', requested_at: '2026-10-08T07:00:00Z', result })
    expect(item).toEqual({ ...result, id: 9, validate_only: true })
  })

  it('rebuilds a Launch for a row written before the master text (no result), a refusal listed as failed', () => {
    const plan = { campaign: { name: NAME, daily_budget_micros: 50_000_000_000, status: 'paused' as const }, ad_groups: [], negatives: [] }
    const item = toListItem({ id: 2, suggestion_id: 70, campaign_name: NAME, mode: 'simulated', validate_only: false, status: 'rejected', http_status: 409, problems: ['ads_write_enabled is off'], plan, created: null, requested_by: 'owner', requested_at: new Date('2026-10-08T07:06:00Z'), result: null })
    expect(item).toMatchObject({ id: 2, status: 'failed', validate_only: false, campaign: null, messages: ['ads_write_enabled is off'], created_at: '2026-10-08T07:06:00.000Z' })
    expect(item.objects.map((o) => o.kind)).toEqual(['budget', 'campaign'])
  })

  it('takes limit 1-100, default 20', () => {
    expect(parseLaunchListQuery({})).toEqual({ ok: true, value: { limit: 20 } })
    expect(parseLaunchListQuery({ limit: '100' })).toEqual({ ok: true, value: { limit: 100 } })
    expect(parseLaunchListQuery({ limit: '101' }).ok).toBe(false)
  })
})

describe('a demo launch', () => {
  it('is audited as a 403 refusal, then passed on to demoReadOnly', async () => {
    const f = fakeDb({ suggestion: planned() })
    await recordDemoRefusal(body(), f.deps())
    expect(f.audits[0]).toMatchObject({ requested_by: 'demo', status: 'rejected', http_status: 403, problems: [DEMO_REFUSAL], campaign_name: NAME, result: { status: 'failed', messages: [DEMO_REFUSAL] } })

    const recorded: unknown[] = []
    const mw = auditDemoLaunch(async (b) => (recorded.push(b), 1))
    const run = (role: string, method: string, path: string) =>
      new Promise<unknown>((resolve) => mw({ method, path, body: body() } as never, { locals: { role } } as never, resolve))
    await run('demo', 'POST', '/launches')
    await run('owner', 'POST', '/launches')
    await run('demo', 'GET', '/launches')
    expect(recorded).toHaveLength(1)
  })
})
