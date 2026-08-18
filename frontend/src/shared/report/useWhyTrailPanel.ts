import { ref, onMounted, type Ref } from 'vue'
import { api } from '../api/api'
import type { WhyTrailEntry } from '../api/types'

export function useWhyTrailPanel(outputIdRef: Ref<number>) {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const trail = ref<WhyTrailEntry[]>([])

  onMounted(async () => {
    try {
      trail.value = await api.whyTrail(outputIdRef.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  })

  return { loading, error, trail }
}
