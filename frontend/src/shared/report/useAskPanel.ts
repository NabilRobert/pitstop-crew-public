import { ref, computed, onMounted, type Ref } from 'vue'
import { api } from '../api/api'
import { useVoice } from '../composables/useVoice'
import { getLocale } from '../../i18n/index.js'
import type { AskHistoryEntry, AskConversation, VoiceAgentType } from '../api/types'

// Ask is organized into conversation threads per output — this composable
// loads the list, auto-selects the most recently active one (or starts a
// fresh one if there's no history yet), and lets the panel switch threads
// or start a new one explicitly.
export function useAskPanel(outputIdRef: Ref<number>) {
  const conversations = ref<AskConversation[]>([])
  const activeConversationId = ref<number | null>(null)
  const messages = ref<AskHistoryEntry[]>([])
  const question = ref('')
  const loadingHistory = ref(true)
  const asking = ref(false)
  const error = ref<string | null>(null)
  const agentType = ref<VoiceAgentType | null>(null)

  const voice = useVoice()

  const activeConversation = computed(
    () => conversations.value.find((c) => c.id === activeConversationId.value) ?? null
  )

  async function loadMessages(conversationId: number) {
    messages.value = await api.askConversationMessages(conversationId)
  }

  onMounted(async () => {
    try {
      const [conversationList, output] = await Promise.all([
        api.askConversations(outputIdRef.value),
        api.output(outputIdRef.value),
      ])
      conversations.value = conversationList
      agentType.value = output.agent_type as VoiceAgentType

      if (conversationList.length > 0) {
        activeConversationId.value = conversationList[0].id
        await loadMessages(conversationList[0].id)
      } else {
        const { id } = await api.startAskConversation(outputIdRef.value)
        conversations.value = [{ id, title: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]
        activeConversationId.value = id
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loadingHistory.value = false
    }
  })

  async function selectConversation(conversationId: number) {
    if (conversationId === activeConversationId.value) return
    activeConversationId.value = conversationId
    error.value = null
    try {
      await loadMessages(conversationId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function startNewConversation() {
    error.value = null
    try {
      const { id } = await api.startAskConversation(outputIdRef.value)
      conversations.value = [{ id, title: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...conversations.value]
      activeConversationId.value = id
      messages.value = []
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function submit() {
    const q = question.value.trim()
    if (!q || asking.value || activeConversationId.value === null) return
    asking.value = true
    error.value = null
    try {
      const result = await api.ask(outputIdRef.value, activeConversationId.value, q, getLocale())
      messages.value = result.messages
      question.value = ''
      // Refresh the conversation list so its title (set from the first
      // question) and updated_at ordering stay current.
      conversations.value = await api.askConversations(outputIdRef.value)
      const latest = messages.value[messages.value.length - 1]
      if (latest && agentType.value) voice.speak(latest.answer, agentType.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      asking.value = false
    }
  }

  async function toggleRecording() {
    if (voice.recording.value) {
      const text = await voice.stopRecording(getLocale())
      if (text) question.value = text
    } else {
      voice.stopSpeaking()
      await voice.startRecording()
    }
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    question,
    loadingHistory,
    asking,
    error,
    voiceError: voice.error,
    recording: voice.recording,
    transcribing: voice.transcribing,
    speaking: voice.speaking,
    submit,
    toggleRecording,
    stopSpeaking: voice.stopSpeaking,
    selectConversation,
    startNewConversation,
  }
}
