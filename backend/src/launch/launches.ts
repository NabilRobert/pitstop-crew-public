// Contract 3.6 — POST /launches and GET /launches
// (docs/overhaul-v3-backend.md section 11.9). One transaction per call: the
// checks (decideLaunch in plan.ts), the write through the writer
// ads_write_mode names (writer.ts), the suggestions' move to applied with
// linked_campaign set, and the audit row. A failed write rolls back to a
// savepoint and is still audited, in the same transaction. Nothing is sent
// to Google Ads.
//
// The audit table keeps its own columns (status 'rejected' for a refused
// call, http_status, problems, plan, created) and, since the master text,
// `request` and `result`: the contract's Launch as it was answered, which
// GET /launches lists with the row's own id.

import type { PoolClient } from 'pg'
import { query, withTransaction } from '../data/db.js'
import { getSettings } from '../platform/settings.js'
import { adSettingsFrom } from '../optimizer/engineData.js'
import { intParam, type Parsed } from '../reporting/keywordSuggestions.js'
import type { NewAdPayload, NewCampaignPayload } from '../optimizer/types.js'
import {
  SIMULATED_NOTE,
  buildAdPlan,
  buildCampaignPlan,
  decideLaunch,
  parseLaunchBody,
  planObjects,
  validatePlan,
  type Launch,
  type LaunchAd,
  type LaunchCreated,
  type LaunchListItem,
  type LaunchPlan,
} from './plan.js'
import { writerFor } from './writer.js'

type Client = Pick<PoolClient, 'query'>
type AuditStatus = 'validated' | 'created' | 'rejected' | 'failed'
type LaunchResult = Omit<Launch, 'id'>

export interface LaunchDeps {
  getSettings: () => Promise<Record<string, string>>
  withTransaction: <T>(fn: (client: Client) => Promise<T>) => Promise<T>
  now: () => Date
}

const defaultDeps: LaunchDeps = { getSettings, withTransaction, now: () => new Date() }

export interface LaunchAnswer {
  http: number
  launch: Launch | null // the 200 body
  detail: string | null // the error body's detail otherwise
}

interface AuditRow {
  id: number
  suggestion_id: number | null
  campaign_name: string | null
  mode: string
  validate_only: boolean
  status: AuditStatus
  http_status: number
  problems: string[]
  plan: (LaunchPlan | Omit<Extract<LaunchPlan, { kind: 'new_campaign' }>, 'kind'>) | null
  created: LaunchCreated | null
  requested_by: 'owner' | 'demo'
  requested_at: Date | string
  result: LaunchResult | null
}

async function audit(
  client: Client,
  a: {
    suggestion_id: number | null
    campaign_name: string | null
    mode: string
    validate_only: boolean
    status: AuditStatus
    http_status: number
    problems: string[]
    plan: LaunchPlan | null
    created: LaunchCreated | null
    requested_by: 'owner' | 'demo'
    request: unknown
    result: LaunchResult
  }
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO launches (suggestion_id, campaign_name, mode, validate_only, status, http_status, problems, plan, created, requested_by,
                           campaign_id, request, result, requested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb, $13::jsonb, $14)
     RETURNING id`,
    [
      a.suggestion_id,
      a.campaign_name,
      a.mode,
      a.validate_only,
      a.status,
      a.http_status,
      JSON.stringify(a.problems),
      a.plan === null ? null : JSON.stringify(a.plan),
      a.created === null ? null : JSON.stringify(a.created),
      a.requested_by,
      a.result.campaign?.id ?? null,
      JSON.stringify(a.request),
      JSON.stringify(a.result),
      a.result.created_at,
    ]
  )
  return rows[0].id
}

/** The request as audited: the three body fields only. */
function requestOf(rawBody: unknown): Record<string, unknown> {
  const b = rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>) : {}
  return { suggestion_id: b.suggestion_id ?? null, confirm_name: b.confirm_name ?? null, validate_only: b.validate_only ?? null }
}

/** POST /launches for the owner. */
export async function performLaunch(rawBody: unknown, deps: LaunchDeps = defaultDeps): Promise<LaunchAnswer> {
  const settings = await deps.getSettings()
  const mode = settings.ads_write_mode
  const body = parseLaunchBody(rawBody)
  const createdAt = deps.now().toISOString()
  return deps.withTransaction(async (client) => {
    const row =
      body.suggestionId === null
        ? null
        : ((await client.query<{ id: number; suggestion_type: string; status: string; payload: unknown }>(
            'SELECT id, suggestion_type, status, payload FROM keyword_suggestions WHERE id = $1 FOR UPDATE',
            [body.suggestionId]
          )).rows[0] ?? null)

    let plan: LaunchPlan | null = null
    let ads: LaunchAd[] = []
    let confirmName: string | null = null
    let campaignName: string | null = null
    let targetKind: NewAdPayload['target']['kind'] | null = null
    if (row?.suggestion_type === 'new_campaign') {
      const proposal = row.payload as NewCampaignPayload
      confirmName = campaignName = proposal.name
      // Its planned ads are created with it.
      ads = (
        await client.query<LaunchAd>(
          `SELECT id, payload FROM keyword_suggestions
           WHERE suggestion_type = 'new_ad' AND status = 'planned'
             AND payload->'target'->>'kind' = 'proposed_campaign' AND payload->'target'->>'campaign_suggestion_id' = $1::text
           ORDER BY id
           FOR UPDATE`,
          [row.id]
        )
      ).rows
      plan = buildCampaignPlan(proposal, ads)
    } else if (row?.suggestion_type === 'new_ad') {
      const ad: LaunchAd = { id: row.id, payload: row.payload as NewAdPayload }
      targetKind = ad.payload.target.kind
      if (ad.payload.target.kind === 'existing_ad_group') {
        const [ag] = (
          await client.query<{ id: number; name: string; campaign_id: number; campaign_name: string }>(
            `SELECT ag.id, ag.name, c.id AS campaign_id, c.name AS campaign_name
             FROM ad_groups ag JOIN campaigns c ON c.id = ag.campaign_id WHERE ag.id = $1`,
            [ad.payload.target.ad_group_id]
          )
        ).rows
        if (ag) {
          confirmName = ag.name
          campaignName = ag.campaign_name
          ads = [ad]
          plan = buildAdPlan(ad, { id: ag.id, name: ag.name, campaignId: ag.campaign_id, campaignName: ag.campaign_name })
        }
      }
    }

    let hasCreatedLaunch = false
    let checked = { problems: [] as string[], messages: [] as string[] }
    if (row && plan) {
      hasCreatedLaunch = ((await client.query("SELECT 1 FROM launches WHERE suggestion_id = $1 AND status = 'created' LIMIT 1", [row.id])).rowCount ?? 0) > 0
      const names = (await client.query<{ name: string }>('SELECT name FROM campaigns')).rows.map((r) => r.name)
      checked = validatePlan(plan, ads, {
        existingCampaignNames: names,
        settings: adSettingsFrom(settings),
        budgetFloorIdr: Number(settings.campaign_daily_budget_floor_idr),
        budgetCeilingIdr: Number(settings.campaign_daily_budget_ceiling_idr),
      })
    }

    const decision = decideLaunch({
      body,
      writeEnabled: settings.ads_write_enabled === 'true',
      suggestion: row ? { type: row.suggestion_type, status: row.status, targetKind, confirmName } : null,
      hasCreatedLaunch,
      planProblems: checked.problems,
    })
    const base = { suggestion_id: body.suggestionId, campaign_name: campaignName, mode, validate_only: body.validateOnly, requested_by: 'owner' as const, request: requestOf(rawBody) }
    const result = (status: Launch['status'], messages: string[], withPlan: boolean, campaign: Launch['campaign'] = null): LaunchResult => ({
      created_at: createdAt,
      mode,
      status,
      suggestion_id: body.suggestionId,
      campaign,
      objects: withPlan && plan ? planObjects(plan) : [],
      messages,
    })

    if (decision.action === 'refuse') {
      const r = result('failed', decision.planChecked ? [...checked.messages, ...decision.problems] : decision.problems, decision.planChecked)
      await audit(client, { ...base, status: 'rejected', http_status: decision.http, problems: decision.problems, plan: decision.planChecked ? plan : null, created: null, result: r })
      return { http: decision.http, launch: null, detail: decision.problems.join('; ') }
    }
    if (decision.action === 'validated') {
      const r = result('validated', [...checked.messages, 'Validate only: nothing was created.', SIMULATED_NOTE], true)
      await audit(client, { ...base, status: 'validated', http_status: 200, problems: [], plan, created: null, result: r })
      return { http: 200, launch: { id: null, ...r }, detail: null }
    }

    // The write: everything up to the audit row commits together, or the
    // savepoint takes it all back and the failure alone is recorded.
    await client.query('SAVEPOINT launch_write')
    try {
      const created = await writerFor(mode).create(client, plan!)
      await client.query(
        `UPDATE keyword_suggestions SET status = 'applied', linked_campaign_id = $2, status_changed_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::int[])`,
        [[row!.id, ...(plan!.kind === 'new_campaign' ? ads.map((a) => a.id) : [])], created.campaign_id]
      )
      const r = result('created', [...checked.messages, SIMULATED_NOTE], true, { id: created.campaign_id, name: plan!.campaign.name })
      const id = await audit(client, { ...base, status: 'created', http_status: 200, problems: [], plan, created, result: r })
      return { http: 200, launch: { id, ...r }, detail: null }
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT launch_write')
      const message = err instanceof Error ? err.message : String(err)
      const r = result('failed', [...checked.messages, `The write failed and was rolled back; nothing was kept: ${message}`], true)
      await audit(client, { ...base, status: 'failed', http_status: 500, problems: [message], plan, created: null, result: r })
      return { http: 500, launch: null, detail: `the simulated write failed and was rolled back: ${message}` }
    }
  })
}

export const DEMO_REFUSAL = 'This demo account is read-only.'

/** A demo POST /launches is audited before demoReadOnly answers 403. */
export async function recordDemoRefusal(rawBody: unknown, deps: LaunchDeps = defaultDeps): Promise<number> {
  const { ads_write_mode: mode } = await deps.getSettings()
  const body = parseLaunchBody(rawBody)
  const createdAt = deps.now().toISOString()
  return deps.withTransaction(async (client) => {
    const name =
      body.suggestionId === null
        ? null
        : ((
            await client.query<{ name: string | null }>(
              "SELECT payload->>'name' AS name FROM keyword_suggestions WHERE id = $1 AND suggestion_type = 'new_campaign'",
              [body.suggestionId]
            )
          ).rows[0]?.name ?? null)
    return audit(client, {
      suggestion_id: body.suggestionId,
      campaign_name: name,
      mode,
      validate_only: body.validateOnly,
      status: 'rejected',
      http_status: 403,
      problems: [DEMO_REFUSAL],
      plan: null,
      created: null,
      requested_by: 'demo',
      request: requestOf(rawBody),
      result: { created_at: createdAt, mode, status: 'failed', suggestion_id: body.suggestionId, campaign: null, objects: [], messages: [DEMO_REFUSAL] },
    })
  })
}

// --- GET /launches -------------------------------------------------------------

export function parseLaunchListQuery(q: Record<string, unknown>): Parsed<{ limit: number }> {
  const limit = intParam(q.limit, 'limit', 20, 1, 100)
  return limit.ok ? { ok: true, value: { limit: limit.value } } : limit
}

/** One audit row as a listed Launch. Rows written before the master text
 * have no `result`: theirs is rebuilt from the audit columns. */
export function toListItem(r: AuditRow): LaunchListItem {
  if (r.result) return { ...r.result, id: r.id, validate_only: r.validate_only }
  const plan = r.plan === null ? null : 'kind' in r.plan ? r.plan : ({ kind: 'new_campaign', ...r.plan } as LaunchPlan)
  return {
    id: r.id,
    validate_only: r.validate_only,
    created_at: new Date(r.requested_at).toISOString(),
    mode: r.mode,
    status: r.status === 'rejected' ? 'failed' : r.status,
    suggestion_id: r.suggestion_id,
    campaign: r.created ? { id: r.created.campaign_id, name: r.campaign_name ?? '' } : null,
    objects: plan ? planObjects(plan) : [],
    messages: r.problems,
  }
}

export async function listLaunches(q: { limit: number }): Promise<LaunchListItem[]> {
  const rows = await query<AuditRow>('SELECT * FROM launches ORDER BY requested_at DESC, id DESC LIMIT $1', [q.limit])
  return rows.map(toListItem)
}
