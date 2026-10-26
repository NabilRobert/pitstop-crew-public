-- What the critic decided about each output in the end. An output's final
-- version is the one no later revision replaced. Critic rows themselves
-- are excluded.
WITH final AS (
  SELECT o.*
  FROM ai_outputs o
  WHERE o.agent_type <> 'critic'
    AND NOT EXISTS (SELECT 1 FROM ai_outputs r WHERE r.revises_id = o.id)
)
SELECT to_char(created_at, 'YYYY-MM')                          AS month,
       count(*)                                                AS final_outputs,
       count(*) FILTER (WHERE status = 'approved')             AS approved,
       count(*) FILTER (WHERE status = 'flagged')              AS flagged,
       count(*) FILTER (WHERE status NOT IN ('approved', 'flagged')) AS never_reviewed,
       round(100.0 * count(*) FILTER (WHERE status = 'approved') / count(*), 1) AS approved_pct
FROM final
GROUP BY 1
ORDER BY 1;
