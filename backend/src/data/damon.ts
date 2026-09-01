// Damon — data agent. Not an LLM (see agents/data.md).
//
// Demo-mode path is fully built and tested. Live-mode covers basic
// campaign performance only (docs/PROJECT.md step 6's exact scope: "start with
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
import { getRecommendations, getChangeEvents } from './demo/scriptedEvents.js'
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
    await upsertDay(
      client,
      dayData,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map()
    )
  })
  return dayData
}

/** Re-fetches the trailing window, not just `endDate` — see docs/PROJECT.md →
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
    const searchTermIds = new Map<string, number>()
    const adIds = new Map<string, number>()
    const conversionActionIds = new Map<string, number>()
    const assetGroupIds = new Map<string, number>()
    for (const dayData of dayDatas) {
      await upsertDay(
        client,
        dayData,
        campaignIds,
        segmentIds,
        adGroupIds,
        keywordIds,
        searchTermIds,
        adIds,
        conversionActionIds,
        assetGroupIds
      )
    }
  })
  // v2 Stage 7/8 — Recommendations + change history. Unconditional, not
  // batched into the per-day loop above: these are static, episodic
  // lists (see profile.ts's RECOMMENDATIONS/CHANGE_EVENTS), idempotently
  // upserted every sync regardless of the requested window — cheap
  // (currently 4 + 4 rows).
  await syncScriptedEvents()
  return dayDatas
}

/** v2 Stage 7/8 — idempotently upserts profile.ts's static Recommendations
 * and change-events lists (via scriptedEvents.ts's pure resolvers).
 * Deliberately NOT INSERT ... ON CONFLICT despite both tables' UNIQUE
 * constraints covering exactly these columns: Postgres treats NULL as
 * distinct from NULL for uniqueness purposes, so ON CONFLICT would never
 * fire for account-level rows (campaign_id IS NULL) — every re-run would
 * insert a fresh duplicate instead of updating. `IS NOT DISTINCT FROM`
 * (NULL-safe equality) sidesteps that, so this explicit check-then-
 * insert/update works correctly for both scoped and account-level rows
 * alike (change_events also has a nullable field_changed in its unique
 * key — same treatment). */
export async function syncScriptedEvents(): Promise<void> {
  const recommendations = getRecommendations()
  await withTransaction(async (client) => {
    const campaignIds = new Map<string, number>()
    async function campaignIdFor(key: string): Promise<number> {
      if (!campaignIds.has(key)) campaignIds.set(key, await getOrCreateCampaign(client, key))
      return campaignIds.get(key)!
    }
    for (const r of recommendations) {
      const campaignId = r.campaignKey != null ? await campaignIdFor(r.campaignKey) : null
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM recommendations
         WHERE campaign_id IS NOT DISTINCT FROM $1
           AND generated_date = $2 AND recommendation_type = $3 AND title = $4`,
        [campaignId, r.generatedDate, r.recommendationType, r.title]
      )
      if (existing.rows[0]) {
        await client.query(
          `UPDATE recommendations SET
              description = $1, impact_impressions_pct = $2, impact_conversions_pct = $3,
              dismissed = $4, applied = $5
           WHERE id = $6`,
          [r.description, r.impactImpressionsPct, r.impactConversionsPct, r.dismissed, r.applied, existing.rows[0].id]
        )
      } else {
        await client.query(
          `INSERT INTO recommendations
              (campaign_id, recommendation_type, title, description,
               impact_impressions_pct, impact_conversions_pct, dismissed, applied, generated_date, data_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'demo')`,
          [
            campaignId,
            r.recommendationType,
            r.title,
            r.description,
            r.impactImpressionsPct,
            r.impactConversionsPct,
            r.dismissed,
            r.applied,
            r.generatedDate,
          ]
        )
      }
    }

    const changeEvents = getChangeEvents()
    for (const c of changeEvents) {
      const campaignId = c.campaignKey != null ? await campaignIdFor(c.campaignKey) : null
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM change_events
         WHERE campaign_id IS NOT DISTINCT FROM $1
           AND changed_at = $2 AND field_changed IS NOT DISTINCT FROM $3`,
        [campaignId, c.changedAt, c.fieldChanged]
      )
      if (existing.rows[0]) {
        await client.query(
          `UPDATE change_events SET
              resource_type = $1, change_operation = $2, old_value = $3, new_value = $4, changed_by = $5
           WHERE id = $6`,
          [c.resourceType, c.changeOperation, c.oldValue, c.newValue, c.changedBy, existing.rows[0].id]
        )
      } else {
        await client.query(
          `INSERT INTO change_events
              (campaign_id, changed_at, resource_type, change_operation,
               field_changed, old_value, new_value, changed_by, data_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'demo')`,
          [
            campaignId,
            c.changedAt,
            c.resourceType,
            c.changeOperation,
            c.fieldChanged,
            c.oldValue,
            c.newValue,
            c.changedBy,
          ]
        )
      }
    }
  })
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
  keywordIds: Map<string, number>,
  searchTermIds: Map<string, number>,
  adIds: Map<string, number>,
  conversionActionIds: Map<string, number>,
  assetGroupIds: Map<string, number>
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
  async function searchTermIdFor(searchTermKey: string, adGroupId: number, keywordId: number | null): Promise<number> {
    if (!searchTermIds.has(searchTermKey)) {
      searchTermIds.set(searchTermKey, await getOrCreateSearchTerm(client, searchTermKey, adGroupId, keywordId))
    }
    return searchTermIds.get(searchTermKey)!
  }
  async function adIdFor(adKey: string, adGroupId: number): Promise<number> {
    if (!adIds.has(adKey)) adIds.set(adKey, await getOrCreateAd(client, adKey, adGroupId))
    return adIds.get(adKey)!
  }
  async function conversionActionIdFor(conversionActionKey: string): Promise<number> {
    if (!conversionActionIds.has(conversionActionKey)) {
      conversionActionIds.set(conversionActionKey, await getOrCreateConversionAction(client, conversionActionKey))
    }
    return conversionActionIds.get(conversionActionKey)!
  }
  async function assetGroupIdFor(assetGroupKey: string, campaignId: number): Promise<number> {
    if (!assetGroupIds.has(assetGroupKey)) {
      assetGroupIds.set(assetGroupKey, await getOrCreateAssetGroup(client, assetGroupKey, campaignId))
    }
    return assetGroupIds.get(assetGroupKey)!
  }

  for (const c of dayData.campaigns) {
    const campaignId = await campaignIdFor(c.campaignKey)
    await client.query(
      // v2 Stage 4 — impression share + optimization score ride as 3
      // extra nullable columns on this same row (NULL for PMax/Display —
      // see generator.ts), not a separate table/upsert.
      `INSERT INTO campaign_performance
          (campaign_id, date, impressions, clicks, cost_micros, conversions,
           search_impression_share, search_budget_lost_impression_share, optimization_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT(campaign_id, date) DO UPDATE SET
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          cost_micros = excluded.cost_micros,
          conversions = excluded.conversions,
          search_impression_share = excluded.search_impression_share,
          search_budget_lost_impression_share = excluded.search_budget_lost_impression_share,
          optimization_score = excluded.optimization_score`,
      [
        campaignId,
        dayData.date,
        c.impressions,
        c.clicks,
        c.costMicros,
        c.conversions,
        c.searchImpressionShare,
        c.searchBudgetLostImpressionShare,
        c.optimizationScore,
      ]
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

  // v2 Stage 2 — search term performance.
  for (const st of dayData.searchTerms) {
    // adGroupIds/keywordIds are already populated by the loops above (every
    // search term's parent ad group and keyword are generated in the same
    // DayData), so both are cache hits, not extra resolve-by-natural-key
    // round trips.
    const adGroupId = adGroupIds.get(st.adGroupKey)!
    const keywordId = keywordIds.get(st.keywordKey) ?? null
    const searchTermId = await searchTermIdFor(st.searchTermKey, adGroupId, keywordId)
    await client.query(
      `INSERT INTO search_term_performance
          (search_term_id, date, impressions, clicks, cost_micros, conversions)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(search_term_id, date) DO UPDATE SET
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          cost_micros = excluded.cost_micros,
          conversions = excluded.conversions`,
      [searchTermId, dayData.date, st.impressions, st.clicks, st.costMicros, st.conversions]
    )
  }

  // v2 Stage 3 — ad performance.
  for (const a of dayData.ads) {
    // adGroupIds is already populated by the ad-group loop above (every
    // ad's parent ad group is generated in the same DayData).
    const adGroupId = adGroupIds.get(a.adGroupKey)!
    const adId = await adIdFor(a.adKey, adGroupId)
    await client.query(
      `INSERT INTO ad_performance
          (ad_id, date, impressions, clicks, cost_micros, conversions)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(ad_id, date) DO UPDATE SET
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          cost_micros = excluded.cost_micros,
          conversions = excluded.conversions`,
      [adId, dayData.date, a.impressions, a.clicks, a.costMicros, a.conversions]
    )
  }

  // v2 Stage 5 — conversion action performance. Account-wide (every
  // campaign gets all 4 named actions), so campaignIds is used directly
  // rather than a hierarchy lookup like the ad-group-scoped loops above.
  for (const ca of dayData.conversionActions) {
    const campaignId = await campaignIdFor(ca.campaignKey)
    const conversionActionId = await conversionActionIdFor(ca.conversionActionKey)
    await client.query(
      `INSERT INTO conversion_action_performance
          (campaign_id, conversion_action_id, date, conversions)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(campaign_id, conversion_action_id, date) DO UPDATE SET
          conversions = excluded.conversions`,
      [campaignId, conversionActionId, dayData.date, ca.conversions]
    )
  }

  // v2 Stage 6 — PMax asset group performance.
  for (const ag of dayData.assetGroups) {
    const campaignId = await campaignIdFor(ag.campaignKey)
    const assetGroupId = await assetGroupIdFor(ag.assetGroupKey, campaignId)
    await client.query(
      `INSERT INTO asset_group_performance
          (asset_group_id, date, impressions, clicks, cost_micros, conversions, ad_strength)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(asset_group_id, date) DO UPDATE SET
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          cost_micros = excluded.cost_micros,
          conversions = excluded.conversions,
          ad_strength = excluded.ad_strength`,
      [assetGroupId, dayData.date, ag.impressions, ag.clicks, ag.costMicros, ag.conversions, ag.adStrength]
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

async function getOrCreateAd(client: PoolClient, adKey: string, adGroupId: number): Promise<number> {
  const a = profile.ADS.find((ad) => ad.key === adKey)!
  const existing = await client.query<{ id: number }>('SELECT id FROM ads WHERE ad_group_id = $1 AND label = $2', [
    adGroupId,
    a.label,
  ])
  if (existing.rows[0]) return existing.rows[0].id
  const inserted = await client.query<{ id: number }>(
    `INSERT INTO ads (ad_group_id, label, headlines, descriptions, final_url, ad_strength, data_source, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'demo', 'enabled') RETURNING id`,
    // headlines/descriptions are jsonb columns — pass pre-serialized JSON
    // text explicitly rather than relying on pg's own object->jsonb
    // coercion, to avoid ambiguity about which parameter types get
    // auto-detected as jsonb vs. a plain array-typed column.
    [adGroupId, a.label, JSON.stringify(a.headlines), JSON.stringify(a.descriptions), a.finalUrl, a.adStrength]
  )
  return inserted.rows[0].id
}

async function getOrCreateSearchTerm(
  client: PoolClient,
  searchTermKey: string,
  adGroupId: number,
  keywordId: number | null
): Promise<number> {
  const st = profile.SEARCH_TERMS.find((s) => s.key === searchTermKey)!
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM search_terms WHERE ad_group_id = $1 AND text = $2',
    [adGroupId, st.text]
  )
  if (existing.rows[0]) return existing.rows[0].id
  const inserted = await client.query<{ id: number }>(
    `INSERT INTO search_terms (ad_group_id, keyword_id, text, match_flavor, data_source)
     VALUES ($1, $2, $3, $4, 'demo') RETURNING id`,
    [adGroupId, keywordId, st.text, st.matchFlavor]
  )
  return inserted.rows[0].id
}

// v2 Stage 5 — conversion actions. Account-wide, not scoped to any
// campaign_id/ad_group_id — matches conversion_actions being a bare
// name-keyed table (unlike keywords/ads, whose natural key includes
// their parent ad_group_id).
async function getOrCreateConversionAction(client: PoolClient, conversionActionKey: string): Promise<number> {
  const ca = profile.CONVERSION_ACTIONS.find((a) => a.key === conversionActionKey)!
  const existing = await client.query<{ id: number }>(
    "SELECT id FROM conversion_actions WHERE name = $1 AND data_source = 'demo'",
    [ca.name]
  )
  if (existing.rows[0]) return existing.rows[0].id
  const inserted = await client.query<{ id: number }>(
    `INSERT INTO conversion_actions (name, category, counting_type, data_source, status)
     VALUES ($1, $2, $3, 'demo', 'enabled') RETURNING id`,
    [ca.name, ca.category, ca.countingType]
  )
  return inserted.rows[0].id
}

async function getOrCreateAssetGroup(client: PoolClient, assetGroupKey: string, campaignId: number): Promise<number> {
  const name = profile.ASSET_GROUPS.find((ag) => ag.key === assetGroupKey)!.name
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM asset_groups WHERE campaign_id = $1 AND name = $2',
    [campaignId, name]
  )
  if (existing.rows[0]) return existing.rows[0].id
  const inserted = await client.query<{ id: number }>(
    "INSERT INTO asset_groups (campaign_id, name, data_source, status) VALUES ($1, $2, 'demo', 'enabled') RETURNING id",
    [campaignId, name]
  )
  return inserted.rows[0].id
}
