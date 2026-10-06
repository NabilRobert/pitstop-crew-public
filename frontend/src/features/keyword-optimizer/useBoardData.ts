import { ref, onMounted } from 'vue'
import { keywordOptimizerApi } from './keywordOptimizerApi'
import type { KeywordPerformanceRow, KeywordSummary } from '../../shared/api/types'

const DAYS = 30

/** The per-keyword numbers behind the board. Independent of the suggestions call: if either fails the list
 * view and the rest of the page still work, and the board says its numbers are unavailable. */
export function useBoardData() {
  const rows = ref<KeywordPerformanceRow[]>([])
  const summaries = ref<KeywordSummary[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  /** True when the performance rows loaded but the summary (verdicts) did not, e.g. an older backend. */
  const summaryMissing = ref(false)

  onMounted(async () => {
    const [r, s] = await Promise.allSettled([keywordOptimizerApi.keywordRows(DAYS), keywordOptimizerApi.summary(DAYS)])
    if (r.status === 'fulfilled') rows.value = r.value
    else error.value = r.reason instanceof Error ? r.reason.message : String(r.reason)
    if (s.status === 'fulfilled') summaries.value = s.value.items
    else summaryMissing.value = true
    loading.value = false
  })

  return { rows, summaries, loading, error, summaryMissing }
}
