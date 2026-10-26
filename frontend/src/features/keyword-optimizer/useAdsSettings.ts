import { ref, onMounted } from 'vue'
import { api } from '../../shared/api/api'
import { FIXTURE_WRITE_ENABLED, USE_FIXTURES } from './keywordOptimizerApi'

/** Whether creating campaigns is switched on (the `ads_write_enabled` setting, off by default) and in which mode
 * (only 'simulated' exists). Read-only here; changing it is the owner's, in Settings. `enabled` is null while unknown
 * (not loaded, or a server that predates 3.6): the panel treats unknown as off, never as on. */
export function useAdsSettings() {
  const loaded = ref(false)
  const enabled = ref<boolean | null>(null)
  const mode = ref<string | null>(null)

  onMounted(async () => {
    if (USE_FIXTURES) {
      enabled.value = FIXTURE_WRITE_ENABLED
      mode.value = 'simulated'
      loaded.value = true
      return
    }
    try {
      const st = await api.settings()
      if (st.ads_write_enabled !== undefined) {
        enabled.value = st.ads_write_enabled === 'true'
        mode.value = st.ads_write_mode ?? 'simulated'
      }
    } catch {
      // unknown stays unknown
    } finally {
      loaded.value = true
    }
  })

  return { loaded, enabled, mode }
}
