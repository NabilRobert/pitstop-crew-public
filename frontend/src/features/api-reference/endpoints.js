export const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'campaigns', label: 'Campaigns & performance' },
  { id: 'reports', label: 'Reports' },
  { id: 'outputs', label: 'Outputs & Ask' },
  { id: 'pipeline', label: 'Pipeline & ops' },
  { id: 'settings', label: 'Settings' },
  { id: 'learning', label: 'Learning' },
  { id: 'time-machine', label: 'Time Machine' },
  { id: 'notes', label: 'Worth knowing' },
]

export const CAMPAIGNS_ENDPOINTS = [
  { method: 'GET', path: '/campaigns', desc: 'List all campaigns.' },
  { method: 'GET', path: '/performance?days=30', desc: 'Time-series performance for the trailing N days.' },
  { method: 'GET', path: '/segments/performance?days=30', desc: 'Performance broken down by audience segment.' },
]

export const REPORTS_ENDPOINTS = [
  { method: 'GET', path: '/reports?period=daily|weekly', desc: 'List available report dates.' },
  { method: 'GET', path: '/reports/latest?period=...', desc: 'The most recent report.' },
  {
    method: 'GET',
    path: '/reports/:id',
    desc: "One report by its ai_outputs.id — not date, so two runs on the same date each stay reachable. Registered after /reports/latest so the literal path isn't shadowed.",
  },
]

export const OUTPUTS_ENDPOINTS = [
  { method: 'GET', path: '/outputs/:id', desc: 'Raw output record.' },
  { method: 'GET', path: '/outputs/:id/why-trail', desc: "The critic's revision history for that output." },
  { method: 'GET', path: '/outputs/:id/ask-history', desc: 'Prior Q&A on that output.' },
  { method: 'POST', path: '/ask', desc: 'Ask Rico/Sammy a follow-up question, {output_id, question}.' },
]

export const PIPELINE_ENDPOINTS = [
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

export const SETTINGS_ENDPOINTS = [
  { method: 'GET', path: '/settings', desc: 'Current settings (run times, recipient email, etc.).' },
  {
    method: 'PUT',
    path: '/settings',
    desc: 'Update settings — generic over the known setting keys, so a new setting never needs a route change.',
  },
]

export const LEARNING_ENDPOINTS = [
  { method: 'GET', path: '/learning/flag-rate?weeks=8', desc: 'Trend of how often the critic flags issues.' },
  { method: 'GET', path: '/learning/suggestions?limit=20', desc: 'History of suggested prompt patches.' },
]

export const TIME_MACHINE_ENDPOINTS = [
  {
    method: 'POST',
    path: '/time-machine/override',
    desc: 'Pin a Markov state (good/bad/standstill/volatile) for a date.',
  },
  { method: 'GET', path: '/time-machine/overrides', desc: 'List all pinned overrides.' },
  { method: 'DELETE', path: '/time-machine/override/:date', desc: 'Clear one.' },
]

export const METHOD_COLOR = {
  GET: 'text-flag-good',
  POST: 'text-rosso',
  PUT: 'text-flag-caution',
  DELETE: 'text-flag-critical',
}
