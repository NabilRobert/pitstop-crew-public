// v3 step 6 — the keyword optimizer's scoring harness
// (docs/overhaul-v3-backend.md section 12). No DB, no model calls: for each
// seed it regenerates the demo history in memory, runs the deterministic
// engine every week, and scores what it finds against GROUND_TRUTH.
//
// Reports, per plant kind: found / missed at the horizon, the week each
// plant first appears vs its foundByWeek marker; the false-positive rate on
// the decoys and the legitimate buyer-intent terms (which must never be
// flagged); and the candidates that touch no ground-truth row at all.
//
//   npx tsx scripts/scoreOptimizer.ts [--seeds 10] [--horizon 126] [--verbose]
//
// --horizon is days since START_DATE (126 = 2026-10-05, the history that
// existed when v3 was built). --verbose lists seed 0's unplanned candidates.

import { generateDay, type DayData } from '../src/data/demo/generator.js'
import { START_DATE } from '../src/data/demo/profile.js'
import { GROUND_TRUTH, type PlantKind } from '../src/data/demo/groundTruth.js'
import { addDays, runEngine } from '../src/optimizer/engine.js'
import { buildDemoEngineInput, demoIds, describeCandidate, scoreAgainstGroundTruth } from '../src/optimizer/harness.js'

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

const SEEDS = arg('seeds', 10)
const HORIZON = arg('horizon', 126)
const VERBOSE = process.argv.includes('--verbose')
const WEEKS = Math.floor(HORIZON / 7)

interface RowAgg {
  foundAtHorizon: number
  flaggedAtHorizon: number
  firstWeeks: number[] // per seed where it was found at some week
  late: number // first found after its foundByWeek marker (or never)
}

const ids = demoIds()
const rowAgg = new Map(GROUND_TRUTH.map((g) => [g.id, { foundAtHorizon: 0, flaggedAtHorizon: 0, firstWeeks: [], late: 0 } as RowAgg]))
const unplannedByType = new Map<string, number>()
const prior = { count: 0 }
const started = Date.now()

for (let seed = 0; seed < SEEDS; seed++) {
  const days: DayData[] = Array.from({ length: HORIZON + 1 }, (_, i) => generateDay(addDays(START_DATE, i), seed))
  const firstWeek = new Map<string, number>()

  for (let week = 1; week <= WEEKS + 1; week++) {
    const asOf = week <= WEEKS ? addDays(START_DATE, week * 7) : addDays(START_DATE, HORIZON)
    const input = buildDemoEngineInput(days, asOf)
    const result = runEngine(input)
    const score = scoreAgainstGroundTruth([...result.candidates, ...result.capped], input, ids)
    for (const r of score.rows) if (r.found && !firstWeek.has(r.row.id)) firstWeek.set(r.row.id, Math.min(week, WEEKS))

    if (week === WEEKS + 1) {
      for (const r of score.rows) {
        const a = rowAgg.get(r.row.id)!
        if (r.found) a.foundAtHorizon += 1
        if (r.falsePositive) a.flaggedAtHorizon += 1
      }
      for (const c of score.unplanned) {
        if (c.basis === 'prior') {
          prior.count += 1
          continue
        }
        unplannedByType.set(c.type, (unplannedByType.get(c.type) ?? 0) + 1)
      }
      if (seed === 0) {
        console.log(`seed 0 at ${asOf}: ${result.candidates.length} candidates, ${result.notEnoughData} terms "not enough data", ${result.skipped.length} skipped`)
        const missed = score.rows.filter((r) => r.row.expected !== null && !r.found)
        for (const r of missed) console.log(`  MISSED ${r.row.id} (expected ${r.row.expected})${r.flaggedBy.length ? ` — got ${r.flaggedBy.map((c) => c.type).join(', ')}` : ''}`)
        for (const r of score.rows.filter((r) => r.falsePositive)) {
          for (const c of r.flaggedBy) console.log(`  FALSE POSITIVE ${r.row.id}: ${describeCandidate(c, input)}`)
        }
        if (VERBOSE) for (const c of score.unplanned) console.log(`  unplanned: ${describeCandidate(c, input)}`)
      }
    }
  }

  for (const g of GROUND_TRUTH) {
    if (g.expected === null) continue
    const a = rowAgg.get(g.id)!
    const w = firstWeek.get(g.id)
    if (w !== undefined) a.firstWeeks.push(w)
    if (w === undefined || (g.foundByWeek !== null && w > g.foundByWeek)) a.late += 1
  }
}

// --- report ------------------------------------------------------------------
const pct = (n: number, d: number) => (d === 0 ? '-' : `${Math.round((100 * n) / d)}%`)
const mean = (xs: number[]) => (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : '-')

console.log(`\nScored ${SEEDS} seeds × ${WEEKS} weeks (horizon day ${HORIZON} = ${addDays(START_DATE, HORIZON)}) in ${((Date.now() - started) / 1000).toFixed(1)}s\n`)
console.log('Plants (at the horizon, across seeds):')
console.log('  kind                  rows  found   first week (mean)  marker (mean)  late or never')
const kinds = [...new Set(GROUND_TRUTH.map((g) => g.kind))] as PlantKind[]
for (const kind of kinds) {
  const rows = GROUND_TRUTH.filter((g) => g.kind === kind)
  if (rows[0].expected === null) continue
  const aggs = rows.map((g) => rowAgg.get(g.id)!)
  const found = aggs.reduce((s, a) => s + a.foundAtHorizon, 0)
  const late = aggs.reduce((s, a) => s + a.late, 0)
  console.log(
    `  ${kind.padEnd(20)}  ${String(rows.length).padStart(4)}  ${pct(found, rows.length * SEEDS).padStart(5)}   ${mean(aggs.flatMap((a) => a.firstWeeks)).padStart(17)}  ${mean(rows.map((g) => g.foundByWeek!)).padStart(13)}  ${pct(late, rows.length * SEEDS).padStart(13)}`
  )
}

const partial = GROUND_TRUTH.filter((g) => g.expected !== null && rowAgg.get(g.id)!.foundAtHorizon < SEEDS)
if (partial.length) {
  console.log('\nPlants missed at the horizon in some seeds:')
  for (const g of partial) {
    const a = rowAgg.get(g.id)!
    console.log(`  ${g.id.padEnd(30)} found ${a.foundAtHorizon}/${SEEDS}, first found by week ${g.foundByWeek} in ${SEEDS - a.late}/${SEEDS}`)
  }
}

console.log('\nMust-not-flag rows (false-positive rate at the horizon):')
for (const kind of kinds) {
  const rows = GROUND_TRUTH.filter((g) => g.kind === kind)
  if (rows[0].expected !== null) continue
  const flagged = rows.reduce((s, g) => s + rowAgg.get(g.id)!.flaggedAtHorizon, 0)
  console.log(`  ${kind.padEnd(20)}  ${String(rows.length).padStart(4)} rows  ${pct(flagged, rows.length * SEEDS).padStart(5)} flagged`)
}

console.log('\nUnplanned evidence candidates at the horizon (mean per seed; not necessarily wrong):')
for (const [type, n] of [...unplannedByType.entries()].sort()) console.log(`  ${type.padEnd(22)} ${(n / SEEDS).toFixed(1)}`)
console.log(`  prior (unverified)     ${(prior.count / SEEDS).toFixed(1)}`)
process.exit(0)
