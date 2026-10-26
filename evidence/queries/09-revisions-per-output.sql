-- How many revisions each output went through before its final version,
-- by agent. The critic loop allows at most two.
WITH RECURSIVE chain AS (
  SELECT o.id AS root, o.id, o.agent_type, 0 AS depth
  FROM ai_outputs o
  WHERE o.agent_type <> 'critic' AND o.revises_id IS NULL
  UNION ALL
  SELECT c.root, r.id, c.agent_type, c.depth + 1
  FROM chain c JOIN ai_outputs r ON r.revises_id = c.id
),
per_output AS (
  SELECT root, agent_type, max(depth) AS revisions FROM chain GROUP BY root, agent_type
)
SELECT agent_type,
       count(*)                                    AS outputs,
       count(*) FILTER (WHERE revisions = 0)       AS no_revision,
       count(*) FILTER (WHERE revisions = 1)       AS one_revision,
       count(*) FILTER (WHERE revisions = 2)       AS two_revisions,
       count(*) FILTER (WHERE revisions > 2)       AS more_than_two
FROM per_output
GROUP BY agent_type
ORDER BY agent_type;
