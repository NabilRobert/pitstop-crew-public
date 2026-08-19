import { ref, watch, onMounted, type Ref } from 'vue'
import { api } from '../../shared/api/api'
import type { Report } from '../../shared/api/types'

const VIEW_MODE_KEY = 'pitstop-report-view-mode'

export function useReportDetail(idRef: Ref<string | number>) {
  const report = ref<Report>({ analysis: null, recommendation: null, summary: null })
  const loading = ref(true)
  const error = ref<string | null>(null)

  const viewMode = ref(localStorage.getItem(VIEW_MODE_KEY) || 'columns')
  watch(viewMode, (mode) => localStorage.setItem(VIEW_MODE_KEY, mode))

  async function load() {
    loading.value = true
    error.value = null
    try {
      report.value = await api.reportById(idRef.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  watch(idRef, load)
  onMounted(load)

  return { report, loading, error, viewMode }
}
