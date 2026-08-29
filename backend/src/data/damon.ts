// Damon — data agent. Not an LLM (see agents/data.md).
//
// Demo-mode path is fully built and tested. Live-mode covers basic
// campaign performance only (PROJECT.md step 6's exact scope: "start with
// basic campaign performance, last 30 days") — untested against a real
// account, since Basic Access is still pending and the account has no
// live campaigns yet. Device/geography/demographic live segment fetching
// is a deliberate follow-up once the basic query is verified, not
// guessed at here.

import type { PoolClient } from 'pg'
import { withTransaction } from './db.js'
import { generateDay, type DayData } from './demo/generator.js'
import * as profile from './demo/profile.js'
import { getOverrides } from './demo/timeMachine.js'
import { GADS_TARGET_CUSTOMER_ID } from '../platform/config.js'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function syncDay(targetDate: string, seed = 0, dataSource = 'demo'): Promise<DayData> {
  if (dataSource !== 'demo') {
    throw new Error('syncDay is demo-only — use syncLiveWindow for live mode')
  }
  const overrides = await getOverrides()
  const dayData = generateDay(targetDate, seed, overrides)
  await withTransaction(async (client) => {
    await upsertDay(client, dayData, new Map(), new Map(), new Map(), new Map())
  })
  return dayData
}

/** Re-fetches the trailing window, not just `endDate` — see PROJECT.md →
 * Automation: Google Ads conversions can be attributed days after the
 * click, so re-upserting recent history keeps it accurate.
 *
 * Batches the whole window into one transaction/connection instead of
 * one per day (was 7 sequential round-trips to the hosted DB for a
 * 7-day window), and shares one campaign/segment id cache across all
 * days instead of re-resolving the same ~5 campaigns and ~15 segment
 * values on every single day. */
export async function syncTrailingWindow(
  endDate: string,
  days = 7,
  seed = 0,
  dataSource = 'demo'
): Promise<Array<DayData | { date: string; rowsUpserted: number }>> {
  if (dataSource === 'live') {
    const startDate = addDays(endDate, -(days - 1))
    const rowsUpserted = await syncLiveWindow(startDate, endDate)
    return [{ date: endDate, rowsUpserted }]
  }
  const overrides = await getOverrides()
  const dayDatas = Array.from({ length: days }, (_, i) => generateDay(addDays(endDate, -i), seed, overrides))
  await withTransaction(async (client) => {
    const campaignIds = new Map<string, number>()
    const segmentIds = new Map<string, number>()
    const adGroupIds = new Map<string, number>()
    const keywordIds = new Map<string, number>()
    for (const dayData of dayDatas) {
      await upsertDay(client, dayData, campaignIds, segmentIds, adGroupIds, keywordIds)
    }
  })
  return dayDatas
}

/** Basic campaign performance only — see module docstring. Returns the
 * number of campaign-day rows upserted. */
export async function syncLiveWindow(startDate: string, endDate: string): Promise<number> {
  const { getClient } = await import('./googleAdsClient.js') // deferred: avoid
  // requiring google-ads-api / credentials for demo-only usage
  const customer = getClient()

  const gaql = `
    SELECT campaign.id, campaign.name, campaign.status, segments.date,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `
  const rows = await customer.query(gaql)

  let rowsUpserted = 0
  await withTransaction(async (client) => {
    for (const row of rows as any[]) {
      const campaignId = await getOrCreateLiveCampaign(
        client,
        row.campaign.id,
        row.campaign.name,
        row.campaign.status
      )
      await client.query(
        `INSERT INTO campaign_performance
            (campaign_id, date, impressions, clicks, cost_micros, conversions)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(campaign_id, date) DO UPDATE SET
            impressions = excluded.impressions,
            clicks = excluded.clicks,
            cost_micros = excluded.cost_micros,
            conversions = excluded.conversions`,
        [
          campaignId,
          row.segments.date,
          row.metrics.impressions,
          row.metrics.clicks,
          row.metrics.cost_micros,
          row.metrics.conversions,
        ]
      )
      rowsUpserted++
    }
  })
  return rowsUpserted
}

async function getOrCreateLiveCampaign(
  client: PoolClient,
  googleCampaignId: string | number,
  name: string,
  status: string
): Promise<number> {
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM campaigns WHERE google_campaign_id = $1',
    [String(googleCampaignId)]
  )
  if (existing.rows[0]) {
    await client.query('UPDATE campaigns SET name = $1, status = $2 WHERE id = $3', [
      name,
      status,
      existing.rows[0].id,
    ])
    return existing.rows[0].id
  }
  const inserted = await client.query<{ id: number }>(
    `INSERT INTO campaigns (google_campaign_id, name, status, data_source)
     VALUES ($1, $2, $3, 'live') RETURNING id`,
    [String(googleCampaignId), name, status]
  )
  return inserted.rows[0].id
}

/** `campaignIds`/`segmentIds`/`adGroupIds`/`keywordIds` are caller-owned so
 * a multi-day sync can share one cache across the whole window instead of
 * re-resolving the same handful of natural keys on every single day. */
async function upsertDay(
  client: PoolClient,
  dayData: DayData,
  campaignIds: Map<string, number>,
  segmentIds: Map<string, number>,
  adGroupIds: Map<string, number>,
  keywordIds: Map<string, number>
): Promise<void> {
  async function campaignIdFor(key: string): Promise<number> {
    if (!campaignIds.has(key)) campaignIds.set(key, await getOrCreateCampaign(client, key))
    return campaignIds.get(key)!
  }
  async function segmentIdFor(segType: string, segValue: string): Promise<number> {
    const k = `${segType}|${segValue}`
    if (!segmentIds.has(k)) segmentIds.set(k, await getOrCreateSegment(client, segType, segValue))
    return segmentIds.get(k)!
  }
  async function adGroupIdFor(adGroupKey: string, campaignId: number): Promise<number> {
    if (!adGroupIds.has(adGroupKey)) adGroupIds.set(adGroupKey, await getOrCreateAdGroup(client, adGroupKey, campaignId))
    return adGroupIds.get(adGroupKey)!
  }
  async function keywordIdFor(keywordKey: string, adGroupId: number): Promise<number> {
    if (!keywordIds.has(keywordKey)) keywordIds.set(keywordKey, await getOrCreateKeyword(client, keywordKey, adGroupId))
    return keywordIds.get(keywordKey)!
  }

  for (const c of dayData.campaigns) {
    const campaignId = await campaignIdFor(c.campaignKey)
    await client.query(
      `INSERT INTO campaign_performance
          (campaign_id, date, impressions, clicks, cost_micros, conversions)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(campaign_id, date) DO UPDATE SET
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          cost_micros = excluded.cost_micros,
          conversions = excluded.conversions`,
      [campaignId, dayData.date, c.impressions, c.clicks, c.costMicros, c.conversions]
    )
  }

  for (const s of dayData.segments) {
    const campaignId = await campaignIdFor(s.campaignKey)
    const segmentId = await segmentIdFor(s.segmentType, s.segmentValue)
    await client.query(
      `INSERT INTO segment_performance
          (campaign_id, segment_id, date, impressions, clicks, cost_micros, conversions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(campaign_id, segment_id, date) DO UPDATE SET
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          cost_micros = excluded.cost_micros,
          conversions = excluded.conversions`,
      [campaignId, segmentId, dayData.date, s.impressions, s.clicks, s.costMicros, s.conversions]
    )
  }

  // v2 Stage 1 — ad groups + keyword performance (incl. Quality Score).
  for (const ag of dayData.adGroups) {
    const campaignId = await campaignIdFor(ag.campaignKey)
    const adGroupId = await adGroupIdFor(ag.adGroupKey, campaignId)
    await client.query(
      `INSERT INTO ad_group_performance
          (ad_group_id, date, impressions, clicks, cost_micros, conversions)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(ad_group_id, date) DO UPDATE SET
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          cost_micros = excluded.cost_micros,
          conversions = excluded.conversions`,
      [adGroupId, dayData.date, ag.impressions, ag.clicks, ag.costMicros, ag.conversions]
    )
  }

  for (const k of dayData.keywords) {
    // adGroupIds is already populated by the loop above (every keyword's
    // parent ad group is generated in the same DayData), so this is a
    // cache hit, not a second resolve-by-natural-key round trip.
    const adGroupId = adGroupIds.get(k.adGroupKey)!
    const keywordId = await keywordIdFor(k.keywordKey, adGroupId)
    await client.query(
      `INSERT INTO keyword_performance
          (keyword_id, date, impressions, clicks, cost_micros, conversions,
           quality_score, expected_ctr, ad_relevance, landing_page_experience)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT(keyword_id, date) DO UPDATE SET
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          cost_micros = excluded.cost_micros,
          conversions = excluded.conversions,
          quality_score = excluded.quality_score,
          expected_ctr = excluded.expected_ctr,
          ad_relevance = excluded.ad_relevance,
          landing_page_experience = excluded.landing_page_experience`,
      [
        keywordId,
        dayData.date,
        k.impressions,
        k.clicks,
        k.costMicros,
        k.conversions,
        k.qualityScore,
        k.expectedCtr,
        k.adRelevance,
        k.landingPageExperience,
      ]
    )
  }
}

async function getOrCreateCampaign(client: PoolClient, campaignKey: string): Promise<number> {
  const name = profile.CAMPAIGNS.find((c) => c.key === campaignKey)!.name
  const existing = await client.query<{ id: number }>(
    "SELECT id FROM campaigns WHERE name = $1 AND data_source = 'demo'",
    [name]
  )
  if (existing.rows[0]) return existing.rows[0].id
  const inserted = await client.query<{ id: number }>(
    "INSERT INTO campaigns (name, data_source, status) VALUES ($1, 'demo', 'enabled') RETURNING id",
    [name]
  )
  return inserted.rows[0].id
}

async function getOrCreateSegment(client: PoolClient, segmentType: string, segmentValue: string): Promise<number> {
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM segments WHERE segment_type = $1 AND segment_value = $2',
    [segmentType, segmentValue]
  )
  if (existing.rows[0]) return existing.rows[0].id
  const inserted = await client.query<{ id: number }>(
    'INSERT INTO segments (segment_type, segment_value) VALUES ($1, $2) RETURNING id',
    [segmentType, segmentValue]
  )
  return inserted.rows[0].id
}

async function getOrCreateAdGroup(client: PoolClient, adGroupKey: string, campaignId: number): Promise<number> {
  const name = profile.AD_GROUPS.find((ag) => ag.key === adGroupKey)!.name
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM ad_groups WHERE campaign_id = $1 AND name = $2',
    [campaignId, name]
  )
  if (existing.rows[0]) return existing.rows[0].id
  const inserted = await client.query<{ id: number }>(
    "INSERT INTO ad_groups (campaign_id, name, data_source, status) VALUES ($1, $2, 'demo', 'enabled') RETURNING id",
    [campaignId, name]
  )
  return inserted.rows[0].id
}

async function getOrCreateKeyword(client: PoolClient, keywordKey: string, adGroupId: number): Promise<number> {
  const kw = profile.KEYWORDS.find((k) => k.key === keywordKey)!
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM keywords WHERE ad_group_id = $1 AND text = $2 AND match_type = $3',
    [adGroupId, kw.text, kw.matchType]
  )
  if (existing.rows[0]) return existing.rows[0].id
  const inserted = await client.query<{ id: number }>(
    `INSERT INTO keywords (ad_group_id, text, match_type, data_source, status)
     VALUES ($1, $2, $3, 'demo', 'enabled') RETURNING id`,
    [adGroupId, kw.text, kw.matchType]
  )
  return inserted.rows[0].id
}
