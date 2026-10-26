-- Every run that didn't fully succeed, with its recorded cause mapped to a
-- category. Raw messages aren't published: some carry provider account and
-- trace IDs. The mapping below is the whole classification.
SELECT id,
       run_type,
       status,
       started_at::date AS day,
       CASE
         WHEN error_message ILIKE '%timed out%' AND error_message NOT ILIKE '%external timeout%'
              THEN 'model gateway timed out'
         WHEN error_message ILIKE 'Orphaned run reconciled%'
              THEN 'process restarted mid-run; marked failed by startup recovery'
         WHEN error_message ILIKE '%external timeout during manual diagnostics%'
              THEN 'aborted by the operator during manual diagnostics'
         WHEN error_message ILIKE '%no-model run%'
              THEN 'model step skipped by design (no-model run); suggestions stored unranked'
         WHEN error_message ILIKE '%account overdue%' OR error_message ILIKE '%ExceededBudget%'
              THEN 'model provider refused the call (billing); suggestions stored unranked'
         ELSE 'UNCLASSIFIED'
       END AS cause
FROM pipeline_runs
WHERE status IN ('failure', 'partial')
ORDER BY started_at;
