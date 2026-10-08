// keyword_suggestions reads and writes for the engine
// (docs/overhaul-v3-backend.md sections 6 and 11.1). The engine decides
// what is a candidate; this file only stores the result and keeps the
// open list honest across weekly runs:
// - a candidate whose fingerprint already has an open (or applied) row is
//   not inserted again (the engine skips it);
// - an open row whose fingerprint the run did not produce at all no longer
//   applies and becomes 'superseded' — except rows that leaned on the
//   inventory when this run had none, which can't be re-checked and stay
//   open.
// rank and explanation stay NULL here: the LLM step (step 7) sets them.

import type { PoolClient } from 'pg'
import { query } from '../data/db.js'
import { DATA_SOURCE } from '../platform/config.js'
import { normalizeCampaignName } from './campaignName.js'
import type { Candidate, EngineResult, SuggestionHistory } from './engine.js'
import type { NewAdPayload } from './types.js'

/** The newest row per fingerprint, for the engine's dedupe and cooldown. */
export async function loadSuggestionHistory(): Promise<SuggestionHistory[]> {
  const rows = await query<{
    id: number
    fingerprint: string
    status: SuggestionHistory['status']
    status_changed_on: string | null
    campaign_name: string | null
    ad_target: string | null
  }>(
    `SELECT DISTINCT ON (fingerprint) id, fingerprint, status,
            to_char((status_changed_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS status_changed_on,
            CASE WHEN suggestion_type = 'new_campaign' THEN payload->>'name' END AS campaign_name,
            CASE WHEN suggestion_type = 'new_ad' THEN payload->>'ad_target' END AS ad_target
     FROM keyword_suggestions
     ORDER BY fingerprint, created_at DESC, id DESC`
  )
  return rows.map((r) => ({
    id: r.id,
    fingerprint: r.fingerprint,
    status: r.status,
    statusChangedOn: r.status_changed_on,
    campaignName: r.campaign_name,
    adTarget: r.ad_target,
  }))
}

export interface OpenRow {
  id: number
  fingerprint: string
  inventoryDependent: boolean // stored with an inventory snapshot date
}

export interface PersistencePlan {
  insert: Candidate[]
  supersedeIds: number[]
}

/** Pure: what to insert and which open rows to retire. */
export function planPersistence(result: EngineResult, open: readonly OpenRow[]): PersistencePlan {
  const produced = new Set(result.produced)
  return {
    insert: result.candidates,
    supersedeIds: open
      .filter((r) => !produced.has(r.fingerprint) && (result.inventoryAvailable || !r.inventoryDependent))
      .map((r) => r.id),
  }
}

/** Stores one engine run under `pipelineRunId`, inside the caller's
 * transaction. `newAds` (3.6) are the new_ad rows it inserted, for Kai's
 * polish. */
export async function persistSuggestions(
  client: PoolClient,
  pipelineRunId: number,
  result: EngineResult
): Promise<{ inserted: number; superseded: number; newAds: { id: number; payload: NewAdPayload }[] }> {
  const open = await client.query<{ id: number; fingerprint: string; inventory_dependent: boolean }>(
    `SELECT id, fingerprint, inventory_snapshot_on IS NOT NULL AS inventory_dependent
     FROM keyword_suggestions WHERE status = 'open' FOR UPDATE`
  )
  const plan = planPersistence(
    result,
    open.rows.map((r) => ({ id: r.id, fingerprint: r.fingerprint, inventoryDependent: r.inventory_dependent }))
  )

  if (plan.supersedeIds.length > 0) {
    await client.query(
      `UPDATE keyword_suggestions SET status = 'superseded', status_changed_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::int[]) AND status = 'open'`,
      [plan.supersedeIds]
    )
  }

  // 3.6: an ad for a campaign proposal stored in this same run gets the
  // proposal's new id (the engine couldn't know it).
  const insertedIds = new Map<string, number>()
  const newAds: { id: number; payload: NewAdPayload }[] = []
  for (const c of plan.insert) {
    const payload =
      c.payload.kind === 'new_ad' && c.payload.campaign_suggestion_id === null && typeof c.evidence.campaign_fingerprint === 'string'
        ? { ...c.payload, campaign_suggestion_id: insertedIds.get(c.evidence.campaign_fingerprint) ?? null }
        : c.payload
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO keyword_suggestions
         (pipeline_run_id, suggestion_type, campaign_id, ad_group_id, keyword_id, search_term_id,
          payload, evidence, basis, confidence, expected_impact, inventory_snapshot_on, fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb, $12, $13)
       RETURNING id`,
      [
        pipelineRunId,
        c.type,
        c.campaignId,
        c.adGroupId,
        c.keywordId,
        c.searchTermId,
        JSON.stringify(payload),
        JSON.stringify(c.evidence),
        c.basis,
        c.confidence,
        c.expectedImpact === null ? null : JSON.stringify(c.expectedImpact),
        c.inventorySnapshotOn,
        c.fingerprint,
      ]
    )
    insertedIds.set(c.fingerprint, inserted.rows[0].id)
    if (payload.kind === 'new_ad') newAds.push({ id: inserted.rows[0].id, payload })
  }
  return { inserted: plan.insert.length, superseded: plan.supersedeIds.length, newAds }
}

// --- 3.3: planned campaign proposals that became real campaigns --------------

export { normalizeCampaignName } from './campaignName.js'

/** Pure: which planned proposals now have a real campaign of the same name
 * (the lowest campaign id when two match). */
export function matchPlannedCampaigns(
  planned: readonly { id: number; name: string }[],
  campaigns: readonly { id: number; name: string }[]
): { suggestionId: number; campaignId: number }[] {
  const byName = new Map<string, number>()
  for (const c of [...campaigns].sort((a, b) => a.id - b.id)) {
    const key = normalizeCampaignName(c.name)
    if (!byName.has(key)) byName.set(key, c.id)
  }
  return planned.flatMap((p) => {
    const campaignId = byName.get(normalizeCampaignName(p.name))
    return campaignId === undefined ? [] : [{ suggestionId: p.id, campaignId }]
  })
}

/** After a data sync: every planned new_campaign whose name now exists as
 * a campaign gets linked_campaign and moves to applied (contract 3.3). The
 * engine then stops proposing it (applied fingerprints are skipped).
 * Returns how many were linked. */
export async function linkPlannedCampaigns(): Promise<number> {
  const planned = await query<{ id: number; name: string | null }>(
    "SELECT id, payload->>'name' AS name FROM keyword_suggestions WHERE status = 'planned' AND suggestion_type = 'new_campaign'"
  )
  if (planned.length === 0) return 0
  const campaigns = await query<{ id: number; name: string }>('SELECT id, name FROM campaigns WHERE data_source = $1', [DATA_SOURCE])
  const matches = matchPlannedCampaigns(
    planned.flatMap((p) => (p.name === null ? [] : [{ id: p.id, name: p.name }])),
    campaigns
  )
  let linked = 0
  for (const m of matches) {
    const rows = await query(
      `UPDATE keyword_suggestions SET status = 'applied', linked_campaign_id = $2, status_changed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'planned' RETURNING id`,
      [m.suggestionId, m.campaignId]
    )
    linked += rows.length
  }
  return linked
}
