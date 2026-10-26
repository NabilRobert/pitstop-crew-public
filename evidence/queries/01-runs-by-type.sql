-- Every pipeline run in the snapshot, by type and outcome, with the cost
-- each run recorded for itself (pipeline_runs.cost_usd_micros).
SELECT run_type,
       status,
       count(*)                                              AS runs,
       min(started_at)::date                                 AS first_day,
       max(started_at)::date                                 AS last_day,
       round(sum(coalesce(cost_usd_micros, 0)) / 1e6, 2)     AS recorded_cost_usd
FROM pipeline_runs
GROUP BY run_type, status
ORDER BY run_type, status;
