-- Agent outputs saved with empty content, by month. A blank model
-- response used to be stored as a draft; it now retries, then fails loudly.
SELECT to_char(created_at, 'YYYY-MM')                    AS month,
       count(*)                                          AS outputs,
       count(*) FILTER (WHERE btrim(content) = '')       AS blank,
       max(created_at) FILTER (WHERE btrim(content) = '')::date AS last_blank_day
FROM ai_outputs
WHERE agent_type <> 'critic'
GROUP BY 1
ORDER BY 1;
