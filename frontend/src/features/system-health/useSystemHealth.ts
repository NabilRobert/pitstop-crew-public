import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../shared/api/api'
import type { SystemHealth } from '../../shared/api/types'

// Cron runs daily at 6am — if it's been meaningfully longer than a day
// since the last successful run, the dead-man's-switch should trip.
const STALE_HOURS = 30

export function useSystemHealth() {
  const { t } = useI18n()

  const health = ref<SystemHealth | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  const hoursSinceLastRun = computed(() => {
    const finishedAt = health.value?.last_successful_daily_run?.finished_at
    if (!finishedAt) return null
    return (Date.now() - new Date(finishedAt).getTime()) / 3_600_000
  })

  const switchStatus = computed(() => {
    if (hoursSinceLastRun.value === null) return { label: t('systemHealth.noSuccessfulRun'), color: 'flag-critical' }
    if (hoursSinceLastRun.value > STALE_HOURS) return { label: t('systemHealth.stale'), color: 'flag-critical' }
    return { label: t('systemHealth.healthy'), color: 'flag-good' }
  })

  onMounted(async () => {
    try {
      health.value = await api.systemHealth()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  })

  return { health, loading, error, switchStatus }
}
