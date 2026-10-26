-- The app's own schedule switches as they stood in the snapshot: why the
-- scheduled reports stopped while the keyword optimizer kept running.
SELECT key, value
FROM app_settings
WHERE key IN ('auto_reports_enabled', 'keyword_optimizer_enabled')
ORDER BY key;
