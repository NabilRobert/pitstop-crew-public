// Formats stored performance data into compact text for agent prompts.
// Shared by the Ask feature; the cron pipeline reuses it for the same
// reason — one place that turns DB rows into prompt context.

import { query } from './db.js'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface BuildPerformanceContextArgs {
  campaignId?: number | null
  segmentId?: number | null
  endDate?: string
  days?: number
}

export async function buildPerformanceContext(args: BuildPerformanceContextArgs = {}): Promise<string> {
  const endDate = args.endDate ?? new Date().toISOString().slice(0, 10)
  const days = args.days ?? 30
  const startDate = addDays(endDate, -days)

  let rows: unknown[]
  if (args.segmentId != null) {
    rows = await query(
      `SELECT sp.date, c.name AS campaign, s.segment_type, s.segment_value,
              sp.impressions, sp.clicks, sp.cost_micros, sp.conversions
       FROM segment_performance sp
       JOIN campaigns c ON c.id = sp.campaign_id
       JOIN segments s ON s.id = sp.segment_id
       WHERE sp.segment_id = $1 AND sp.date BETWEEN $2 AND $3
       ORDER BY sp.date`,
      [args.segmentId, startDate, endDate]
    )
  } else if (args.campaignId != null) {
    rows = await query(
      `SELECT cp.date, c.name AS campaign, cp.impressions, cp.clicks, cp.cost_micros, cp.conversions
       FROM campaign_performance cp
       JOIN campaigns c ON c.id = cp.campaign_id
       WHERE cp.campaign_id = $1 AND cp.date BETWEEN $2 AND $3
       ORDER BY cp.date`,
      [args.campaignId, startDate, endDate]
    )
  } else {
    rows = await query(
      `SELECT cp.date, c.name AS campaign, cp.impressions, cp.clicks, cp.cost_micros, cp.conversions
       FROM campaign_performance cp
       JOIN campaigns c ON c.id = cp.campaign_id
       WHERE cp.date BETWEEN $1 AND $2
       ORDER BY cp.date, c.name`,
      [startDate, endDate]
    )
  }

  return JSON.stringify(rows)
}
