// Backs the Learning page — the two signals the user asked for together
// (a naive flag-rate-only chart could just mean the critic went
// complacent, not that reports actually got better): a flag-rate trend
// plus the actual weekly prompt-patch suggestion history to corroborate it.

import { query } from './db.js'

export interface FlagRateWeek {
  week: string
  flagged: number
  total: number
}

export async function getFlagRateTrend(weeks = 8): Promise<FlagRateWeek[]> {
  return query<FlagRateWeek>(
    `SELECT date_trunc('week', report_date)::date AS week,
            COUNT(*) FILTER (WHERE status = 'flagged') AS flagged,
            COUNT(*) AS total
     FROM ai_outputs
     WHERE agent_type IN ('analysis', 'recommendation', 'summary') AND report_date IS NOT NULL
       AND report_date >= CURRENT_DATE - ($1::int * 7)
     GROUP BY week
     ORDER BY week`,
    [weeks]
  )
}

export async function getSuggestionHistory(limit = 20) {
  return query('SELECT * FROM weekly_feedback_suggestions ORDER BY week_of DESC LIMIT $1', [limit])
}
