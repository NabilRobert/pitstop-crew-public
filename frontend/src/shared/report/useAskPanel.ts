import { ref, onMounted, type Ref } from 'vue'
import { api } from '../api/api'
import type { AskHistoryEntry } from '../api/types'

export function useAskPanel(outputIdRef: Ref<number>) {
  const history = ref<AskHistoryEntry[]>([])
  const question = ref('')
  const loadingHistory = ref(true)
  const asking = ref(false)
  const error = ref<string | null>(null)

  onMounted(async () => {
    try {
      history.value = await api.askHistory(outputIdRef.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loadingHistory.value = false
    }
  })

  async function submit() {
    const q = question.value.trim()
    if (!q || asking.value) return
    asking.value = true
    error.value = null
    try {
      const result = await api.ask(outputIdRef.value, q)
      history.value = result.history
      question.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      asking.value = false
    }
  }

  return { history, question, loadingHistory, asking, error, submit }
}
