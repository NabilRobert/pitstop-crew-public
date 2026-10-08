import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { keywordOptimizerApi } from './keywordOptimizerApi'
import type { Suggestion, SuggestionStatus, SuggestionsResponse, SuggestionType } from '../../shared/api/types'
import { SUGGESTION_TYPES } from './suggestionView'
import { api, ApiError } from '../../shared/api/api'

export type StatusFilter = Exclude<SuggestionStatus, 'superseded'> | 'all'

// The contract caps `limit` at 200. Everything is loaded once (all statuses), so the board, its
// Done / Not now bins and the list view all read the same data and never disagree.
const PAGE_LIMIT = 200

// How often the page looks for a new run. Quick while a run is going (or was just started here), slow otherwise,
// so a run that starts by itself at the owner's set time shows up without anyone reloading.
const FAST_POLL_MS = 5_000
const SLOW_POLL_MS = 60_000

/** `onNewResults` runs after a quiet refresh finds that the latest run, or the suggestions, changed, so the page
 * can reload what depends on them (the board's numbers). */
export function useKeywordOptimizer(onNewResults?: () => void | Promise<void>) {
  const data = ref<SuggestionsResponse | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  // 404 on the list endpoint means the backend is reachable but does not have the keyword
  // optimizer yet (an older deploy) - a different problem from "couldn't reach the backend".
  const backendMissing = ref(false)
  // List-view filters (local; the board has its own).
  const statusFilter = ref<StatusFilter>('open')
  const typeFilter = ref<SuggestionType | 'all'>('all')
  const busyIds = ref<Set<number>>(new Set())
  const actionError = ref<string | null>(null)
  const runMessage = ref<string | null>(null)
  const runStarting = ref(false)

  async function load() {
    loading.value = true
    error.value = null
    backendMissing.value = false
    try {
      data.value = await keywordOptimizerApi.suggestions({ status: 'all', limit: PAGE_LIMIT })
    } catch (e) {
      backendMissing.value = e instanceof ApiError && e.status === 404
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  // --- keeping the page current without a reload ---
  // A run started from this page: poll fast until the run it started has finished.
  const waitingForRun = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const signature = (d: SuggestionsResponse | null) =>
    d ? `${d.run?.id ?? '-'}|${d.run?.status ?? '-'}|${d.run?.finished_at ?? '-'}|${d.total}|${d.items.map((s) => `${s.id}:${s.status}`).join(',')}` : ''

  /** Fetches again without touching the loading or error state. Returns true when something changed. */
  async function refreshQuietly(): Promise<boolean> {
    try {
      const fresh = await keywordOptimizerApi.suggestions({ status: 'all', limit: PAGE_LIMIT })
      const changed = signature(fresh) !== signature(data.value)
      if (changed) data.value = fresh
      const runDone = fresh.run !== null && fresh.run.status !== 'running'
      if (waitingForRun.value && runDone && fresh.run!.id !== runStartedAfterId) {
        waitingForRun.value = false
        runMessage.value = null // "run started" would be stale now that its results are on screen
      }
      return changed
    } catch {
      return false // a failed quiet check is not worth an error banner; the next one tries again
    }
  }

  let runStartedAfterId: number | null = null

  function schedule() {
    if (stopped) return
    const running = data.value?.run?.status === 'running' || waitingForRun.value
    timer = setTimeout(async () => {
      // A hidden tab does not need fresh data; look again when it is shown.
      if (typeof document === 'undefined' || !document.hidden) {
        const changed = await refreshQuietly()
        if (changed) await onNewResults?.()
      }
      schedule()
    }, running ? FAST_POLL_MS : SLOW_POLL_MS)
  }

  /** Every suggestion loaded, any status. */
  const items = computed<Suggestion[]>(() => data.value?.items ?? [])
  const openCount = computed(() => items.value.filter((s) => s.status === 'open').length)
  const appliedCount = computed(() => items.value.filter((s) => s.status === 'applied').length)
  const dismissedCount = computed(() => items.value.filter((s) => s.status === 'dismissed').length)

  const inStatus = computed(() =>
    statusFilter.value === 'all' ? items.value : items.value.filter((s) => s.status === statusFilter.value)
  )

  /** Counts per type over the current status filter (list view chips). */
  const typeCounts = computed(() => {
    const counts = Object.fromEntries(SUGGESTION_TYPES.map((t) => [t, 0])) as Record<SuggestionType, number>
    for (const s of inStatus.value) counts[s.type]++
    return counts
  })

  const visibleItems = computed<Suggestion[]>(() =>
    typeFilter.value === 'all' ? inStatus.value : inStatus.value.filter((s) => s.type === typeFilter.value)
  )

  const truncated = computed(() => !!data.value && data.value.total > data.value.items.length)

  async function setStatus(id: number, status: Exclude<SuggestionStatus, 'superseded'>) {
    if (busyIds.value.has(id)) return
    busyIds.value = new Set(busyIds.value).add(id)
    actionError.value = null
    try {
      await keywordOptimizerApi.setStatus(id, status)
      // Reload so the board, bins, list and counts all come from the server, not from local guesses.
      await load()
    } catch (e) {
      actionError.value = e instanceof Error ? e.message : String(e)
    } finally {
      const next = new Set(busyIds.value)
      next.delete(id)
      busyIds.value = next
    }
  }

  /** Owner-only. 409 (a run is in progress) and 429 (spend cap) arrive as the server's own `detail`. */
  async function runNow() {
    runStarting.value = true
    runMessage.value = null
    actionError.value = null
    try {
      const { run_id } = await api.triggerKeywordOptimizer()
      runMessage.value = String(run_id)
      // Watch for this run to finish, then the proposals and the board refresh by themselves.
      runStartedAfterId = data.value?.run?.id ?? null
      waitingForRun.value = true
    } catch (e) {
      actionError.value = e instanceof Error ? e.message : String(e)
    } finally {
      runStarting.value = false
    }
  }

  onMounted(async () => {
    await load()
    schedule()
  })
  onBeforeUnmount(() => {
    stopped = true
    if (timer) clearTimeout(timer)
  })

  return {
    data, loading, error, backendMissing, items, openCount, appliedCount, dismissedCount,
    statusFilter, typeFilter, typeCounts, visibleItems, truncated, busyIds, actionError,
    runMessage, runStarting, waitingForRun, setStatus, runNow, reload: load, refresh: refreshQuietly,
  }
}
