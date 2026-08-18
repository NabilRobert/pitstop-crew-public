import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api, BASE_URL } from '../../shared/api/api'
import { consoleOpen } from '../../shared/composables/consoleState'
import type { ReportListEntry, ConsoleEvent } from '../../shared/api/types'

export const STRIP_COLOR: Record<string, string> = {
  approved: 'var(--color-flag-good)',
  flagged: 'var(--color-flag-caution)',
}

export function useReportsList() {
  const period = ref<'daily' | 'weekly'>('daily')
  const reports = ref<ReportListEntry[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const generating = ref(false)
  const generateError = ref<string | null>(null)

  // Oldest -> newest, left -> right, so the strip reads like a timeline.
  const stripReports = computed(() => [...reports.value].reverse())

  async function load() {
    loading.value = true
    error.value = null
    try {
      reports.value = await api.reportsList(period.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
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
  let generateSource: EventSource | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  function stopWatchingRun() {
    generateSource?.close()
    generateSource = null
    if (fallbackTimer) clearTimeout(fallbackTimer)
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
      generateError.value = e instanceof Error ? e.message : String(e)
      return
    }
    generating.value = true
    consoleOpen.value = true
    stopWatchingRun()

    const label = triggeredPeriod === 'weekly' ? 'Weekly' : 'Daily'
    generateSource = new EventSource(`${BASE_URL}/console/stream`)
    generateSource.onmessage = (e) => {
      const event: ConsoleEvent = JSON.parse(e.data)
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

  return {
    period,
    reports,
    loading,
    error,
    generating,
    generateError,
    stripReports,
    generateNow,
  }
}
