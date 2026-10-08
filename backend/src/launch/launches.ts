// Contract 3.6 step d — POST /launches and GET /launches
// (docs/overhaul-v3-backend.md section 11.9). One transaction per call: the
// checks (decideLaunch in plan.ts), the write through the writer
// ads_write_mode names (writer.ts), the proposal's and its ads' move to
// applied, and the audit row. A writer failure rolls back to before the
// write and is still audited. Nothing is sent to Google Ads.

import type { PoolClient } from 'pg'
import { query, withTransaction } from '../data/db.js'
import { DATA_SOURCE } from '../platform/config.js'
import { getSettings } from '../platform/settings.js'
import { adSettingsFrom } from '../optimizer/engineData.js'
import { intParam, type Parsed } from '../reporting/keywordSuggestions.js'
import type { NewCampaignPayload } from '../optimizer/types.js'
import { buildPlan, decideLaunch, parseLaunchBody, validatePlan, type Launch, type LaunchAd, type LaunchCreated, type LaunchPlan, type LaunchStatus } from './plan.js'
import { writerFor } from './writer.js'

type Client = Pick<PoolClient, 'query'>

export interface LaunchDeps {
  getSettings: () => Promise<Record<string, string>>
  withTransaction: <T>(fn: (client: Client) => Promise<T>) => Promise<T>
  dataSource: string
}

const defaultDeps: LaunchDeps = { getSettings, withTransaction, dataSource: DATA_SOURCE }

interface LaunchRow {
  id: number
  suggestion_id: number | null
  campaign_name: string | null
  mode: string
  validate_only: boolean
  status: LaunchStatus
  http_status: number
  problems: string[]
  plan: LaunchPlan | null
  created: LaunchCreated | null
  requested_by: 'owner' | 'demo'
  requested_at: Date | string
}

const toLaunch = (r: LaunchRow): Launch => ({ ...r, requested_at: new Date(r.requested_at).toISOString() })

async function audit(
  client: Client,
  a: Omit<Launch, 'id' | 'requested_at'>
): Promise<Launch> {
  const { rows } = await client.query<LaunchRow>(
    `INSERT INTO launches (suggestion_id, campaign_name, mode, validate_only, status, http_status, problems, plan, created, requested_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)
     RETURNING *`,
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
    ]
  )
  return toLaunch(rows[0])
}

/** The proposal's ads: its new_ad suggestions with basis new_campaign that
 * are open or planned, by its id or (stored in another run) by its target. */
async function loadProposalAds(client: Client, suggestionId: number, fingerprint: string): Promise<LaunchAd[]> {
  const { rows } = await client.query<LaunchAd>(
    `SELECT id, payload FROM keyword_suggestions
     WHERE suggestion_type = 'new_ad' AND status IN ('open', 'planned') AND payload->>'basis' = 'new_campaign'
       AND (payload->>'campaign_suggestion_id' = $1::text OR payload->>'ad_target' LIKE $2)
     ORDER BY id
     FOR UPDATE`,
    [suggestionId, `proposal:${fingerprint}|%`]
  )
  return rows
}

/** POST /launches for the owner. Answers the HTTP status and the audit row. */
export async function performLaunch(rawBody: unknown, deps: LaunchDeps = defaultDeps): Promise<{ http: number; launch: Launch }> {
  const settings = await deps.getSettings()
  const mode = settings.ads_write_mode
  const body = parseLaunchBody(rawBody)
  return deps.withTransaction(async (client) => {
    const row =
      body.suggestionId === null
        ? null
        : ((
            await client.query<{ id: number; suggestion_type: string; status: string; payload: unknown; fingerprint: string }>(
              'SELECT id, suggestion_type, status, payload, fingerprint FROM keyword_suggestions WHERE id = $1 FOR UPDATE',
              [body.suggestionId]
            )
          ).rows[0] ?? null)
    const proposal = row?.suggestion_type === 'new_campaign' ? (row.payload as NewCampaignPayload) : null

    let hasCreatedLaunch = false
    let ads: LaunchAd[] = []
    let plan: LaunchPlan | null = null
    let planProblems: string[] = []
    if (row && proposal) {
      hasCreatedLaunch = ((await client.query("SELECT 1 FROM launches WHERE suggestion_id = $1 AND status = 'created' LIMIT 1", [row.id])).rowCount ?? 0) > 0
      ads = await loadProposalAds(client, row.id, row.fingerprint)
      plan = buildPlan(proposal, ads)
      const names = (await client.query<{ name: string }>('SELECT name FROM campaigns')).rows.map((r) => r.name)
      planProblems = validatePlan(plan, ads, { existingCampaignNames: names, settings: adSettingsFrom(settings) })
    }

    const decision = decideLaunch({
      body,
      suggestion: row ? { type: row.suggestion_type, status: row.status, name: proposal?.name ?? null } : null,
      hasCreatedLaunch,
      planProblems,
      writeEnabled: settings.ads_write_enabled === 'true',
    })
    const base = {
      suggestion_id: body.suggestionId,
      campaign_name: proposal?.name ?? null,
      mode,
      validate_only: body.validateOnly,
      requested_by: 'owner' as const,
    }

    if (decision.action === 'refuse') {
      const launch = await audit(client, { ...base, status: 'rejected', http_status: decision.http, problems: decision.problems, plan: decision.planChecked ? plan : null, created: null })
      return { http: decision.http, launch }
    }
    if (decision.action === 'validated') {
      return { http: 200, launch: await audit(client, { ...base, status: 'validated', http_status: 200, problems: [], plan, created: null }) }
    }

    // The write: everything up to the audit row commits together, or the
    // savepoint takes it all back and the failure alone is recorded.
    await client.query('SAVEPOINT launch_write')
    try {
      const created = await writerFor(mode, deps.dataSource).create(client, plan!)
      const adIds = plan!.ad_groups.flatMap((g) => g.ads.map((a) => a.suggestion_id))
      await client.query(
        `UPDATE keyword_suggestions SET status = 'applied', linked_campaign_id = $2, status_changed_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::int[])`,
        [[row!.id, ...adIds], created.campaign_id]
      )
      return { http: 201, launch: await audit(client, { ...base, status: 'created', http_status: 201, problems: [], plan, created }) }
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT launch_write')
      const message = err instanceof Error ? err.message : String(err)
      return { http: 500, launch: await audit(client, { ...base, status: 'failed', http_status: 500, problems: [`the writer failed, nothing was kept: ${message}`], plan, created: null }) }
    }
  })
}

export const DEMO_REFUSAL = 'This demo account is read-only.'

/** A demo POST /launches is audited before demoReadOnly answers 403. */
export async function recordDemoRefusal(rawBody: unknown, deps: Pick<LaunchDeps, 'getSettings' | 'withTransaction'> = defaultDeps): Promise<Launch> {
  const { ads_write_mode: mode } = await deps.getSettings()
  const body = parseLaunchBody(rawBody)
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
    })
  })
}

// --- GET /launches -------------------------------------------------------------

export interface LaunchListQuery {
  suggestionId: number | null
  limit: number
  offset: number
}

export function parseLaunchListQuery(q: Record<string, unknown>): Parsed<LaunchListQuery> {
  const suggestion = intParam(q.suggestion_id, 'suggestion_id', -1, 1, 2_147_483_647)
  if (!suggestion.ok) return suggestion
  const limit = intParam(q.limit, 'limit', 50, 1, 200)
  if (!limit.ok) return limit
  const offset = intParam(q.offset, 'offset', 0, 0, 2_147_483_647)
  if (!offset.ok) return offset
  return { ok: true, value: { suggestionId: suggestion.value === -1 ? null : suggestion.value, limit: limit.value, offset: offset.value } }
}

export async function listLaunches(q: LaunchListQuery) {
  const rows = await query<LaunchRow>(
    `SELECT * FROM launches WHERE ($1::int IS NULL OR suggestion_id = $1)
     ORDER BY requested_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [q.suggestionId, q.limit, q.offset]
  )
  const [{ total }] = await query<{ total: number }>('SELECT COUNT(*)::int AS total FROM launches WHERE ($1::int IS NULL OR suggestion_id = $1)', [q.suggestionId])
  const settings = await getSettings()
  return {
    items: rows.map(toLaunch),
    total,
    write: { enabled: settings.ads_write_enabled === 'true', mode: settings.ads_write_mode },
  }
}
