-- The original Learning-page chart counted every draft and revision, so a
-- critic that sends first drafts back keeps that rate high whatever the
-- final quality. Counting only final versions is what moved. Both, by month.
WITH rows AS (
  SELECT o.*,
         NOT EXISTS (SELECT 1 FROM ai_outputs r WHERE r.revises_id = o.id) AS is_final
  FROM ai_outputs o
  WHERE o.agent_type <> 'critic'
)
SELECT to_char(created_at, 'YYYY-MM')                                          AS month,
       round(100.0 * count(*) FILTER (WHERE status = 'flagged') / count(*), 1) AS flagged_pct_all_rows,
       round(100.0 * count(*) FILTER (WHERE is_final AND status = 'flagged')
             / nullif(count(*) FILTER (WHERE is_final), 0), 1)                 AS flagged_pct_final_only
FROM rows
GROUP BY 1
ORDER BY 1;
