import { ref, onMounted, provide } from 'vue'
import { api } from '../shared/api/api'

// Provided at the app root so any page can read whether it's talking to
// demo or live data (e.g. gating the Time Machine nav link).
export function useDataSource() {
  const dataSource = ref('demo')
  provide('dataSource', dataSource)

  onMounted(async () => {
    try {
      const config = await api.config()
      dataSource.value = config.data_source
    } catch {
      // backend unreachable — DashboardPage surfaces its own error state
    }
  })

  return { dataSource }
}
