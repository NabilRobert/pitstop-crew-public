// Backs the Learning page — the two signals the user asked for together
// (a naive flag-rate-only chart could just mean the critic went
// complacent, not that reports actually got better): a flag-rate trend
// plus the actual weekly prompt-patch suggestion history to corroborate it.

import { query } from '../data/db.js'

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

const TREND_AGENTS = ['analysis', 'recommendation', 'summary'] as const

export interface GradeTrendCounts {
  outputs: number
  approved_clean: number
  approved_with_notes: number
  flagged: number
  no_review: number
  c_or_worse: number
  high_severity: number
}

export interface GradeTrendWeek {
  week: string
  agents: Record<(typeof TREND_AGENTS)[number], GradeTrendCounts>
}

// Real go-live times of the two changes that break comparability of the
// trend (pm2 restart on the VPS, 2026-09-28: Phase 1 at 06:02Z, severity
// approval + facts block at 06:41Z). Hardcoded on purpose — they are deploy
// facts, not something derivable from the data.
export const GRADE_TREND_EVENTS = [
  { date: '2026-09-28', key: 'phase1', label: 'Rico/Sammy graded against their own inputs' },
  { date: '2026-09-28', key: 'severity_approval', label: 'Severity-based approval + facts block' },
]

/** Final outputs only (status approved/flagged — one per report chain per
 * agent), banded by the final critique. The critic is found the way
 * attachCritique finds it: the critic row for the output's id, else for its
 * revises_id. Bands are mutually exclusive, with no_review first: no critic
 * row, or a null-grade row (pre-grading rows, "review unavailable"), can't be
 * banded by verdict. c_or_worse and high_severity overlap the bands; a
 * critique with no severity on any issue (pre-severity) counts as high when
 * its grade is D or F. Every requested week is returned, zero-filled. */
export async function getGradeTrend(weeks = 8): Promise<{ weeks: GradeTrendWeek[]; events: typeof GRADE_TREND_EVENTS }> {
  const rows = await query<{ week: string; agent_type: (typeof TREND_AGENTS)[number] } & GradeTrendCounts>(
    `WITH weeks AS (
       SELECT date_trunc('week', CURRENT_DATE)::date - n * 7 AS week FROM generate_series(0, $1::int - 1) AS n
     ),
     agents(agent_type) AS (VALUES ('analysis'), ('recommendation'), ('summary')),
     finals AS (
       SELECT date_trunc('week', o.report_date)::date AS week, o.agent_type, o.status, c.grade,
              CASE WHEN jsonb_typeof(c.issues) = 'array' THEN c.issues ELSE '[]'::jsonb END AS issues
       FROM ai_outputs o
       LEFT JOIN LATERAL (
         SELECT k.grade, k.issues FROM ai_outputs k
         WHERE k.agent_type = 'critic'
           AND (k.critiques_id = o.id
                OR (k.critiques_id = o.revises_id
                    AND NOT EXISTS (SELECT 1 FROM ai_outputs k2 WHERE k2.agent_type = 'critic' AND k2.critiques_id = o.id)))
         ORDER BY k.created_at DESC, k.id DESC
         LIMIT 1
       ) c ON true
       WHERE o.agent_type IN ('analysis', 'recommendation', 'summary')
         AND o.status IN ('approved', 'flagged')
         AND o.report_date IS NOT NULL
         AND date_trunc('week', o.report_date)::date >= (SELECT MIN(week) FROM weeks)
     ),
     classified AS (
       SELECT week, agent_type, status, grade, jsonb_array_length(issues) AS n_issues,
              EXISTS (SELECT 1 FROM jsonb_array_elements(issues) i WHERE i->>'severity' = 'high') AS has_high,
              EXISTS (SELECT 1 FROM jsonb_array_elements(issues) i WHERE i->>'severity' IN ('high', 'medium', 'low')) AS has_severity
       FROM finals
     )
     SELECT w.week, a.agent_type,
            COUNT(c.status)::int AS outputs,
            (COUNT(*) FILTER (WHERE c.grade IS NOT NULL AND c.status = 'approved' AND c.n_issues = 0))::int AS approved_clean,
            (COUNT(*) FILTER (WHERE c.grade IS NOT NULL AND c.status = 'approved' AND c.n_issues > 0))::int AS approved_with_notes,
            (COUNT(*) FILTER (WHERE c.grade IS NOT NULL AND c.status = 'flagged'))::int AS flagged,
            (COUNT(*) FILTER (WHERE c.status IS NOT NULL AND c.grade IS NULL))::int AS no_review,
            (COUNT(*) FILTER (WHERE c.grade IN ('C', 'D', 'F')))::int AS c_or_worse,
            (COUNT(*) FILTER (WHERE c.has_high OR (NOT c.has_severity AND c.grade IN ('D', 'F'))))::int AS high_severity
     FROM weeks w
     CROSS JOIN agents a
     LEFT JOIN classified c ON c.week = w.week AND c.agent_type = a.agent_type
     GROUP BY w.week, a.agent_type
     ORDER BY w.week, a.agent_type`,
    [weeks]
  )
  const byWeek = new Map<string, GradeTrendWeek>()
  for (const { week, agent_type, ...counts } of rows) {
    if (!byWeek.has(week)) byWeek.set(week, { week, agents: {} as GradeTrendWeek['agents'] })
    byWeek.get(week)!.agents[agent_type] = counts
  }
  return { weeks: [...byWeek.values()], events: GRADE_TREND_EVENTS }
}

export async function getSuggestionHistory(limit = 20) {
  return query('SELECT * FROM weekly_feedback_suggestions ORDER BY week_of DESC LIMIT $1', [limit])
}
