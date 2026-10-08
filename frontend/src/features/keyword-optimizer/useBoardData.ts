import { ref, onMounted } from 'vue'
import { keywordOptimizerApi } from './keywordOptimizerApi'
import type { KeywordPerformanceRow, KeywordSummary } from '../../shared/api/types'

// 90 days, the same window the backend uses to decide each keyword's verdict (contract 3.1), so the
// money behind "going nowhere" and "working well" is measured over the period the verdict was judged on.
const DAYS = 90

/** The per-keyword numbers behind the board. Independent of the suggestions call: if either fails the list
 * view and the rest of the page still work, and the board says its numbers are unavailable. */
export function useBoardData() {
  const rows = ref<KeywordPerformanceRow[]>([])
  const summaries = ref<KeywordSummary[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  /** True when the performance rows loaded but the summary (verdicts) did not, e.g. an older backend. */
  const summaryMissing = ref(false)

  /** Loads (or reloads) the numbers. A reload keeps the old ones on screen until the new ones arrive, so the board
   * does not flash a spinner when a new run finishes. */
  async function reload() {
    const [r, s] = await Promise.allSettled([keywordOptimizerApi.keywordRows(DAYS), keywordOptimizerApi.summary(DAYS)])
    if (r.status === 'fulfilled') {
      rows.value = r.value
      error.value = null
    } else error.value = r.reason instanceof Error ? r.reason.message : String(r.reason)
    if (s.status === 'fulfilled') {
      summaries.value = s.value.items
      summaryMissing.value = false
    } else summaryMissing.value = true
    loading.value = false
  }

  onMounted(reload)

  return { rows, summaries, loading, error, summaryMissing, reload }
}
