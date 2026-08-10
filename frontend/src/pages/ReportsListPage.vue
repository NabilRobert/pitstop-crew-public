<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api, BASE_URL } from '../lib/api'
import { formatDate } from '../lib/format'
import { consoleOpen } from '../lib/consoleState'
import StatusPill from '../components/StatusPill.vue'

const period = ref('daily')
const reports = ref([])
const loading = ref(true)
const error = ref(null)
const generating = ref(false)
const generateError = ref(null)

// Oldest -> newest, left -> right, so the strip reads like a timeline.
const stripReports = computed(() => [...reports.value].reverse())

const STRIP_COLOR = { approved: 'var(--color-flag-good)', flagged: 'var(--color-flag-caution)' }

async function load() {
  loading.value = true
  error.value = null
  try {
    reports.value = await api.reportsList(period.value)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Watches the same live console stream ConsolePanel renders, filtering
// for this run's actual completion/failure event, instead of polling on
// a fixed timeout — a real run (multiple agents, each possibly revised
// twice by the critic) can run well past any timeout short enough to
// still feel responsive if it succeeds quickly. A generous fallback
// timer still exists in case the SSE connection itself drops silently.
let generateSource = null
let fallbackTimer = null

function stopWatchingRun() {
  generateSource?.close()
  generateSource = null
  clearTimeout(fallbackTimer)
  fallbackTimer = null
}

onUnmounted(stopWatchingRun)

async function generateNow() {
  generateError.value = null
  const triggeredAt = new Date().toISOString()
  const triggeredPeriod = period.value
  try {
    await api.triggerRun(triggeredPeriod)
  } catch (e) {
    generateError.value = e.message
    return
  }
  generating.value = true
  consoleOpen.value = true
  stopWatchingRun()

  const label = triggeredPeriod === 'weekly' ? 'Weekly' : 'Daily'
  generateSource = new EventSource(`${BASE_URL}/console/stream`)
  generateSource.onmessage = (e) => {
    const event = JSON.parse(e.data)
    if (event.timestamp <= triggeredAt) return // replayed backlog, not this run
    const isDone = event.message.startsWith(`${label} pipeline run complete`)
    const isFailed = event.level === 'error' && event.message.startsWith('Pipeline run failed')
    if (!isDone && !isFailed) return
    if (isFailed) generateError.value = event.message
    stopWatchingRun()
    generating.value = false
    load()
  }

  // Safety net only — the event above is the primary signal.
  fallbackTimer = setTimeout(
    () => {
      stopWatchingRun()
      generating.value = false
      load()
    },
    15 * 60 * 1000
  )
}

watch(period, load)
onMounted(load)
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-2xl font-bold text-ink">Reports</h1>

      <div class="flex items-center gap-3">
        <div class="flex rounded-md border border-border bg-surface p-1">
          <button
            type="button"
            class="rounded px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
            :class="period === 'daily' ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            @click="period = 'daily'"
          >
            Daily
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
            :class="period === 'weekly' ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            @click="period = 'weekly'"
          >
            Weekly
          </button>
        </div>
        <button
          type="button"
          class="rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="generating"
          @click="generateNow"
        >
          {{ generating ? 'Generating…' : 'Generate report now' }}
        </button>
      </div>
    </div>

    <div v-if="generateError" class="mb-4 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-3 text-sm text-flag-critical">
      {{ generateError }}
    </div>

    <div v-if="loading" class="py-24 text-center text-ink-faint">Loading reports…</div>

    <div
      v-else-if="error"
      class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical"
    >
      Couldn't reach the backend: {{ error }}
    </div>

    <div v-else-if="!reports.length" class="py-24 text-center text-ink-faint">
      No {{ period }} reports yet — the pipeline hasn't run for this period.
    </div>

    <template v-else>
      <div class="mb-6 flex items-end gap-[3px] rounded-lg border border-border bg-surface px-4 py-3">
        <router-link
          v-for="report in stripReports"
          :key="`strip-${report.id}`"
          :to="`/reports/${period}/${report.report_date}`"
          class="h-6 flex-1 rounded-sm opacity-80 transition-opacity hover:opacity-100"
          :style="{ backgroundColor: STRIP_COLOR[report.status] ?? 'var(--color-ink-faint)' }"
          :title="`${formatDate(report.report_date)} — ${report.status}`"
        />
      </div>

      <div class="space-y-3">
      <router-link
        v-for="report in reports"
        :key="report.id"
        :to="`/reports/${period}/${report.report_date}`"
        class="block rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:border-border-strong hover:bg-surface-raised"
      >
        <div class="flex items-center justify-between">
          <span class="font-display text-sm font-bold text-ink">{{ formatDate(report.report_date) }}</span>
          <StatusPill :status="report.status" />
        </div>
        <p class="mt-2 line-clamp-2 text-sm text-ink-soft">{{ report.preview }}</p>
      </router-link>
      </div>
    </template>
  </main>
</template>
