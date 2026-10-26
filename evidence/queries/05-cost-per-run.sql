-- Cost per run, from each run's own record. Runs with no cost recorded
-- (backups, and runs before cost tracking) are counted but not averaged.
SELECT run_type,
       count(*)                                                     AS runs,
       count(cost_usd_micros) FILTER (WHERE cost_usd_micros > 0)    AS runs_with_cost,
       round(avg(cost_usd_micros) FILTER (WHERE cost_usd_micros > 0) / 1e6, 4)  AS mean_usd,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_usd_micros)
              FILTER (WHERE cost_usd_micros > 0))::numeric / 1e6, 4)            AS median_usd,
       round(max(cost_usd_micros) / 1e6, 4)                         AS max_usd,
       round(sum(coalesce(cost_usd_micros, 0)) / 1e6, 2)            AS total_usd
FROM pipeline_runs
GROUP BY run_type
ORDER BY run_type;
