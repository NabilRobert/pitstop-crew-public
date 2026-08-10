<script setup>
import { ref, computed, onMounted } from 'vue'
import { Line } from 'vue-chartjs'
import { api } from '../lib/api'
import { CHART_COLORS, baseChartOptions } from '../lib/chartTheme'
import { formatDate } from '../lib/format'
import { renderMarkdown } from '../lib/markdown'

const loading = ref(true)
const error = ref(null)
const flagRate = ref([])
const suggestions = ref([])

const chartData = computed(() => ({
  labels: flagRate.value.map((w) => formatDate(w.week)),
  datasets: [
    {
      data: flagRate.value.map((w) => (w.total ? Math.round((w.flagged / w.total) * 1000) / 10 : 0)),
      borderColor: CHART_COLORS.giallo,
      backgroundColor: `${CHART_COLORS.giallo}33`,
      pointBackgroundColor: CHART_COLORS.giallo,
      pointRadius: 3,
      tension: 0.3,
      fill: true,
    },
  ],
}))

const chartOptions = {
  ...baseChartOptions,
  scales: {
    ...baseChartOptions.scales,
    y: { ...baseChartOptions.scales.y, ticks: { ...baseChartOptions.scales.y.ticks, callback: (v) => `${v}%` } },
  },
}

onMounted(async () => {
  try {
    const [rate, sugg] = await Promise.all([api.flagRateTrend(8), api.learningSuggestions(20)])
    flagRate.value = rate
    suggestions.value = sugg
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="mx-auto max-w-4xl px-6 py-8">
    <h1 class="mb-2 font-display text-2xl font-bold text-ink">Learning</h1>
    <p class="mb-6 text-sm text-ink-faint">
      The critic doesn't retrain any model — API-based LLMs are stateless. What improves is the system: recurring
      patterns in critic critiques get fed back into the agents' prompts, via the weekly suggestion below. This is a
      published pattern (Reflexion-style feedback loops), not a novel mechanism.
    </p>

    <div v-if="loading" class="py-24 text-center text-ink-faint">Loading…</div>
    <div v-else-if="error" class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical">
      Couldn't reach the backend: {{ error }}
    </div>

    <template v-else>
      <div class="rounded-lg border border-border bg-surface p-5">
        <h2 class="mb-1 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
          Critic flag rate, last 8 weeks
        </h2>
        <p class="mb-4 text-xs text-ink-faint">
          Share of reports the critic flagged before approval. A downward trend is a good sign — but a rate near 0%
          over a short or thin-data window isn't automatically good news on its own; it can also mean the critic
          isn't finding much to work with yet. Read this alongside the suggestion history below, not in isolation.
        </p>
        <div class="h-56">
          <Line v-if="flagRate.length" :data="chartData" :options="chartOptions" />
          <div v-else class="flex h-full items-center justify-center text-ink-faint">No reports yet.</div>
        </div>
      </div>

      <div class="mt-8 rounded-lg border border-border bg-surface p-5">
        <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">Grading criteria</h2>
        <div class="space-y-2 text-sm text-ink-soft">
          <p><span class="font-bold text-flag-good">A — Rigorous.</span> Every material claim is grounded in specific numbers from the supplied data. Trend claims are hedged to match sample size (a 2-point or 7-day comparison is called "directional," never "a trend"). Recommendations are phrased as suggestions ("worth reviewing," "consider"), never as commands. No unacknowledged contradiction with the historical comparison data.</p>
          <p><span class="font-bold text-flag-good">B — Solid, minor gaps.</span> Mostly evidence-grounded. At most one overstatement — e.g. a claim missing its exact supporting figure, or a trend stated slightly more confidently than the sample size supports — that doesn't change the substance of the conclusion.</p>
          <p><span class="font-bold text-flag-caution">C — Noticeable gaps.</span> Multiple claims lack a specific supporting figure, or a pattern is stated with more confidence than the sample size or historical comparison actually supports. Still fundamentally honest, but a reader could come away more certain than the data warrants.</p>
          <p><span class="font-bold text-flag-critical">D — Unreliable.</span> Contains a claim not supported by the supplied data (fabricated, or extrapolated well beyond what the numbers show), a recommendation phrased as a directive rather than a suggestion, or a contradiction with the historical comparison that isn't acknowledged.</p>
          <p><span class="font-bold text-flag-critical">F — Untrustworthy.</span> Multiple fabricated/unsupported claims, or the core conclusion itself isn't supported by the data.</p>
        </div>
      </div>

      <h2 class="mb-3 mt-8 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        Weekly suggestion history
      </h2>
      <div v-if="!suggestions.length" class="rounded-lg border border-border bg-surface px-5 py-10 text-center text-ink-faint">
        No suggestions yet — these are drafted weekly from recurring critic patterns, when there are any.
      </div>
      <div v-else class="space-y-4">
        <div v-for="s in suggestions" :key="s.id" class="rounded-lg border border-border bg-surface p-5">
          <div class="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Week of {{ formatDate(s.week_of) }}
          </div>
          <div class="agent-prose" v-html="renderMarkdown(s.content)" />
        </div>
      </div>
    </template>
  </main>
</template>
