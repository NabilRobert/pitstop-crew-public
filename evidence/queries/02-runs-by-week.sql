-- Runs per week (weeks start Monday, UTC+7), so gaps in the schedule show.
SELECT date_trunc('week', started_at)::date                        AS week_of,
       count(*) FILTER (WHERE run_type = 'daily')                   AS daily,
       count(*) FILTER (WHERE run_type = 'weekly')                  AS weekly,
       count(*) FILTER (WHERE run_type = 'weekly_feedback')         AS weekly_feedback,
       count(*) FILTER (WHERE run_type = 'keyword_optimizer')       AS keyword_optimizer,
       count(*) FILTER (WHERE run_type = 'backup')                  AS backup,
       count(*) FILTER (WHERE status IN ('failure', 'partial'))     AS failed_or_partial
FROM pipeline_runs
GROUP BY 1
ORDER BY 1;
