// Contract 3.6 — the AdsWriter (docs/overhaul-v3-backend.md 11.9).
// The only writer is SimulatedAdsWriter: it writes a launched campaign (or
// one ad into an existing ad group) into this app's own tables as
// data_source 'demo' rows, the campaign flagged simulated, every object
// paused. Nothing here talks to Google Ads, and there is no live writer.

import type { PoolClient } from 'pg'
import type { LaunchCreated, LaunchPlan, PlannedAd } from './plan.js'

export interface AdsWriter {
  mode: 'simulated'
  /** Writes `plan` inside the caller's transaction. */
  create(client: Pick<PoolClient, 'query'>, plan: LaunchPlan): Promise<LaunchCreated>
}

// The contract: simulated rows are demo data, whatever the app runs on.
const DATA_SOURCE = 'demo'

export class SimulatedAdsWriter implements AdsWriter {
  readonly mode = 'simulated' as const

  async create(client: Pick<PoolClient, 'query'>, plan: LaunchPlan): Promise<LaunchCreated> {
    const id = async (sql: string, params: unknown[]) => (await client.query<{ id: number }>(sql, params)).rows[0].id
    const insertAd = (adGroupId: number, a: PlannedAd) =>
      id(
        `INSERT INTO ads (ad_group_id, label, headlines, descriptions, final_url, status, data_source)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7) RETURNING id`,
        [adGroupId, `Pitcrew ad #${a.suggestion_id}`, JSON.stringify(a.headlines), JSON.stringify(a.descriptions), a.final_url, a.status, DATA_SOURCE]
      )

    if (plan.kind === 'new_ad') {
      return { campaign_id: plan.campaign.id, ad_group_ids: [], keyword_ids: [], ad_ids: [await insertAd(plan.ad_group.id, plan.ad)], negative_keyword_ids: [] }
    }

    const created: LaunchCreated = { campaign_id: 0, ad_group_ids: [], keyword_ids: [], ad_ids: [], negative_keyword_ids: [] }
    created.campaign_id = await id(
      `INSERT INTO campaigns (name, status, data_source, simulated, daily_budget_micros) VALUES ($1, $2, $3, TRUE, $4) RETURNING id`,
      [plan.campaign.name, plan.campaign.status, DATA_SOURCE, plan.campaign.daily_budget_micros]
    )
    for (const g of plan.ad_groups) {
      const adGroupId = await id(`INSERT INTO ad_groups (campaign_id, name, status, data_source) VALUES ($1, $2, $3, $4) RETURNING id`, [
        created.campaign_id,
        g.name,
        g.status,
        DATA_SOURCE,
      ])
      created.ad_group_ids.push(adGroupId)
      for (const k of g.keywords) {
        created.keyword_ids.push(
          await id(`INSERT INTO keywords (ad_group_id, text, match_type, status, data_source) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [
            adGroupId,
            k.text,
            k.match_type,
            k.status,
            DATA_SOURCE,
          ])
        )
      }
      for (const a of g.ads) created.ad_ids.push(await insertAd(adGroupId, a))
    }
    for (const n of plan.negatives) {
      created.negative_keyword_ids.push(
        await id(
          `INSERT INTO negative_keywords (scope, campaign_id, text, match_type, source, data_source)
           VALUES ('campaign', $1, $2, $3, 'applied_suggestion', $4) RETURNING id`,
          [created.campaign_id, n.text, n.match_type, DATA_SOURCE]
        )
      )
    }
    return created
  }
}

/** The writer `ads_write_mode` names. Only 'simulated' exists. */
export function writerFor(mode: string): AdsWriter {
  if (mode === 'simulated') return new SimulatedAdsWriter()
  throw new Error(`no ads writer for mode "${mode}" (only "simulated" exists)`)
}
