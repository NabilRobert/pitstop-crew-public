-- Gaps of more than one day between consecutive daily runs.
WITH d AS (
  SELECT started_at::date AS day,
         lag(started_at::date) OVER (ORDER BY started_at) AS prev_day
  FROM pipeline_runs
  WHERE run_type = 'daily'
)
SELECT prev_day AS last_run_before_gap,
       day      AS next_run,
       day - prev_day - 1 AS days_missed
FROM d
WHERE day - prev_day > 1
ORDER BY prev_day;
