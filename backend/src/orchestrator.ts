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

const TRAILING_WINDOW_DAYS = 7
const ANALYSIS_LOOKBACK_DAYS = 30

export interface RunResult {
  analysisId: number
  recommendationId: number
  summaryId: number
}

export async function runDaily(targetDate: string, seed = 0, dataSource?: string): Promise<RunResult> {
  const source = dataSource ?? DATA_SOURCE
  return trackRun('daily', async () => {
    await syncTrailingWindow(targetDate, TRAILING_WINDOW_DAYS, seed, source)
    return runAgentChain(targetDate, 'daily', ANALYSIS_LOOKBACK_DAYS)
  })
}

export async function runWeekly(targetDate: string): Promise<RunResult> {
  return trackRun('weekly', async () => runAgentChain(targetDate, 'weekly', TRAILING_WINDOW_DAYS))
}

async function runAgentChain(targetDate: string, period: string, days: number): Promise<RunResult> {
  const performanceData = await buildPerformanceContext({ endDate: targetDate, days })

  const analysisId = await runWithCritic({
    agentType: 'analysis',
    generate: (feedback) => anna.analyze(performanceData, feedback),
    supportingData: performanceData,
    reportDate: targetDate,
    period,
  })
  const analysisContent = (await getOutput(analysisId))!.content

  const recommendationId = await runWithCritic({
    agentType: 'recommendation',
    generate: (feedback) => rico.recommend(analysisContent, feedback),
    supportingData: performanceData,
    reportDate: targetDate,
    period,
  })
  const recommendationContent = (await getOutput(recommendationId))!.content

  const summaryId = await runWithCritic({
    agentType: 'summary',
    generate: (feedback) => sammy.summarize(analysisContent, recommendationContent, period, feedback),
    supportingData: performanceData,
    reportDate: targetDate,
    period,
  })

  return { analysisId, recommendationId, summaryId }
}
