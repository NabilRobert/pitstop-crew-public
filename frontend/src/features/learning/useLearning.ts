import { ref, onMounted } from 'vue'
import { api } from '../../shared/api/api'
import type { GradeTrend, LearningSuggestion } from '../../shared/api/types'

export function useLearning() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const gradeTrend = ref<GradeTrend | null>(null)
  const suggestions = ref<LearningSuggestion[]>([])

  onMounted(async () => {
    try {
      const [trend, sugg] = await Promise.all([api.gradeTrend(8), api.learningSuggestions(20)])
      gradeTrend.value = trend
      suggestions.value = sugg
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  })

  return { loading, error, gradeTrend, suggestions }
}
