// Contract 3.6 step d — the simulated launch without a database: the plan,
// its validation, the order of the refusals, the simulated writer, and
// POST /launches end to end over a scripted fake client (one transaction,
// one audit row per call, a failed write rolled back but still audited).

import { describe, it, expect } from 'vitest'
import { buildPlan, decideLaunch, parseLaunchBody, validatePlan, type LaunchAd, type LaunchState } from './plan.js'
import { SimulatedAdsWriter, writerFor } from './writer.js'
import { performLaunch, recordDemoRefusal, DEMO_REFUSAL, type LaunchDeps } from './launches.js'
import { auditDemoLaunch } from '../api/routes/launches.js'
import { checkAd, templateCopy } from '../optimizer/adCopy.js'
import { buildFacts, type AdSettings } from '../optimizer/ads.js'
import type { NewAdPayload, NewCampaignPayload } from '../optimizer/types.js'
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
}

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
} as unknown as NewCampaignPayload

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

function ad(id: number, over: Partial<NewAdPayload> = {}): LaunchAd {
  const facts = buildFacts([car(1, 279_000_000, 2022), car(2, 300_000_000, 2023)], 'Toyota', 'Innova', SETTINGS, '2026-10-06')!
  const t = templateCopy(facts, ['innova bekas'])
  return {
    id,
    payload: {
      kind: 'new_ad',
      basis: 'new_campaign',
      ad_target: `proposal:fp-campaign|Toyota Innova`,
      campaign_suggestion_id: 50,
      campaign_name: NAME,
      ad_group_name: 'Toyota Innova',
      replaces_ad_id: null,
      final_url: 'https://dealer.example.com/innova',
      final_url_source: 'account',
      path1: t.path1,
      path2: t.path2,
      headlines: t.headlines,
      descriptions: t.descriptions,
      copy_source: 'template',
      template: { headlines: t.headlines, descriptions: t.descriptions },
      facts,
      winner_keywords: [],
      checks: checkAd(t, facts),
      ...over,
    },
  }
}

describe('parseLaunchBody', () => {
  it('needs a positive integer suggestion_id and a string confirm_name; validate_only defaults to false', () => {
    expect(parseLaunchBody({ suggestion_id: 5, confirm_name: NAME })).toEqual({ suggestionId: 5, confirmName: NAME, validateOnly: false, problems: [] })
    expect(parseLaunchBody({ suggestion_id: '5', confirm_name: 3, validate_only: 'yes' }).problems).toHaveLength(3)
    expect(parseLaunchBody(null).problems).toHaveLength(2)
  })
})

describe('buildPlan and validatePlan', () => {
  it('pauses everything, drops a repeated keyword, puts the ad in its ad group and the negatives at campaign level', () => {
    const plan = buildPlan(proposal, [ad(60)])
    expect(plan.campaign).toEqual({ name: NAME, daily_budget_micros: 50_000_000_000, status: 'paused' })
    expect(plan.ad_groups[0].status).toBe('paused')
    expect(plan.ad_groups[0].keywords.map((k) => [k.text, k.match_type, k.status])).toEqual([
      ['innova bekas', 'phrase', 'paused'],
      ['toyota innova bekas', 'exact', 'paused'],
    ])
    expect(plan.ad_groups[0].ads.map((a) => [a.suggestion_id, a.status])).toEqual([[60, 'paused']])
    expect(plan.negatives).toEqual([{ text: 'rental', match_type: 'broad' }])
    expect(validatePlan(plan, [ad(60)], { existingCampaignNames: ['Search — Generic'], settings: SETTINGS })).toEqual([])
  })

  it('refuses an existing campaign name, an ad group without keywords, and an ad without a final URL', () => {
    const empty = { ...proposal, ad_groups: [{ ...proposal.ad_groups[0], keywords: [] }] } as NewCampaignPayload
    const noUrl = ad(61, { final_url: null })
    const problems = validatePlan(buildPlan(empty, [noUrl]), [noUrl], { existingCampaignNames: [` ${NAME.toUpperCase()} `], settings: SETTINGS })
    expect(problems.join('\n')).toContain('already exists')
    expect(problems.join('\n')).toContain('has no keyword')
    expect(problems.join('\n')).toContain('no final URL')
  })

  it('checks the ads against the current settings: a trade-in line fails once the claim is switched off', () => {
    const a = ad(60)
    expect(a.payload.headlines).toContain('Bisa Tukar Tambah')
    const off = { ...SETTINGS, claims: { ...SETTINGS.claims, trade_in: false } }
    expect(validatePlan(buildPlan(proposal, [a]), [a], { existingCampaignNames: [], settings: off }).join()).toContain('trade-in')
  })
})

describe('decideLaunch', () => {
  const ok: LaunchState = {
    body: { suggestionId: 50, confirmName: NAME, validateOnly: false, problems: [] },
    suggestion: { type: 'new_campaign', status: 'planned', name: NAME },
    hasCreatedLaunch: false,
    planProblems: [],
    writeEnabled: true,
  }
  const http = (s: LaunchState) => {
    const d = decideLaunch(s)
    return d.action === 'refuse' ? d.http : d.action
  }

  it('answers in the contract order', () => {
    expect(http(ok)).toBe('write')
    expect(http({ ...ok, body: { ...ok.body, problems: ['x'] }, suggestion: null })).toBe(400)
    expect(http({ ...ok, suggestion: null })).toBe(404)
    expect(http({ ...ok, suggestion: { ...ok.suggestion!, type: 'new_ad' } })).toBe(400)
    expect(http({ ...ok, body: { ...ok.body, confirmName: NAME.replace('—', '-') }, suggestion: { ...ok.suggestion!, status: 'open' } })).toBe(400)
    expect(http({ ...ok, suggestion: { ...ok.suggestion!, status: 'open' } })).toBe(409)
    expect(http({ ...ok, hasCreatedLaunch: true, planProblems: ['bad'] })).toBe(409)
    expect(http({ ...ok, planProblems: ['bad'], writeEnabled: false })).toBe(400)
    expect(http({ ...ok, writeEnabled: false })).toBe(409)
  })

  it('validate_only stops before the kill switch', () => {
    expect(http({ ...ok, body: { ...ok.body, validateOnly: true }, writeEnabled: false })).toBe('validated')
  })
})

// --- a scripted client -------------------------------------------------------------

interface FakeDb {
  suggestion: { id: number; suggestion_type: string; status: string; payload: unknown; fingerprint: string } | null
  created: boolean
  ads: LaunchAd[]
  campaigns: string[]
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
      if (/FROM launches WHERE suggestion_id/.test(s)) return { rows: [], rowCount: db.created ? 1 : 0 }
      if (/suggestion_type = 'new_ad'/.test(s)) return { rows: db.ads, rowCount: db.ads.length }
      if (/^SELECT name FROM campaigns/.test(s)) return { rows: db.campaigns.map((name) => ({ name })), rowCount: db.campaigns.length }
      if (/payload->>'name' AS name/.test(s)) return { rows: db.suggestion ? [{ name: (db.suggestion.payload as { name: string }).name }] : [], rowCount: 1 }
      if (/^INSERT INTO launches/.test(s)) {
        const [suggestion_id, campaign_name, mode, validate_only, status, http_status, problems, plan, created, requested_by] = params
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
          requested_at: '2026-10-08T07:00:00.000Z',
        }
        audits.push(row)
        return { rows: [row], rowCount: 1 }
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
    dataSource: 'demo',
  })
  const writes = () => log.filter((s) => /^(INSERT INTO (campaigns|ad_groups|keywords|ads|negative_keywords)|UPDATE)/.test(s))
  return { client, deps, log, audits, writes }
}

const planned = () => ({ id: 50, suggestion_type: 'new_campaign', status: 'planned', payload: proposal, fingerprint: 'fp-campaign' })
const body = (over: Record<string, unknown> = {}) => ({ suggestion_id: 50, confirm_name: NAME, ...over })

describe('SimulatedAdsWriter and writerFor', () => {
  it('writes the campaign as simulated, every object paused, the ad labelled, negatives at campaign level', async () => {
    const f = fakeDb({ suggestion: null, created: false, ads: [], campaigns: [] })
    const created = await new SimulatedAdsWriter('demo').create(f.client as never, buildPlan(proposal, [ad(60)]))
    expect(created.ad_group_ids).toHaveLength(1)
    expect(created.keyword_ids).toHaveLength(2)
    expect(created.ad_ids).toHaveLength(1)
    expect(created.negative_keyword_ids).toHaveLength(1)
    const inserts = f.log.filter((s) => s.startsWith('INSERT'))
    expect(inserts[0]).toMatch(/INSERT INTO campaigns \(name, status, data_source, simulated\) VALUES \(\$1, \$2, \$3, TRUE\)/)
    expect(inserts.find((s) => s.includes('negative_keywords'))).toContain("'campaign'")
    expect(inserts.find((s) => s.includes('negative_keywords'))).toContain("'applied_suggestion'")
  })

  it("throws for any mode but 'simulated'", () => {
    expect(writerFor('simulated', 'demo').mode).toBe('simulated')
    expect(() => writerFor('live', 'demo')).toThrow(/only "simulated"/)
  })
})

describe('performLaunch', () => {
  it('400 on a confirm_name that is not exact; audited, nothing written', async () => {
    const f = fakeDb({ suggestion: planned(), created: false, ads: [ad(60)], campaigns: [] })
    const r = await performLaunch(body({ confirm_name: NAME.toLowerCase() }), f.deps())
    expect(r.http).toBe(400)
    expect(r.launch).toMatchObject({ status: 'rejected', http_status: 400, plan: null, requested_by: 'owner' })
    expect(f.writes()).toEqual([])
    expect(f.audits).toHaveLength(1)
  })

  it('404 for an unknown suggestion, audited with the id it asked for', async () => {
    const f = fakeDb({ suggestion: null, created: false, ads: [], campaigns: [] })
    const r = await performLaunch(body({ suggestion_id: 77 }), f.deps())
    expect(r.http).toBe(404)
    expect(r.launch).toMatchObject({ suggestion_id: 77, campaign_name: null, status: 'rejected' })
  })

  it('409 when not planned, and when already launched', async () => {
    expect((await performLaunch(body(), fakeDb({ suggestion: { ...planned(), status: 'open' }, created: false, ads: [], campaigns: [] }).deps())).http).toBe(409)
    expect((await performLaunch(body(), fakeDb({ suggestion: planned(), created: true, ads: [], campaigns: [] }).deps())).http).toBe(409)
  })

  it('validate_only writes nothing but its audit row, even with the switch off', async () => {
    const f = fakeDb({ suggestion: planned(), created: false, ads: [ad(60)], campaigns: [] })
    const r = await performLaunch(body({ validate_only: true }), f.deps({ ...RAW_SETTINGS, ads_write_enabled: 'false' }))
    expect(r.http).toBe(200)
    expect(r.launch).toMatchObject({ status: 'validated', validate_only: true, created: null })
    expect(r.launch.plan?.campaign.status).toBe('paused')
    expect(f.writes()).toEqual([])
    expect(f.audits).toHaveLength(1)
  })

  it('409 when the kill switch is off, with the plan in the audit row', async () => {
    const f = fakeDb({ suggestion: planned(), created: false, ads: [ad(60)], campaigns: [] })
    const r = await performLaunch(body(), f.deps({ ...RAW_SETTINGS, ads_write_enabled: 'false' }))
    expect(r.http).toBe(409)
    expect(r.launch.problems).toEqual(['ads_write_enabled is off'])
    expect(r.launch.plan).not.toBeNull()
    expect(f.writes()).toEqual([])
  })

  it('creates everything paused in one transaction, applies the proposal and its ads linked to the new campaign', async () => {
    const f = fakeDb({ suggestion: planned(), created: false, ads: [ad(60)], campaigns: ['Search — Generic'] })
    const r = await performLaunch(body(), f.deps())
    expect(r.http).toBe(201)
    expect(r.launch).toMatchObject({ status: 'created', http_status: 201, mode: 'simulated', campaign_name: NAME })
    expect(r.launch.created?.ad_ids).toHaveLength(1)
    const update = f.log.find((s) => s.startsWith('UPDATE keyword_suggestions'))!
    expect(update).toContain("status = 'applied', linked_campaign_id = $2")
    expect(f.log.filter((s) => s === 'BEGIN' || s === 'COMMIT')).toEqual(['BEGIN', 'COMMIT'])
    expect(f.log.indexOf('SAVEPOINT launch_write')).toBeLessThan(f.log.findIndex((s) => s.startsWith('INSERT INTO campaigns')))
  })

  it('rolls a failed write back to the savepoint and still audits it (500)', async () => {
    const f = fakeDb({ suggestion: planned(), created: false, ads: [ad(60)], campaigns: [], failOn: /^INSERT INTO ads/ })
    const r = await performLaunch(body(), f.deps())
    expect(r.http).toBe(500)
    expect(r.launch).toMatchObject({ status: 'failed', created: null })
    expect(r.launch.problems[0]).toContain('disk full')
    expect(f.log).toContain('ROLLBACK TO SAVEPOINT launch_write')
    expect(f.log.indexOf('ROLLBACK TO SAVEPOINT launch_write')).toBeLessThan(f.log.findIndex((s) => s.startsWith('INSERT INTO launches')))
  })
})

describe('a demo launch', () => {
  it('is audited as a 403 refusal, then passed on to demoReadOnly', async () => {
    const f = fakeDb({ suggestion: planned(), created: false, ads: [], campaigns: [] })
    const launch = await recordDemoRefusal(body(), f.deps())
    expect(launch).toMatchObject({ requested_by: 'demo', status: 'rejected', http_status: 403, problems: [DEMO_REFUSAL], campaign_name: NAME })

    const recorded: unknown[] = []
    const mw = auditDemoLaunch(async (b) => (recorded.push(b), launch))
    const run = (role: string, method: string, path: string) =>
      new Promise<unknown>((resolve) => mw({ method, path, body: body() } as never, { locals: { role } } as never, resolve))
    await run('demo', 'POST', '/launches')
    await run('owner', 'POST', '/launches')
    await run('demo', 'GET', '/launches')
    expect(recorded).toHaveLength(1)
  })
})
