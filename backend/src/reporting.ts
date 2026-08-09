// Structured data queries backing the frontend dashboard — distinct from
// context.ts, which formats the same data as prompt text for agents.

import { query } from './db.js'
import { getLatestByAgent } from './outputs.js'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function listCampaigns() {
  return query('SELECT id, name, status, data_source FROM campaigns ORDER BY name')
}

export async function getPerformanceSeries(days = 30, endDate?: string) {
  const end = endDate ?? new Date().toISOString().slice(0, 10)
  const start = addDays(end, -days)
  return query(
    `SELECT cp.date, c.id AS campaign_id, c.name AS campaign,
            cp.impressions, cp.clicks, cp.cost_micros, cp.conversions
     FROM campaign_performance cp
     JOIN campaigns c ON c.id = cp.campaign_id
     WHERE cp.date BETWEEN $1 AND $2
     ORDER BY cp.date, c.name`,
    [start, end]
  )
}

/** The most recent finalized analysis/recommendation/summary trio for a
 * period — backs "today's report" on the dashboard without the frontend
 * needing to already know specific ai_outputs ids. */
export async function getLatestReport(period: string) {
  return {
    analysis: await getLatestByAgent('analysis', period),
    recommendation: await getLatestByAgent('recommendation', period),
    summary: await getLatestByAgent('summary', period),
  }
}
