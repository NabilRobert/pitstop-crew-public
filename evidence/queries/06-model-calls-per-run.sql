-- Model calls per run, from the Run Inspector's traces. Tracing began on
-- 2026-09-28, so this covers only runs from then on.
WITH per_run AS (
  SELECT r.id, r.run_type,
         count(e.id) FILTER (WHERE e.kind = 'llm_call')               AS calls,
         coalesce(sum(e.tokens_in)  FILTER (WHERE e.kind = 'llm_call'), 0) AS tokens_in,
         coalesce(sum(e.tokens_out) FILTER (WHERE e.kind = 'llm_call'), 0) AS tokens_out
  FROM pipeline_runs r
  JOIN trace_events e ON e.run_id = r.id
  GROUP BY r.id, r.run_type
)
SELECT run_type,
       count(*)                       AS traced_runs,
       sum(calls)                     AS model_calls,
       round(avg(calls), 1)           AS mean_calls_per_run,
       min(calls)                     AS min_calls,
       max(calls)                     AS max_calls,
       round(avg(tokens_in))          AS mean_tokens_in,
       round(avg(tokens_out))         AS mean_tokens_out
FROM per_run
GROUP BY run_type
ORDER BY run_type;
