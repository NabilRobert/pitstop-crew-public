<script setup>
import { useI18n } from 'vue-i18n'
import { BASE_URL } from '../../shared/api/api'

const { t } = useI18n()

const SECTIONS = [
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

const CAMPAIGNS_ENDPOINTS = [
  { method: 'GET', path: '/campaigns', desc: 'List all campaigns.' },
  { method: 'GET', path: '/performance?days=30', desc: 'Time-series performance for the trailing N days.' },
  { method: 'GET', path: '/segments/performance?days=30', desc: 'Performance broken down by audience segment.' },
]

const REPORTS_ENDPOINTS = [
  { method: 'GET', path: '/reports?period=daily|weekly', desc: 'List available report dates.' },
  { method: 'GET', path: '/reports/latest?period=...', desc: 'The most recent report.' },
  {
    method: 'GET',
    path: '/reports/:id',
    desc: "One report by its ai_outputs.id — not date, so two runs on the same date each stay reachable. Registered after /reports/latest so the literal path isn't shadowed.",
  },
]

const OUTPUTS_ENDPOINTS = [
  { method: 'GET', path: '/outputs/:id', desc: 'Raw output record.' },
  { method: 'GET', path: '/outputs/:id/why-trail', desc: "The critic's revision history for that output." },
  { method: 'GET', path: '/outputs/:id/ask-history', desc: 'Prior Q&A on that output.' },
  { method: 'POST', path: '/ask', desc: 'Ask Rico/Sammy a follow-up question, {output_id, question}.' },
]

const PIPELINE_ENDPOINTS = [
  {
    method: 'GET',
    path: '/system-health',
    desc: '{last_successful_daily_run, recent_runs} — last successful run + recent run log.',
  },
  {
    method: 'GET',
    path: '/pipeline/runs/:id',
    desc: "One pipeline_runs row: {id, run_type, started_at, finished_at, status, cost_usd_micros, error_message}. status is \"running\" while in flight, else \"success\"|\"failure\"|\"partial\". 404 if unknown id.",
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

const SETTINGS_ENDPOINTS = [
  { method: 'GET', path: '/settings', desc: 'Current settings (run times, recipient email, etc.).' },
  {
    method: 'PUT',
    path: '/settings',
    desc: 'Update settings — generic over the known setting keys, so a new setting never needs a route change.',
  },
]

const LEARNING_ENDPOINTS = [
  { method: 'GET', path: '/learning/flag-rate?weeks=8', desc: 'Trend of how often the critic flags issues.' },
  { method: 'GET', path: '/learning/suggestions?limit=20', desc: 'History of suggested prompt patches.' },
]

const TIME_MACHINE_ENDPOINTS = [
  {
    method: 'POST',
    path: '/time-machine/override',
    desc: 'Pin a Markov state (good/bad/standstill/volatile) for a date.',
  },
  { method: 'GET', path: '/time-machine/overrides', desc: 'List all pinned overrides.' },
  { method: 'DELETE', path: '/time-machine/override/:date', desc: 'Clear one.' },
]

const METHOD_COLOR = {
  GET: 'text-flag-good',
  POST: 'text-rosso',
  PUT: 'text-flag-caution',
  DELETE: 'text-flag-critical',
}
</script>

<template>
  <main class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="mb-2 font-display text-2xl font-bold text-ink">{{ t('apiReference.title') }}</h1>
    <p class="mb-8 text-sm text-ink-faint">
      {{ t('apiReference.subtitle') }}
    </p>

    <nav class="mb-10 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-surface p-4">
      <a
        v-for="s in SECTIONS"
        :key="s.id"
        :href="`#${s.id}`"
        class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-rosso"
      >
        {{ s.label }}
      </a>
    </nav>

    <div class="agent-prose space-y-10">
      <section id="overview">
        <h2 class="!mt-0">Overview</h2>
        <p>
          A single Express app (<code>src/api/main.ts</code>), routes split one file per resource under
          <code>src/api/routes/</code>.
        </p>
        <p>
          Base URL for this frontend's current configuration —
          <code>{{ BASE_URL }}</code>
        </p>
        <ul>
          <li>JSON body parsing, CORS locked to one origin (<code>FRONTEND_ORIGIN</code> in <code>.env</code>).</li>
          <li>No auth on this boundary at all, by design — a single-user app.</li>
          <li>
            Error responses are shaped <code>{ detail: "..." }</code> everywhere — a holdover from when this was a
            FastAPI backend, so frontend error handling never had to change.
          </li>
        </ul>
        <pre class="overflow-x-auto rounded-md border border-border bg-surface-raised p-3 text-xs"><code>curl {{ BASE_URL }}/health
# {"status":"ok"}

curl {{ BASE_URL }}/config
# {"data_source":"demo"|"live"} — drives the "Demo Mode" badge</code></pre>
      </section>

      <section id="campaigns">
        <h2>Campaigns & performance</h2>
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="py-2 pr-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Method & path</th>
              <th class="py-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Does</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in CAMPAIGNS_ENDPOINTS" :key="e.path" class="border-b border-border/60 last:border-0">
              <td class="py-2 pr-3 align-top font-mono text-xs whitespace-nowrap">
                <span :class="METHOD_COLOR[e.method]" class="font-bold">{{ e.method }}</span> {{ e.path }}
              </td>
              <td class="py-2 align-top text-ink-soft">{{ e.desc }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="reports">
        <h2>Reports — daily/weekly AI-generated reports</h2>
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="py-2 pr-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Method & path</th>
              <th class="py-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Does</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in REPORTS_ENDPOINTS" :key="e.path" class="border-b border-border/60 last:border-0">
              <td class="py-2 pr-3 align-top font-mono text-xs whitespace-nowrap">
                <span :class="METHOD_COLOR[e.method]" class="font-bold">{{ e.method }}</span> {{ e.path }}
              </td>
              <td class="py-2 align-top text-ink-soft">{{ e.desc }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="outputs">
        <h2>Outputs & Ask — drilling into an individual AI output</h2>
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="py-2 pr-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Method & path</th>
              <th class="py-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Does</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in OUTPUTS_ENDPOINTS" :key="e.path" class="border-b border-border/60 last:border-0">
              <td class="py-2 pr-3 align-top font-mono text-xs whitespace-nowrap">
                <span :class="METHOD_COLOR[e.method]" class="font-bold">{{ e.method }}</span> {{ e.path }}
              </td>
              <td class="py-2 align-top text-ink-soft">{{ e.desc }}</td>
            </tr>
          </tbody>
        </table>
        <pre class="overflow-x-auto rounded-md border border-border bg-surface-raised p-3 text-xs"><code>curl -X POST {{ BASE_URL }}/ask \
  -H "Content-Type: application/json" \
  -d '{"output_id": 42, "question": "Why did the Brand campaign dip on Tuesday?"}'</code></pre>
      </section>

      <section id="pipeline">
        <h2>Pipeline & ops</h2>
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="py-2 pr-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Method & path</th>
              <th class="py-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Does</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in PIPELINE_ENDPOINTS" :key="e.path" class="border-b border-border/60 last:border-0">
              <td class="py-2 pr-3 align-top font-mono text-xs whitespace-nowrap">
                <span :class="METHOD_COLOR[e.method]" class="font-bold">{{ e.method }}</span> {{ e.path }}
              </td>
              <td class="py-2 align-top text-ink-soft">{{ e.desc }}</td>
            </tr>
          </tbody>
        </table>
        <pre class="overflow-x-auto rounded-md border border-border bg-surface-raised p-3 text-xs"><code>curl -X POST {{ BASE_URL }}/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"period":"daily"}'
# → {"started":true,"period":"daily","target_date":"...","runId":123}

curl {{ BASE_URL }}/pipeline/runs/123
# → {"id":123,"run_type":"daily","started_at":"...","finished_at":null,
#     "status":"running","cost_usd_micros":null,"error_message":null}

# Watch it live, scoped to just this run (-N disables curl's buffering
# so each SSE event shows up as it's emitted):
curl -N "{{ BASE_URL }}/console/stream?runId=123"</code></pre>

        <h3>Wiring "trigger a run and show progress" in a browser client</h3>
        <p>This is the one worth getting right, since the shape changed:</p>
        <pre class="overflow-x-auto rounded-md border border-border bg-surface-raised p-3 text-xs"><code>const res = await fetch(`${API_BASE}/pipeline/run`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ period: 'daily' }),
})
if (res.status === 409) { /* a run is already in progress — disable the trigger button */ }
const { runId } = await res.json()

// Option A: live progress via SSE, scoped to just this run
const es = new EventSource(`${API_BASE}/console/stream?runId=${runId}`)
es.onmessage = (e) => {
  const event = JSON.parse(e.data) // {seq, timestamp, level, message, runId}
  // append to a log panel; EventSource auto-reconnects and resumes via
  // Last-Event-ID on its own — no extra code needed for that part
}

// Option B: simple polling instead of holding a connection open
const poll = setInterval(async () => {
  const run = await fetch(`${API_BASE}/pipeline/runs/${runId}`).then(r => r.json())
  if (run.status !== 'running') {
    clearInterval(poll)
    // run.status is 'success' | 'failure' | 'partial'; run.error_message set if not success
  }
}, 3000)</code></pre>
        <p class="text-sm">
          Both are valid — SSE if you want a live log feed, polling if you just want a "done/not done" signal
          without an open connection.
        </p>
      </section>

      <section id="settings">
        <h2>Settings</h2>
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="py-2 pr-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Method & path</th>
              <th class="py-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Does</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in SETTINGS_ENDPOINTS" :key="e.path" class="border-b border-border/60 last:border-0">
              <td class="py-2 pr-3 align-top font-mono text-xs whitespace-nowrap">
                <span :class="METHOD_COLOR[e.method]" class="font-bold">{{ e.method }}</span> {{ e.path }}
              </td>
              <td class="py-2 align-top text-ink-soft">{{ e.desc }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-sm">
          Valid keys: <code>daily_run_time</code>, <code>weekly_run_time</code> (HH:MM),
          <code>grade_forces_revision</code> ("true"/"false"), <code>report_recipient_email</code>,
          <code>report_language</code> ("en"/"id"). Unknown keys are silently ignored, invalid values 400.
        </p>
      </section>

      <section id="learning">
        <h2>Learning — the critic-feedback self-improvement loop</h2>
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="py-2 pr-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Method & path</th>
              <th class="py-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Does</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in LEARNING_ENDPOINTS" :key="e.path" class="border-b border-border/60 last:border-0">
              <td class="py-2 pr-3 align-top font-mono text-xs whitespace-nowrap">
                <span :class="METHOD_COLOR[e.method]" class="font-bold">{{ e.method }}</span> {{ e.path }}
              </td>
              <td class="py-2 align-top text-ink-soft">{{ e.desc }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="time-machine">
        <h2>Time Machine — demo-mode calendar control</h2>
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="py-2 pr-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Method & path</th>
              <th class="py-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Does</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in TIME_MACHINE_ENDPOINTS" :key="e.path" class="border-b border-border/60 last:border-0">
              <td class="py-2 pr-3 align-top font-mono text-xs whitespace-nowrap">
                <span :class="METHOD_COLOR[e.method]" class="font-bold">{{ e.method }}</span> {{ e.path }}
              </td>
              <td class="py-2 align-top text-ink-soft">{{ e.desc }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-sm">Only meaningful with <code>DATA_SOURCE=demo</code>.</p>
      </section>

      <section id="notes">
        <h2>Worth knowing if you extend this</h2>
        <ul>
          <li>
            <code>POST /pipeline/run</code> is intentionally not wrapped in the usual async error handler. It
            creates the <code>pipeline_runs</code> row and responds with its <code>runId</code> immediately, then
            keeps running the real pipeline after the response is sent — progress is visible via
            <code>/console/stream</code> or by polling <code>GET /pipeline/runs/:id</code>, not the HTTP response
            itself.
          </li>
          <li>
            "Only one run at a time" is enforced by a Postgres partial unique index
            (<code>idx_pipeline_runs_one_running</code>), not an in-memory flag — correct across both the API
            process and the separate cron script, not just within one process.
          </li>
          <li>
            <code>reconcileOrphanedRuns()</code> runs at boot in both <code>main.ts</code> and
            <code>scripts/runDaily.ts</code>, auto-marking any run left <code>status='running'</code> by a crash as
            <code>failure</code> with an explanatory message — so a crashed run can't permanently block new ones via
            the unique index above.
          </li>
          <li>
            <code>/console/stream</code> is plain SSE, no socket.io or client library — a kept-open response with a
            20s heartbeat (needed once Caddy sat in front of it) and <code>Last-Event-ID</code> resume support;
            <code>emitEvent</code>/<code>subscribe</code> from <code>src/platform/eventBus.ts</code> fan out to any
            open streams, optionally filtered to one <code>runId</code>.
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
