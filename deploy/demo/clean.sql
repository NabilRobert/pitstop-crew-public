-- Cleans a restored copy of Pitstop's database before it becomes the public
-- demo's data. Runs on a throwaway local restore, never on the live database.
-- Every change is listed here; the checks at the end fail the whole run if
-- anything they look for survives.
\set ON_ERROR_STOP on
BEGIN;

-- The owner's real email address (the report recipient).
UPDATE app_settings SET value = '' WHERE key = 'report_recipient_email';

-- The dealer's WhatsApp number, wherever it was copied: settings, the
-- agents' outputs, and the stored prompts and context in traces.
CREATE TEMP TABLE wa AS SELECT value FROM app_settings WHERE key = 'dealer_whatsapp' AND value <> '';
UPDATE ai_outputs     SET content = replace(content, (SELECT value FROM wa), '+62 800 0000 0000') WHERE EXISTS (SELECT 1 FROM wa) AND content LIKE '%' || (SELECT value FROM wa) || '%';
UPDATE trace_payloads SET content = replace(content, (SELECT value FROM wa), '+62 800 0000 0000') WHERE EXISTS (SELECT 1 FROM wa) AND content LIKE '%' || (SELECT value FROM wa) || '%';
UPDATE app_settings   SET value = '+62 800 0000 0000' WHERE key = 'dealer_whatsapp';

-- Any other Indonesian phone number in free text, whatever its source.
UPDATE ai_outputs     SET content = regexp_replace(content, '(\+62|\m62|\m08)[0-9]{8,12}\M', '+62 800 0000 0000', 'g') WHERE content ~ '(\+62|\m62|\m08)[0-9]{8,12}\M';
UPDATE trace_payloads SET content = regexp_replace(content, '(\+62|\m62|\m08)[0-9]{8,12}\M', '+62 800 0000 0000', 'g') WHERE content ~ '(\+62|\m62|\m08)[0-9]{8,12}\M';

-- The owner's own questions to the Ask assistant. Demo visitors can't ask
-- (the demo account is read-only), so the history isn't needed.
TRUNCATE ask_log, assistant_ask_log, ask_conversations, assistant_conversations RESTART IDENTITY CASCADE;

-- Raw provider error text carries account and trace IDs, spend figures and
-- billing details. Runs get the same cause categories the evidence uses
-- (evidence/queries/03-failures.sql); trace events get the category, and
-- lose the error's stack.
UPDATE pipeline_runs SET error_message = CASE
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
    ELSE 'failed (details removed for the public demo)'
  END
WHERE status IN ('failure', 'partial') AND error_message IS NOT NULL;
UPDATE trace_events
SET error_message = CASE WHEN error_message IS NULL THEN NULL ELSE 'model provider refused the call (billing)' END,
    summary       = CASE WHEN summary IS NULL THEN NULL ELSE 'model provider refused the call (billing)' END,
    meta          = CASE WHEN meta ? 'stack' THEN meta - 'stack' ELSE meta END
WHERE coalesce(error_message, '') ~* 'overdue|ExceededBudget'
   OR coalesce(summary, '') ~* 'overdue|ExceededBudget'
   OR coalesce(meta::text, '') ~* 'overdue|ExceededBudget';

-- Belt and braces: the demo server has no crontab and no model key, but
-- the app's own switches say "off" too.
UPDATE app_settings SET value = 'false' WHERE key IN ('auto_reports_enabled', 'keyword_optimizer_enabled', 'ads_write_enabled');

-- Checks: abort if anything personal survived.
DO $$
DECLARE wa_value text := (SELECT value FROM wa);
BEGIN
  IF EXISTS (SELECT 1 FROM app_settings WHERE value ~* '@gmail\.com') THEN
    RAISE EXCEPTION 'a gmail address is still in app_settings';
  END IF;
  IF EXISTS (SELECT 1 FROM ask_log) OR EXISTS (SELECT 1 FROM assistant_ask_log) THEN
    RAISE EXCEPTION 'ask history is not empty';
  END IF;
  IF EXISTS (SELECT 1 FROM ai_outputs WHERE content ~ '(\+62|\m62|\m08)[0-9]{8,12}\M')
     OR EXISTS (SELECT 1 FROM trace_payloads WHERE content ~ '(\+62|\m62|\m08)[0-9]{8,12}\M') THEN
    RAISE EXCEPTION 'a phone number survived';
  END IF;
  IF EXISTS (SELECT 1 FROM pipeline_runs WHERE error_message ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|overdue|ExceededBudget|litellm|trace_id|Spend=|conversation history')
     OR EXISTS (SELECT 1 FROM trace_events WHERE concat_ws(' ', error_message, summary, meta::text) ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|overdue|ExceededBudget|litellm|Spend=') THEN
    RAISE EXCEPTION 'raw provider error text survived';
  END IF;
  IF wa_value IS NOT NULL AND wa_value <> '+62 800 0000 0000' AND (
       EXISTS (SELECT 1 FROM ai_outputs WHERE content LIKE '%' || wa_value || '%')
    OR EXISTS (SELECT 1 FROM trace_payloads WHERE content LIKE '%' || wa_value || '%')) THEN
    RAISE EXCEPTION 'the dealer WhatsApp number survived';
  END IF;
END $$;

COMMIT;
