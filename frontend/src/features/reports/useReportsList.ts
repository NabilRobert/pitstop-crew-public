import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api, BASE_URL } from '../../shared/api/api'
import { consoleOpen } from '../../shared/composables/consoleState'
import { token } from '../../shared/composables/auth'
import type { ReportListEntry, ConsoleEvent } from '../../shared/api/types'

export const STRIP_COLOR: Record<string, string> = {
  approved: 'var(--color-flag-good)',
  flagged: 'var(--color-flag-caution)',
}

// How long to wait for the "email sent" event after the run itself finished
// before giving up on it and settling anyway (older backends never send one).
const EMAIL_GRACE_MS = 30 * 1000

export function useReportsList() {
  const period = ref<'daily' | 'weekly'>('daily')
  const reports = ref<ReportListEntry[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const generating = ref(false)
  const generateError = ref<string | null>(null)

  const autoReportsEnabled = ref(true)
  const autoReportsSaving = ref(false)

  // Oldest -> newest, left -> right, so the strip reads like a timeline.
  const stripReports = computed(() => [...reports.value].reverse())

  async function loadAutoReportsSetting() {
    try {
      const settings = await api.settings()
      autoReportsEnabled.value = settings.auto_reports_enabled === 'true'
    } catch {
      // Non-critical — the toggle just stays at its default until a retry.
    }
  }

  async function toggleAutoReports() {
    const next = !autoReportsEnabled.value
    autoReportsSaving.value = true
    try {
      const settings = await api.updateSettings({ auto_reports_enabled: String(next) })
      autoReportsEnabled.value = settings.auto_reports_enabled === 'true'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      autoReportsSaving.value = false
    }
  }

  // Refreshes without the full-page loading state, so the table updates in
  // place instead of flashing to "Loading…" when a run finishes.
  async function load(quiet = false) {
    if (!quiet) loading.value = true
    error.value = null
    try {
      reports.value = await api.reportsList(period.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  // Watches this run's events on the same live console stream ConsolePanel
  // renders (filtered to the run by id, and authenticated with the token —
  // EventSource can't set headers), instead of polling on a fixed timeout: a
  // real run can take a while. The report is in the table as soon as the run
  // completes, so the table refreshes then; it refreshes once more after the
  // report email has been sent (or has failed / been skipped), which is when
  // the run is really over. A generous fallback timer still exists in case the
  // SSE connection itself drops silently.
  let generateSource: EventSource | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  let graceTimer: ReturnType<typeof setTimeout> | null = null

  function stopWatchingRun() {
    generateSource?.close()
    generateSource = null
    if (fallbackTimer) clearTimeout(fallbackTimer)
    if (graceTimer) clearTimeout(graceTimer)
    fallbackTimer = null
    graceTimer = null
  }

  onUnmounted(stopWatchingRun)

  function finishGenerating() {
    stopWatchingRun()
    generating.value = false
    load(true)
  }

  async function generateNow() {
    generateError.value = null
    const triggeredPeriod = period.value
    let runId: number
    try {
      runId = (await api.triggerRun(triggeredPeriod)).runId
    } catch (e) {
      generateError.value = e instanceof Error ? e.message : String(e)
      return
    }
    generating.value = true
    consoleOpen.value = true
    stopWatchingRun()

    const label = triggeredPeriod === 'weekly' ? 'Weekly' : 'Daily'
    generateSource = new EventSource(`${BASE_URL}/console/stream?runId=${runId}&token=${token.value}`)
    generateSource.onmessage = (e) => {
      const event: ConsoleEvent = JSON.parse(e.data)
      const isDone = event.message.startsWith(`${label} pipeline run complete`)
      const isFailed = event.level === 'error' && event.message.startsWith('Pipeline run failed')
      // The email step is over once it reports: sent, nothing to send to, or failed.
      const isEmailDone =
        /^Emil: .*(email sent|not emailed)/.test(event.message) || event.message.startsWith('Report generated but email failed')

      if (isFailed) {
        generateError.value = event.message
        finishGenerating()
      } else if (isEmailDone) {
        finishGenerating()
      } else if (isDone) {
        // The report exists now — show it, then wait briefly for the email.
        load(true)
        if (graceTimer) clearTimeout(graceTimer)
        graceTimer = setTimeout(finishGenerating, EMAIL_GRACE_MS)
      }
    }

    // Safety net only — the events above are the primary signal.
    fallbackTimer = setTimeout(finishGenerating, 15 * 60 * 1000)
  }

  watch(period, () => load())
  onMounted(() => load())
  onMounted(loadAutoReportsSetting)

  return {
    period,
    reports,
    loading,
    error,
    generating,
    generateError,
    stripReports,
    generateNow,
    autoReportsEnabled,
    autoReportsSaving,
    toggleAutoReports,
  }
}
