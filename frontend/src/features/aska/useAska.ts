import { ref, onMounted, type Ref } from 'vue'
import { api } from '../../shared/api/api'
import { useWaveform } from '../../shared/composables/useWaveform'
import type { AssistantAskEntry } from '../../shared/api/types'

export type AskaState = 'idle' | 'listening' | 'thinking' | 'speaking'

export function useAska(waveformContainer: Ref<HTMLElement | null>) {
  const history = ref<AssistantAskEntry[]>([])
  const loadingHistory = ref(true)
  const question = ref('')
  const state = ref<AskaState>('idle')
  const error = ref<string | null>(null)

  const waveform = useWaveform(waveformContainer)

  onMounted(async () => {
    try {
      history.value = await api.assistantAskHistory()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loadingHistory.value = false
    }
  })

  async function askAndSpeak(q: string) {
    state.value = 'thinking'
    error.value = null
    try {
      const result = await api.assistantAsk(q)
      history.value = result.history
      question.value = ''
      const latest = history.value[history.value.length - 1]
      if (latest) {
        state.value = 'speaking'
        const audioBlob = await api.tts(latest.answer, 'assistant')
        await waveform.playToEnd(audioBlob)
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      state.value = 'idle'
    }
  }

  async function toggleRecording() {
    if (state.value === 'listening') {
      state.value = 'thinking'
      try {
        const blob = await waveform.stopRecording()
        const { text } = await api.stt(blob)
        if (text.trim()) {
          await askAndSpeak(text.trim())
        } else {
          state.value = 'idle'
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
        state.value = 'idle'
      }
      return
    }
    if (state.value !== 'idle') return // busy thinking/speaking — ignore
    error.value = null
    try {
      await waveform.startRecording()
      state.value = 'listening'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function submitTyped() {
    const q = question.value.trim()
    if (!q || state.value !== 'idle') return
    await askAndSpeak(q)
  }

  return { history, loadingHistory, question, state, error, toggleRecording, submitTyped }
}
