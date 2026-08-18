import { ref, onMounted } from 'vue'
import { api } from '../api/api'

export function useWhyTrailPanel(outputIdRef) {
  const loading = ref(true)
  const error = ref(null)
  const trail = ref([])

  onMounted(async () => {
    try {
      trail.value = await api.whyTrail(outputIdRef.value)
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  })

  return { loading, error, trail }
}
