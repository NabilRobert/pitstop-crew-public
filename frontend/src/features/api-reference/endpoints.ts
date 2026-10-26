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
  { id: 'auth', label: 'Auth & status' },
  { id: 'campaigns', label: 'Campaigns & performance' },
  { id: 'reports', label: 'Reports' },
  { id: 'outputs', label: 'Outputs & Ask' },
  { id: 'pipeline', label: 'Pipeline & ops' },
  { id: 'keyword-optimizer', label: 'Keyword optimizer' },
  { id: 'assistant', label: 'Aska & voice' },
  { id: 'settings', label: 'Settings' },
  { id: 'learning', label: 'Learning' },
  { id: 'time-machine', label: 'Time Machine' },
  { id: 'notes', label: 'Worth knowing' },
]

export const AUTH_ENDPOINTS: EndpointDef[] = [
  { method: 'GET', path: '/health', desc: '{status:"ok"}. No token needed.' },
  { method: 'GET', path: '/config', desc: '{data_source:"demo"|"live"}. No token needed. Drives the "Demo Mode" badge.' },
  { method: 'POST', path: '/auth/login', desc: '{username, password} → {token, role}, role is "owner" or "demo". 401 {detail} for a wrong login. Five failed attempts from one address lock that address out for 15 minutes.' },
  { method: 'POST', path: '/auth/logout', desc: 'Ends the bearer token → {ok:true}.' },
  { method: 'GET', path: '/auth/verify', desc: '{ok:true, role}. Used on page load to re-sync the role for a token kept in the browser; 401 if the token is no longer valid.' },
]

export const CAMPAIGNS_ENDPOINTS: EndpointDef[] = [
  { method: 'GET', path: '/campaigns', desc: 'List all campaigns. Each has simulated: true when it was created by a simulated launch (it has no performance rows and does not exist in Google Ads).' },
  { method: 'GET', path: '/performance?days=30', desc: 'Time-series performance for the trailing N days.' },
  { method: 'GET', path: '/segments/performance?days=30', desc: 'Performance broken down by audience segment.' },
  { method: 'GET', path: '/ad-groups/performance?days=30&campaignId=', desc: 'Per-day performance of ad groups. campaignId scopes to one campaign; omitted returns every campaign that has ad groups (the Search campaigns).' },
  { method: 'GET', path: '/keywords/performance?days=30&adGroupId=', desc: 'Per-day keyword performance with Quality Score and its three diagnostic sub-scores, bids, impression share and conversion value. adGroupId scopes to one ad group. null means "no data", never zero.' },
  { method: 'GET', path: '/search-terms/performance?days=30&keywordId=', desc: 'Per-day search-term performance, with the intent label where one was assigned (null when not classified). keywordId scopes to one keyword.' },
  { method: 'GET', path: '/ads/performance?days=30&adGroupId=', desc: 'Per-day performance of ads, with their ad strength. adGroupId scopes to one ad group.' },
  { method: 'GET', path: '/conversion-actions/performance?days=30', desc: 'Conversions broken down by named conversion action (calls, WhatsApp clicks, financing page visits, ...), account-wide.' },
  { method: 'GET', path: '/asset-groups/performance?days=30', desc: 'Performance Max asset groups. Every row is PMax, so there is no campaign filter.' },
  { method: 'GET', path: '/recommendations?days=30', desc: "Google's own recommendations for the account (a list of suggestion objects, not a performance metric)." },
  { method: 'GET', path: '/change-events?days=30', desc: 'Account change history: who changed what, and when.' },
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
  { method: 'GET', path: '/outputs/:id/ask-conversations', desc: "That report's Ask conversation threads, most recently active first. 404 if the output does not exist." },
  { method: 'POST', path: '/outputs/:id/ask-conversations', desc: 'Starts a new, empty thread for that report → {id}. It gets a title when its first question is asked.' },
  { method: 'GET', path: '/ask-conversations/:id/messages', desc: 'The messages in one thread, oldest first.' },
  { method: 'POST', path: '/ask', desc: 'Ask a follow-up question about a report: {output_id, conversation_id, question, language?}. The answer comes from the same data the report used.' },
]

export const PIPELINE_ENDPOINTS: EndpointDef[] = [
  {
    method: 'GET',
    path: '/system-health',
    desc: '{last_successful_daily_run, recent_runs} — last successful run + recent run log.',
  },
  { method: 'GET', path: '/pipeline/runs?limit=20', desc: 'Run Inspector: the newest runs with status, duration, total cost and model-call count. limit 1-100. A demo viewer gets error text redacted to one line.' },
  { method: 'GET', path: '/pipeline/runs/:id/trace', desc: "A run's trace as a flat list (parent_id and seq give the tree), without prompt or response text. 404 if unknown id." },
  { method: 'GET', path: '/trace/events/:id/payloads', desc: 'The stored prompt, response and context text of one trace step (kept 30 days, secrets redacted before storing). 404 if unknown id.' },
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
    path: '/keyword-suggestions/:id/brief?format=csv|txt',
    desc: 'A paste-ready brief for a campaign proposal (new_campaign) to build by hand in Google Ads Editor. The CSV columns have not been checked against a real Editor export yet, so the response carries X-Editor-Columns: UNVERIFIED.',
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

export const ASSISTANT_ENDPOINTS: EndpointDef[] = [
  { method: 'GET', path: '/assistant/conversations', desc: "Aska's conversation threads, most recently active first. Aska is a general assistant, not tied to one report." },
  { method: 'POST', path: '/assistant/conversations', desc: 'Starts a new, empty thread → {id}.' },
  { method: 'GET', path: '/assistant/conversations/:id/messages', desc: 'The messages in one thread, oldest first.' },
  { method: 'PATCH', path: '/assistant/conversations/:id', desc: '{title}: renames a thread. 400 if the title is missing, 404 if unknown.' },
  { method: 'DELETE', path: '/assistant/conversations/:id', desc: 'Deletes a thread and its messages → 204.' },
  { method: 'POST', path: '/assistant/ask', desc: '{conversation_id, question, language?} → the answer, saved to the thread.' },
  { method: 'POST', path: '/tts', desc: '{text, agentType} → audio bytes, streamed through from the voice provider (the provider key never reaches the browser).' },
  { method: 'POST', path: '/stt', desc: 'Multipart: audio file plus an optional language ("en"/"id") → {text}. Pinning the language avoids unreliable auto-detection on short clips.' },
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
  { method: 'GET', path: '/learning/flag-rate?weeks=8', desc: "The older flag-rate series the Learning page used to chart. It counts drafts as well as final outputs, so it is kept for reference only; use grade-trend." },
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
