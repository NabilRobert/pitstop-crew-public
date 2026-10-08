export interface ApiSection {
  id: string
  label: string
}

export interface EndpointDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  desc: string
}

export const SECTIONS: ApiSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'campaigns', label: 'Campaigns & performance' },
  { id: 'reports', label: 'Reports' },
  { id: 'outputs', label: 'Outputs & Ask' },
  { id: 'pipeline', label: 'Pipeline & ops' },
  { id: 'keyword-optimizer', label: 'Keyword optimizer' },
  { id: 'settings', label: 'Settings' },
  { id: 'learning', label: 'Learning' },
  { id: 'time-machine', label: 'Time Machine' },
  { id: 'notes', label: 'Worth knowing' },
]

export const CAMPAIGNS_ENDPOINTS: EndpointDef[] = [
  { method: 'GET', path: '/campaigns', desc: 'List all campaigns. Each has simulated: true when it was created by a simulated launch (it has no performance rows and does not exist in Google Ads).' },
  { method: 'GET', path: '/performance?days=30', desc: 'Time-series performance for the trailing N days.' },
  { method: 'GET', path: '/segments/performance?days=30', desc: 'Performance broken down by audience segment.' },
]

export const REPORTS_ENDPOINTS: EndpointDef[] = [
  { method: 'GET', path: '/reports?period=daily|weekly', desc: 'List available report dates.' },
  { method: 'GET', path: '/reports/latest?period=...', desc: 'The most recent report.' },
  {
    method: 'GET',
    path: '/reports/:id',
    desc: "One report by its ai_outputs.id — not date, so two runs on the same date each stay reachable. Registered after /reports/latest so the literal path isn't shadowed.",
  },
]

export const OUTPUTS_ENDPOINTS: EndpointDef[] = [
  { method: 'GET', path: '/outputs/:id', desc: 'Raw output record.' },
  { method: 'GET', path: '/outputs/:id/why-trail', desc: "The critic's revision history for that output." },
  { method: 'GET', path: '/outputs/:id/ask-history', desc: 'Prior Q&A on that output.' },
  { method: 'POST', path: '/ask', desc: 'Ask Rico/Sammy a follow-up question, {output_id, question}.' },
]

export const PIPELINE_ENDPOINTS: EndpointDef[] = [
  {
    method: 'GET',
    path: '/system-health',
    desc: '{last_successful_daily_run, recent_runs} — last successful run + recent run log.',
  },
  {
    method: 'GET',
    path: '/pipeline/runs/:id',
    desc: 'One pipeline_runs row: {id, run_type, started_at, finished_at, status, cost_usd_micros, error_message}. status is "running" while in flight, else "success"|"failure"|"partial". 404 if unknown id.',
  },
  {
    method: 'POST',
    path: '/pipeline/run',
    desc: '{period} → {started:true, period, target_date, runId}. Responds immediately; the pipeline runs in the background. 409 {"detail":"A pipeline run is already in progress"} if one already is — enforced at the DB level, correct even across the separate cron job.',
  },
  {
    method: 'GET',
    path: '/console/stream',
    desc: 'SSE — replays recent pipeline events then streams live ones. Optional ?runId=<id> to scope to just that run.',
  },
]

export const KEYWORD_OPTIMIZER_ENDPOINTS: EndpointDef[] = [
  {
    method: 'GET',
    path: '/keyword-suggestions?status=open&type=&campaign_id=&limit=50&offset=0',
    desc: '{items, total, run, inventory}. Ranked (rank ascending, nulls last, then newest). status is open|applied|dismissed|superseded|all, limit 1-200. run is the latest keyword_optimizer run, or null before the first one — a normal state, not an error. Each item carries structured evidence and a type-specific payload; every number comes from those fields, never from the model\'s explanation text.',
  },
  {
    method: 'PATCH',
    path: '/keyword-suggestions/:id',
    desc: '{status: "open"|"planned"|"applied"|"dismissed"}. Owner only (the demo account gets 403). planned is valid only for new_campaign and new_ad suggestions. Any move that is not allowed, or touching a superseded row, is 409. Applied/dismissed is the owner\'s own bookkeeping — nothing is sent to Google Ads.',
  },
  {
    method: 'GET',
    path: '/keyword-suggestions/export?type=negative_keyword&status=open&format=csv|txt',
    desc: 'The open negative keywords as a file to paste or import into Google Ads Editor. Every field is neutralized against spreadsheet formula injection, because search-term text is untrusted input.',
  },
  {
    method: 'GET',
    path: '/inventory/summary',
    desc: 'Stock totals, aging buckets and per-model stock/margin with a snapshot date. Always 200: if the inventory source is down it returns source "unavailable" and a short sanitized error. The connection string is never returned.',
  },
  {
    method: 'GET',
    path: '/keywords/summary?days=30&adGroupId=',
    desc: 'Window aggregates that cannot be derived from the per-day keyword rows: intent mix, how much spend could be classified, waste exposure, conversions by conversion action, and stock.',
  },
  {
    method: 'POST',
    path: '/launches',
    desc: 'Owner only (the demo account gets 403, and the attempt is recorded). {suggestion_id, confirm_name, validate_only}: launches a planned new_campaign (with its planned ads) or a planned new_ad on an existing ad group. confirm_name must be exactly the campaign or ad group name. Checks run in a fixed order (kill switch ads_write_enabled, status, name, then the plan against the current settings). Everything is written paused, in one transaction, into this app\'s own tables as a SIMULATED launch. Nothing is sent to Google Ads. Every call, refusals and failures included, writes an audit row.',
  },
  {
    method: 'GET',
    path: '/launches?limit=20',
    desc: 'The audit log of launch attempts, newest first: who, when, mode, status (validated, created or failed), the objects created and the messages from the checks.',
  },
  {
    method: 'POST',
    path: '/keyword-optimizer/run',
    desc: 'Owner only. Starts a keyword optimizer run on demand → 202 {run_id}. 409 if another run is in progress, 429 at the monthly spend cap — same locking and cap as /pipeline/run.',
  },
]

export const SETTINGS_ENDPOINTS: EndpointDef[] = [
  { method: 'GET', path: '/settings', desc: 'Current settings (run times, recipient email, etc.).' },
  {
    method: 'PUT',
    path: '/settings',
    desc: 'Update settings — generic over the known setting keys, so a new setting never needs a route change.',
  },
]

export const LEARNING_ENDPOINTS: EndpointDef[] = [
  { method: 'GET', path: '/learning/grade-trend?weeks=8', desc: 'Weekly critic outcomes per agent (approved clean / with notes / flagged / no review) on final outputs, plus deploy events.' },
  { method: 'GET', path: '/learning/suggestions?limit=20', desc: 'History of suggested prompt patches.' },
]

export const TIME_MACHINE_ENDPOINTS: EndpointDef[] = [
  {
    method: 'POST',
    path: '/time-machine/override',
    desc: 'Pin a Markov state (good/bad/standstill/volatile) for a date.',
  },
  { method: 'GET', path: '/time-machine/overrides', desc: 'List all pinned overrides.' },
  { method: 'DELETE', path: '/time-machine/override/:date', desc: 'Clear one.' },
]

export const METHOD_COLOR: Record<EndpointDef['method'], string> = {
  GET: 'text-flag-good',
  POST: 'text-accent-ink',
  PUT: 'text-flag-caution',
  PATCH: 'text-flag-caution',
  DELETE: 'text-flag-critical',
}
