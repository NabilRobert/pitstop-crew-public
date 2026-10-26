-- Totals the case study quotes that span several rows of other files, so
-- none of them is added up by hand.
WITH final AS (
  SELECT o.id
  FROM ai_outputs o
  WHERE o.agent_type <> 'critic'
    AND NOT EXISTS (SELECT 1 FROM ai_outputs r WHERE r.revises_id = o.id)
),
RECURSIVE_DEPTH AS (
  SELECT o.id, (
    WITH RECURSIVE up AS (
      SELECT o.id AS cur, 0 AS depth
      UNION ALL
      SELECT p.revises_id, up.depth + 1 FROM up JOIN ai_outputs p ON p.id = up.cur WHERE p.revises_id IS NOT NULL
    ) SELECT max(depth) FROM up) AS revisions
  FROM ai_outputs o JOIN final f ON f.id = o.id
)
SELECT 'critic_reviews' AS measure,
       (SELECT count(*) FROM ai_outputs WHERE agent_type = 'critic')::text AS value
UNION ALL SELECT 'final_outputs', (SELECT count(*) FROM final)::text
UNION ALL SELECT 'final_outputs_revised_twice', (SELECT count(*) FROM RECURSIVE_DEPTH WHERE revisions = 2)::text
UNION ALL SELECT 'final_outputs_revised_twice_pct',
       (SELECT round(100.0 * count(*) FILTER (WHERE revisions = 2) / count(*), 0) FROM RECURSIVE_DEPTH)::text
UNION ALL SELECT 'outputs_sep_oct', (SELECT count(*) FROM ai_outputs WHERE agent_type <> 'critic'
       AND created_at >= '2026-09-01' AND created_at < '2026-11-01')::text
UNION ALL SELECT 'blank_outputs_first_day', (SELECT min(created_at)::date FROM ai_outputs
       WHERE agent_type <> 'critic' AND btrim(content) = '')::text
UNION ALL SELECT 'blank_outputs_last_day', (SELECT max(created_at)::date FROM ai_outputs
       WHERE agent_type <> 'critic' AND btrim(content) = '')::text
UNION ALL SELECT 'daily_runs', (SELECT count(*) FROM pipeline_runs WHERE run_type = 'daily')::text
UNION ALL SELECT 'keyword_optimizer_runs', (SELECT count(*) FROM pipeline_runs WHERE run_type = 'keyword_optimizer')::text;
