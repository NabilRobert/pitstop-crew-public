// Orca — orchestrator. See agents/orchestrator.md. Ties Damon -> Anna ->
// Rico -> Critic -> Sammy together for the daily run and the weekly
// rollup. The weekly feedback job (critic-pattern -> prompt-patch
// suggestion) is a separate, simpler flow — see weeklyFeedback.ts.

import * as anna from './anna.js'
import * as rico from './rico.js'
import * as sammy from './sammy.js'
import { runWithCritic } from './criticLoop.js'
import { syncTrailingWindow } from './damon.js'
import { getOutput } from './outputs.js'
import { DATA_SOURCE } from './config.js'
import { buildPerformanceContext } from './context.js'
import { trackRun } from './pipelineRuns.js'
import { emitEvent } from './eventBus.js'

const TRAILING_WINDOW_DAYS = 7
const ANALYSIS_LOOKBACK_DAYS = 30
// Deliberately longer than whatever window the agent itself generated
// from (30 for daily, 7 for weekly) — the critic seeing more history
// than the agent did is the point: it can catch "this doesn't match
// past data" contradictions the agent's own narrower window couldn't.
const CRITIC_HISTORY_DAYS = 60

export interface RunResult {
  analysisId: number
  recommendationId: number
  summaryId: number
}

export async function runDaily(targetDate: string, seed = 0, dataSource?: string): Promise<RunResult> {
  const source = dataSource ?? DATA_SOURCE
  emitEvent(`Starting daily pipeline run for ${targetDate}`)
  return trackRun('daily', async () => {
    emitEvent('Damon: syncing trailing 7-day window…')
    await syncTrailingWindow(targetDate, TRAILING_WINDOW_DAYS, seed, source)
    emitEvent('Damon: sync complete')
    const result = await runAgentChain(targetDate, 'daily', ANALYSIS_LOOKBACK_DAYS)
    emitEvent(`Daily pipeline run complete (report_date=${targetDate})`)
    return result
  })
}

export async function runWeekly(targetDate: string): Promise<RunResult> {
  emitEvent(`Starting weekly pipeline run for ${targetDate}`)
  return trackRun('weekly', async () => {
    const result = await runAgentChain(targetDate, 'weekly', TRAILING_WINDOW_DAYS)
    emitEvent(`Weekly pipeline run complete (report_date=${targetDate})`)
    return result
  })
}

async function runAgentChain(targetDate: string, period: string, days: number): Promise<RunResult> {
  const performanceData = await buildPerformanceContext({ endDate: targetDate, days })
  const historicalContext = await buildPerformanceContext({ endDate: targetDate, days: CRITIC_HISTORY_DAYS })

  emitEvent("Anna: analyzing performance data…")
  const analysisId = await runWithCritic({
    agentType: 'analysis',
    generate: (feedback) => anna.analyze(performanceData, feedback),
    supportingData: performanceData,
    historicalContext,
    reportDate: targetDate,
    period,
  })
  const analysisContent = (await getOutput(analysisId))!.content

  emitEvent("Rico: drafting recommendation…")
  const recommendationId = await runWithCritic({
    agentType: 'recommendation',
    generate: (feedback) => rico.recommend(analysisContent, feedback),
    supportingData: performanceData,
    historicalContext,
    reportDate: targetDate,
    period,
  })
  const recommendationContent = (await getOutput(recommendationId))!.content

  emitEvent("Sammy: summarizing…")
  const summaryId = await runWithCritic({
    agentType: 'summary',
    generate: (feedback) => sammy.summarize(analysisContent, recommendationContent, period, feedback),
    supportingData: performanceData,
    historicalContext,
    reportDate: targetDate,
    period,
  })

  return { analysisId, recommendationId, summaryId }
}
