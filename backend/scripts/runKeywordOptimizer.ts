// v3 step 7 — runs the keyword optimizer once, by hand (the same run the
// Monday cron starts; see runDaily.ts).
//
//   npx tsx scripts/runKeywordOptimizer.ts            engine + Kai + Ciri (model calls)
//   npx tsx scripts/runKeywordOptimizer.ts --no-model engine only, zero model calls
//
// --no-model stores the suggestions unranked and ends the run 'partial':
// it exercises the run type, the lock, tracing and storage without spending
// anything. Respects the monthly spend cap and the one-run-at-a-time lock.

import { runKeywordOptimizer } from '../src/pipeline/keywordOptimizer.js'
import { PipelineRunInProgressError, SpendCeilingExceededError } from '../src/pipeline/pipelineRuns.js'

async function main() {
  const skipModel = process.argv.includes('--no-model')
  try {
    const r = await runKeywordOptimizer({ skipModel })
    console.log(
      `Keyword optimizer run #${r.runId} (data to ${r.reportDate}): ${r.candidates} candidates, ${r.inserted} stored, ` +
        `${r.superseded} superseded, Kai: ${r.kai}`
    )
  } catch (err) {
    if (err instanceof PipelineRunInProgressError || err instanceof SpendCeilingExceededError) {
      console.log(`Not run — ${err.message}`)
      process.exit(0)
    }
    throw err
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
