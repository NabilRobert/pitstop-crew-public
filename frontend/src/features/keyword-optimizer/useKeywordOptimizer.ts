import { ref, computed, onMounted } from 'vue'
import { keywordOptimizerApi } from './keywordOptimizerApi'
import type { Suggestion, SuggestionStatus, SuggestionsResponse, SuggestionType } from '../../shared/api/types'
import { SUGGESTION_TYPES } from './suggestionView'
import { api, ApiError } from '../../shared/api/api'

export type StatusFilter = Exclude<SuggestionStatus, 'superseded'> | 'all'

// One page of the list is enough for this view; the contract caps `limit` at 200.
const PAGE_LIMIT = 200

export function useKeywordOptimizer() {
  const data = ref<SuggestionsResponse | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  // 404 on the list endpoint means the backend is reachable but does not have the keyword
  // optimizer yet (an older deploy) - a different problem from "couldn't reach the backend".
  const backendMissing = ref(false)
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
      data.value = await keywordOptimizerApi.suggestions({ status: statusFilter.value, limit: PAGE_LIMIT })
    } catch (e) {
      backendMissing.value = e instanceof ApiError && e.status === 404
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function setFilter(value: StatusFilter) {
    statusFilter.value = value
    await load()
  }

  /** Counts per type over everything loaded for the current status filter. */
  const typeCounts = computed(() => {
    const counts = Object.fromEntries(SUGGESTION_TYPES.map((t) => [t, 0])) as Record<SuggestionType, number>
    for (const s of data.value?.items ?? []) counts[s.type]++
    return counts
  })

  const visibleItems = computed<Suggestion[]>(() => {
    const items = data.value?.items ?? []
    return typeFilter.value === 'all' ? items : items.filter((s) => s.type === typeFilter.value)
  })

  const truncated = computed(() => !!data.value && data.value.total > data.value.items.length)

  async function setStatus(id: number, status: Exclude<SuggestionStatus, 'superseded'>) {
    if (busyIds.value.has(id)) return
    busyIds.value = new Set(busyIds.value).add(id)
    actionError.value = null
    try {
      await keywordOptimizerApi.setStatus(id, status)
      // The row no longer belongs to the current status filter (unless 'all'): reload so
      // the list, counts and totals all come from the server, not from local guesses.
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
    } catch (e) {
      actionError.value = e instanceof Error ? e.message : String(e)
    } finally {
      runStarting.value = false
    }
  }

  onMounted(load)

  return {
    data, loading, error, backendMissing, statusFilter, typeFilter, setFilter, typeCounts, visibleItems,
    truncated, busyIds, actionError, runMessage, runStarting, setStatus, runNow, reload: load,
  }
}
