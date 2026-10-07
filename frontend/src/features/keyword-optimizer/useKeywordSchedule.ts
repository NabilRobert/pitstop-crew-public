import { ref, onMounted } from 'vue'
import { api } from '../../shared/api/api'

/** When the optimizer runs by itself (contract 3.5), read from the same settings the owner edits. Best-effort and
 * read-only: if the server predates 3.5 or the call fails, there is simply no schedule line. The demo account can read
 * this (GET /settings) but never change it. */
export function useKeywordSchedule() {
  const loaded = ref(false)
  const enabled = ref(false)
  const time = ref<string | null>(null)

  onMounted(async () => {
    try {
      const settings = await api.settings()
      if (settings.keyword_optimizer_run_time !== undefined) {
        time.value = settings.keyword_optimizer_run_time
        enabled.value = settings.keyword_optimizer_enabled === 'true'
      }
    } catch {
      // no schedule line
    } finally {
      loaded.value = true
    }
  })

  return { loaded, enabled, time }
}
