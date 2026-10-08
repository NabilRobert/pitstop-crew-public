// v3 step 2 — one-off backfill of the reworked demo keyword/search-term
// data (docs/overhaul-v3-backend.md section 7.2). Regenerates every demo
// day from START_DATE to the newest day already synced and upserts it
// through the same path the daily sync uses (syncTrailingWindow), in
// chunks so no single transaction holds the whole history.
//
// Re-runnable: the generator is deterministic and every write is an
// upsert, so a second run changes nothing. Campaign, segment, ad-group,
// ad, conversion-action and asset-group rows come out identical to what
// is already stored (the rework only changes the split below the ad
// group); keyword and search-term rows are rewritten, and demo
// search-term rows the new generator doesn't produce for a date are
// removed (see upsertDay).
//
// Never extends the data past what already exists, never runs in live
// mode, and refuses to run while a pipeline run is in progress (the daily
// sync writes the same rows). Take a backup first: npx tsx scripts/backupDb.ts
//
// --dry-run writes only the newest day, inside a transaction it checks
// and then rolls back: nothing is kept. Use it to prove the SQL against
// the real schema before the real run.

import type { PoolClient } from 'pg'
import { DATA_SOURCE } from '../src/platform/config.js'
import { query, withTransaction } from '../src/data/db.js'
import { syncTrailingWindow, upsertDemoDays, upsertDemoInventory } from '../src/data/damon.js'
import { generateDay } from '../src/data/demo/generator.js'
import { getOverrides } from '../src/data/demo/timeMachine.js'
import { START_DATE } from '../src/data/demo/profile.js'

const CHUNK_DAYS = 14
const SEED = 0 // the seed the daily pipeline syncs with (orchestrator.ts runDaily)

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86_400_000)
}

async function main() {
  if (DATA_SOURCE !== 'demo') throw new Error(`DATA_SOURCE is '${DATA_SOURCE}' — the backfill only rewrites demo data`)

  const running = await query<{ id: number; run_type: string }>(
    "SELECT id, run_type FROM pipeline_runs WHERE status = 'running'"
  )
  if (running.length > 0) {
    throw new Error(`pipeline run ${running[0].id} (${running[0].run_type}) is in progress — try again after it finishes`)
  }

  const [{ last }] = await query<{ last: string | null }>(
    `SELECT to_char(MAX(cp.date), 'YYYY-MM-DD') AS last
     FROM campaign_performance cp JOIN campaigns c ON c.id = cp.campaign_id
     WHERE c.data_source = 'demo'`
  )
  if (!last) throw new Error('no demo campaign data yet — nothing to backfill (run the daily sync first)')

  if (process.argv.includes('--dry-run')) {
    await dryRun(last)
    process.exit(0)
  }

  const totalDays = daysBetween(START_DATE, last) + 1
  console.log(`Backfilling ${totalDays} demo days, ${START_DATE} → ${last}, in ${CHUNK_DAYS}-day chunks`)

  const started = Date.now()
  for (let end = last; daysBetween(START_DATE, end) >= 0; end = addDays(end, -CHUNK_DAYS)) {
    const days = Math.min(CHUNK_DAYS, daysBetween(START_DATE, end) + 1)
    await syncTrailingWindow(end, days, SEED, 'demo')
    console.log(`  ${addDays(end, -(days - 1))} → ${end} done`)
  }

  const [counts] = await query<{ keywords: number; terms: number; kp: number; stp: number }>(
    `SELECT (SELECT COUNT(*) FROM keywords WHERE data_source = 'demo') AS keywords,
            (SELECT COUNT(*) FROM search_terms WHERE data_source = 'demo') AS terms,
            (SELECT COUNT(*) FROM keyword_performance) AS kp,
            (SELECT COUNT(*) FROM search_term_performance) AS stp`
  )
  console.log(
    `Done in ${Math.round((Date.now() - started) / 1000)}s — ${counts.keywords} demo keywords, ${counts.terms} demo search terms, ` +
      `${counts.kp} keyword_performance rows, ${counts.stp} search_term_performance rows`
  )
  process.exit(0)
}

class DryRunRollback extends Error {}

async function dayCounts(client: PoolClient, date: string) {
  const { rows } = await client.query<{ kp: number; stp: number; cp: string }>(
    `SELECT (SELECT COUNT(*)::int FROM keyword_performance WHERE date = $1) AS kp,
            (SELECT COUNT(*)::int FROM search_term_performance WHERE date = $1) AS stp,
            (SELECT string_agg(campaign_id || ':' || clicks || ':' || cost_micros || ':' || conversions, ',' ORDER BY campaign_id)
               FROM campaign_performance WHERE date = $1) AS cp`,
    [date]
  )
  return rows[0]
}

async function dryRun(date: string) {
  console.log(`Dry run: rewriting ${date} inside a transaction that will be rolled back`)
  const day = generateDay(date, SEED, await getOverrides())
  try {
    await withTransaction(async (client) => {
      const before = await dayCounts(client, date)
      await upsertDemoDays(client, [day])
      const after = await dayCounts(client, date)
      // Keywords must sum to their ad group, and visible search terms must
      // never exceed their keyword — checked in SQL against what was written.
      const { rows: mismatches } = await client.query<{ name: string }>(
        `SELECT ag.name FROM ad_groups ag
         JOIN ad_group_performance agp ON agp.ad_group_id = ag.id AND agp.date = $1
         JOIN keywords k ON k.ad_group_id = ag.id
         JOIN keyword_performance kp ON kp.keyword_id = k.id AND kp.date = $1
         WHERE ag.data_source = 'demo'
         GROUP BY ag.name, agp.clicks, agp.cost_micros
         HAVING SUM(kp.clicks) <> agp.clicks OR SUM(kp.cost_micros) <> agp.cost_micros`,
        [date]
      )
      const { rows: over } = await client.query<{ text: string }>(
        `SELECT k.text FROM keywords k
         JOIN keyword_performance kp ON kp.keyword_id = k.id AND kp.date = $1
         JOIN search_terms st ON st.keyword_id = k.id
         JOIN search_term_performance stp ON stp.search_term_id = st.id AND stp.date = $1
         GROUP BY k.id, k.text, kp.clicks HAVING SUM(stp.clicks) > kp.clicks`,
        [date]
      )
      const { rows: bids } = await client.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM keywords WHERE data_source = 'demo' AND cpc_bid_micros IS NOT NULL"
      )
      // Per-action keyword rows must add up to the keyword's conversions.
      const { rows: actions } = await client.query<{ rows: number; off: number; value_rp: number }>(
        `SELECT COUNT(*)::int AS rows,
                (SELECT COUNT(*)::int FROM (
                   SELECT kp.keyword_id FROM keyword_performance kp
                   LEFT JOIN keyword_conversion_action_performance kca ON kca.keyword_id = kp.keyword_id AND kca.date = kp.date
                   WHERE kp.date = $1 GROUP BY kp.keyword_id, kp.conversions
                   HAVING ABS(COALESCE(SUM(kca.conversions), 0) - kp.conversions) > 0.001) x) AS off,
                (SELECT ROUND(SUM(conversions_value_micros) / 1e6)::int FROM keyword_performance WHERE date = $1) AS value_rp
         FROM keyword_conversion_action_performance WHERE date = $1`,
        [date]
      )
      const { rows: tiers } = await client.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM conversion_actions WHERE data_source = 'demo' AND value_tier IS NOT NULL"
      )
      // The demo stock, written twice to prove the upsert is idempotent
      // (vehicle ids must not churn: suggestions store them).
      await upsertDemoInventory(client)
      const { rows: firstIds } = await client.query<{ ids: string }>("SELECT string_agg(id::text, ',' ORDER BY id) AS ids FROM vehicles")
      await upsertDemoInventory(client)
      const { rows: stock } = await client.query<{ ids: string; n: number; available: number; aging: number; events: number; anchor: string }>(
        `SELECT string_agg(id::text, ',' ORDER BY id) AS ids, COUNT(*)::int AS n,
                COUNT(*) FILTER (WHERE status = 'available')::int AS available,
                COUNT(*) FILTER (WHERE status = 'available' AND listed_on < $1::date - 60)::int AS aging,
                (SELECT COUNT(*)::int FROM vehicle_events) AS events, $1 AS anchor
         FROM vehicles`,
        [date]
      )
      console.log(`  keyword rows for ${date}:     ${before.kp} → ${after.kp} (generated ${day.keywords.length})`)
      console.log(`  search-term rows for ${date}: ${before.stp} → ${after.stp} (generated ${day.searchTerms.length})`)
      console.log(`  campaign rows unchanged:      ${before.cp === after.cp}`)
      console.log(`  ad groups where keywords ≠ ad group total: ${mismatches.length}`)
      console.log(`  keywords whose visible terms exceed them:  ${over.length}`)
      console.log(`  demo keywords with a bid set:              ${bids[0].n}`)
      console.log(`  keyword × action rows: ${actions[0].rows}, keywords whose actions ≠ conversions: ${actions[0].off}`)
      console.log(`  keyword conversion value for the day:      Rp ${actions[0].value_rp}`)
      console.log(`  demo conversion actions with a value tier: ${tiers[0].n}`)
      console.log(
        `  demo stock: ${stock[0].n} vehicles (${stock[0].available} available, ${stock[0].aging} listed > 60 days), ` +
          `${stock[0].events} events, ids stable on re-run: ${firstIds[0].ids === stock[0].ids}`
      )
      throw new DryRunRollback()
    })
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err
  }
  console.log('Rolled back — nothing was written.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
