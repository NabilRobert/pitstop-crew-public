-- Final outcomes before and after severity-based approval went live. The
-- switch date is taken from the data itself: the first critic review whose
-- issues carry a severity (it matches the commit's date, 2026-09-28).
WITH switch AS (
  SELECT min(created_at) AS t
  FROM ai_outputs
  WHERE agent_type = 'critic' AND jsonb_path_exists(issues, '$[*].severity')
),
final AS (
  SELECT o.*
  FROM ai_outputs o
  WHERE o.agent_type <> 'critic'
    AND NOT EXISTS (SELECT 1 FROM ai_outputs r WHERE r.revises_id = o.id)
)
SELECT CASE WHEN f.created_at < s.t THEN 'before' ELSE 'after' END            AS period,
       min(s.t)::date                                                          AS switch_day,
       count(*)                                                                AS final_outputs,
       count(*) FILTER (WHERE f.status = 'approved')                           AS approved,
       count(*) FILTER (WHERE f.status = 'flagged')                            AS flagged,
       round(100.0 * count(*) FILTER (WHERE f.status = 'approved') / count(*), 1) AS approved_pct
FROM final f CROSS JOIN switch s
GROUP BY 1
ORDER BY 1 DESC;
