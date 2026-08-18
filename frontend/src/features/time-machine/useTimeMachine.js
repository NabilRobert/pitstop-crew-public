import { ref, inject, onMounted } from 'vue'
import { api } from '../../shared/api/api'
import { STATES } from './states'

export function useTimeMachine() {
  const dataSource = inject('dataSource')

  const overrides = ref([])
  const loading = ref(true)
  const error = ref(null)
  const saving = ref(false)

  const newDate = ref('')
  const newState = ref(STATES[0])

  async function load() {
    loading.value = true
    error.value = null
    try {
      const map = await api.timeMachineOverrides()
      overrides.value = Object.entries(map)
        .map(([date, forced_state]) => ({ date, forced_state }))
        .sort((a, b) => a.date.localeCompare(b.date))
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function setOverride() {
    if (!newDate.value) return
    saving.value = true
    error.value = null
    try {
      await api.setTimeMachineOverride(newDate.value, newState.value)
      newDate.value = ''
      await load()
    } catch (e) {
      error.value = e.message
    } finally {
      saving.value = false
    }
  }

  async function clearOverride(date) {
    try {
      await api.clearTimeMachineOverride(date)
      await load()
    } catch (e) {
      error.value = e.message
    }
  }

  onMounted(() => {
    if (dataSource?.value === 'demo') load()
    else loading.value = false
  })

  return { dataSource, overrides, loading, error, saving, newDate, newState, setOverride, clearOverride }
}
