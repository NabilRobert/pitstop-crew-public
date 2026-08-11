// Ask feature (decided) — on-demand Q&A against Rico or Sammy for a given
// report. See agents/recommendation.md and agents/summary.md.

import * as rico from '../agents/rico.js'
import * as sammy from '../agents/sammy.js'
import { getOutput } from './outputs.js'
import { buildPerformanceContext } from '../data/context.js'
import { getSettings } from '../platform/settings.js'
import { query } from '../data/db.js'

const ASKABLE_AGENTS: Record<string, { answerQuestion: (ctx: string, q: string, language?: string) => Promise<string> }> = {
  recommendation: rico,
  summary: sammy,
}

export async function ask(outputId: number, question: string): Promise<number> {
  const output = await getOutput(outputId)
  if (output === null) throw new Error(`No ai_outputs row with id=${outputId}`)
  const agentType = output.agent_type
  const agentModule = ASKABLE_AGENTS[agentType]
  if (!agentModule) {
    throw new Error(`Only recommendation/summary outputs are askable, got '${agentType}'`)
  }

  // db.ts returns DATE columns as raw 'YYYY-MM-DD' strings — see db.ts.
  const endDate = output.report_date ?? new Date().toISOString().slice(0, 10)
  const supportingData = await buildPerformanceContext({
    campaignId: output.campaign_id,
    segmentId: output.segment_id,
    endDate,
  })
  const reportContext = `Report:\n${output.content}\n\nUnderlying data:\n${supportingData}`

  const { report_language: language } = await getSettings()
  const answer = await agentModule.answerQuestion(reportContext, question, language)
  return logAsk(outputId, agentType, question, answer)
}

async function logAsk(outputId: number, agentType: string, question: string, answer: string): Promise<number> {
  const rows = await query<{ id: number }>(
    'INSERT INTO ask_log (output_id, agent_type, question, answer) VALUES ($1, $2, $3, $4) RETURNING id',
    [outputId, agentType, question, answer]
  )
  return rows[0].id
}

export async function getAskHistory(outputId: number) {
  return query('SELECT * FROM ask_log WHERE output_id = $1 ORDER BY created_at', [outputId])
}
