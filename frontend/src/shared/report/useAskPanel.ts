import { ref, onMounted, type Ref } from 'vue'
import { api } from '../api/api'
import { useVoice } from '../composables/useVoice'
import { getLocale } from '../../i18n/index.js'
import type { AskHistoryEntry, VoiceAgentType } from '../api/types'

export function useAskPanel(outputIdRef: Ref<number>) {
  const history = ref<AskHistoryEntry[]>([])
  const question = ref('')
  const loadingHistory = ref(true)
  const asking = ref(false)
  const error = ref<string | null>(null)
  const agentType = ref<VoiceAgentType | null>(null)

  const voice = useVoice()

  onMounted(async () => {
    try {
      const [historyResult, output] = await Promise.all([
        api.askHistory(outputIdRef.value),
        api.output(outputIdRef.value),
      ])
      history.value = historyResult
      agentType.value = output.agent_type as VoiceAgentType
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
      const result = await api.ask(outputIdRef.value, q, getLocale())
      history.value = result.history
      question.value = ''
      const latest = history.value[history.value.length - 1]
      if (latest && agentType.value) voice.speak(latest.answer, agentType.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      asking.value = false
    }
  }

  async function toggleRecording() {
    if (voice.recording.value) {
      const text = await voice.stopRecording()
      if (text) question.value = text
    } else {
      voice.stopSpeaking()
      await voice.startRecording()
    }
  }

  return {
    history,
    question,
    loadingHistory,
    asking,
    error: error,
    voiceError: voice.error,
    recording: voice.recording,
    transcribing: voice.transcribing,
    speaking: voice.speaking,
    submit,
    toggleRecording,
    stopSpeaking: voice.stopSpeaking,
  }
}
