<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BASE_URL } from '../../shared/api/api'
import {
  SECTIONS,
  CAMPAIGNS_ENDPOINTS,
  REPORTS_ENDPOINTS,
  OUTPUTS_ENDPOINTS,
  PIPELINE_ENDPOINTS,
  KEYWORD_OPTIMIZER_ENDPOINTS,
  SETTINGS_ENDPOINTS,
  LEARNING_ENDPOINTS,
  TIME_MACHINE_ENDPOINTS,
  METHOD_COLOR,
} from './endpoints.js'

const { t } = useI18n()
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
        class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-accent-ink"
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
          <li>
            Everything except <code>/health</code>, <code>/config</code> and <code>POST /auth/login</code> needs a
            bearer token from the login. The owner account has full access; the optional demo account is read-only,
            enforced server-side (every non-GET gets a 403, not just hidden buttons).
          </li>
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

      <section id="keyword-optimizer">
        <h2>Keyword optimizer — suggestions, inventory and the weekly run</h2>
        <table class="w-full min-w-max border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border">
              <th class="py-2 pr-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Method & path</th>
              <th class="py-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Does</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in KEYWORD_OPTIMIZER_ENDPOINTS" :key="e.method + e.path" class="border-b border-border/60 last:border-0">
              <td class="py-2 pr-3 align-top font-mono text-xs">
                <span :class="METHOD_COLOR[e.method]" class="font-bold">{{ e.method }}</span> {{ e.path }}
              </td>
              <td class="py-2 align-top text-ink-soft">{{ e.desc }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-sm">
          The existing <code>GET /keywords/performance</code> and <code>GET /search-terms/performance</code> only
          gained fields (bids, impression share, conversion value, search-term intent); nothing was removed.
          <code>intent</code> is <code>null</code> for a term that has not been classified. In every response,
          <code>null</code> means "no data", never zero.
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
          <code>report_recipient_email</code>, <code>auto_reports_enabled</code> ("true"/"false"),
          <code>report_language</code> ("en"/"id"), <code>monthly_cost_cap_usd</code> (a positive number, or empty
          to disable — blocks new pipeline runs once this month's total AI cost reaches it), and the keyword
          optimizer's <code>keyword_optimizer_enabled</code> ("true"/"false"), <code>keyword_test_budget_share</code>,
          <code>keyword_min_confidence_p</code> (above 0), <code>inventory_allowed_spend_share</code> and
          <code>inventory_lead_to_sale_rate</code> (all 0 to 1, as strings). Unknown keys are
          silently ignored, invalid values 400. (<code>grade_forces_revision</code> is still accepted but has no
          effect — D/F grades always block approval.)
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
