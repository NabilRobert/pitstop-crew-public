-- 11, restricted to the three report agents that ran both before and after
-- severity-based approval (the keyword optimizer only started in October),
-- so the two periods compare the same kinds of output.
WITH switch AS (
  SELECT min(created_at) AS t
  FROM ai_outputs
  WHERE agent_type = 'critic' AND jsonb_path_exists(issues, '$[*].severity')
),
final AS (
  SELECT o.*
  FROM ai_outputs o
  WHERE o.agent_type IN ('analysis', 'recommendation', 'summary')
    AND NOT EXISTS (SELECT 1 FROM ai_outputs r WHERE r.revises_id = o.id)
)
SELECT CASE WHEN f.created_at < s.t THEN 'before' ELSE 'after' END            AS period,
       count(*)                                                                AS final_outputs,
       count(*) FILTER (WHERE f.status = 'approved')                           AS approved,
       count(*) FILTER (WHERE f.status = 'flagged')                            AS flagged,
       round(100.0 * count(*) FILTER (WHERE f.status = 'approved') / count(*), 1) AS approved_pct
FROM final f CROSS JOIN switch s
GROUP BY 1
ORDER BY 1 DESC;
