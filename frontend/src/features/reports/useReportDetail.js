import { ref, watch, onMounted } from 'vue'
import { api } from '../../shared/api/api'

const VIEW_MODE_KEY = 'pitstop-report-view-mode'

export function useReportDetail(idRef) {
  const report = ref({ analysis: null, recommendation: null, summary: null })
  const loading = ref(true)
  const error = ref(null)

  const viewMode = ref(localStorage.getItem(VIEW_MODE_KEY) || 'columns')
  watch(viewMode, (mode) => localStorage.setItem(VIEW_MODE_KEY, mode))

  async function load() {
    loading.value = true
    error.value = null
    try {
      report.value = await api.reportById(idRef.value)
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  watch(idRef, load)
  onMounted(load)

  return { report, loading, error, viewMode }
}
