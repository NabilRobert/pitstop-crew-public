-- The letter grade on each critic review, by month.
SELECT to_char(created_at, 'YYYY-MM')               AS month,
       count(*)                                     AS reviews,
       count(*) FILTER (WHERE grade = 'A')          AS a,
       count(*) FILTER (WHERE grade = 'B')          AS b,
       count(*) FILTER (WHERE grade = 'C')          AS c,
       count(*) FILTER (WHERE grade = 'D')          AS d,
       count(*) FILTER (WHERE grade = 'F')          AS f,
       count(*) FILTER (WHERE grade IS NULL)        AS ungraded
FROM ai_outputs
WHERE agent_type = 'critic'
GROUP BY 1
ORDER BY 1;
