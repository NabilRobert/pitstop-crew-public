import { ref, onMounted } from 'vue'
import { api } from '../api/api'

export function useAskPanel(outputIdRef) {
  const history = ref([])
  const question = ref('')
  const loadingHistory = ref(true)
  const asking = ref(false)
  const error = ref(null)

  onMounted(async () => {
    try {
      history.value = await api.askHistory(outputIdRef.value)
    } catch (e) {
      error.value = e.message
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
      error.value = e.message
    } finally {
      asking.value = false
    }
  }

  return { history, question, loadingHistory, asking, error, submit }
}
