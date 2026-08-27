import { ref, computed, onMounted, type Ref } from 'vue'
import { api } from '../../shared/api/api'
import { useWaveform } from '../../shared/composables/useWaveform'
import { getLocale } from '../../i18n/index.js'
import type { AssistantAskEntry, AssistantConversation } from '../../shared/api/types'

export type AskaState = 'idle' | 'listening' | 'thinking' | 'speaking'
export type ConversationSort = 'recent' | 'oldest' | 'title'

export function useAska(waveformContainer: Ref<HTMLElement | null>) {
  const conversations = ref<AssistantConversation[]>([])
  const activeConversationId = ref<number | null>(null)
  const messages = ref<AssistantAskEntry[]>([])
  const loadingConversations = ref(true)
  const question = ref('')
  const state = ref<AskaState>('idle')
  const error = ref<string | null>(null)

  const conversationSearch = ref('')
  const conversationSort = ref<ConversationSort>('recent')

  // Search matches the conversation title (untitled threads only show up
  // when the search box is empty — there's nothing meaningful to match
  // against otherwise). Sort is purely a display concern; the backend
  // always returns most-recently-active-first, so 'recent' is a no-op
  // pass-through and the others just reorder the already-fetched list.
  const visibleConversations = computed(() => {
    const q = conversationSearch.value.trim().toLowerCase()
    const filtered = q ? conversations.value.filter((c) => (c.title ?? '').toLowerCase().includes(q)) : conversations.value

    const sorted = [...filtered]
    if (conversationSort.value === 'oldest') {
      sorted.sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    } else if (conversationSort.value === 'title') {
      sorted.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
    }
    // 'recent' — already the fetch order, nothing to do.
    return sorted
  })

  const waveform = useWaveform(waveformContainer)

  async function loadMessages(conversationId: number) {
    messages.value = await api.assistantConversationMessages(conversationId)
  }

  onMounted(async () => {
    try {
      const list = await api.assistantConversations()
      conversations.value = list
      if (list.length > 0) {
        activeConversationId.value = list[0].id
        await loadMessages(list[0].id)
      } else {
        const { id } = await api.startAssistantConversation()
        conversations.value = [{ id, title: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]
        activeConversationId.value = id
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loadingConversations.value = false
    }
  })

  async function selectConversation(conversationId: number) {
    if (conversationId === activeConversationId.value || state.value !== 'idle') return
    activeConversationId.value = conversationId
    error.value = null
    try {
      await loadMessages(conversationId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function startNewConversation() {
    if (state.value !== 'idle') return
    error.value = null
    try {
      const { id } = await api.startAssistantConversation()
      conversations.value = [{ id, title: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...conversations.value]
      activeConversationId.value = id
      messages.value = []
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function askAndSpeak(q: string) {
    if (activeConversationId.value === null) return
    state.value = 'thinking'
    error.value = null
    try {
      const result = await api.assistantAsk(activeConversationId.value, q, getLocale())
      messages.value = result.messages
      question.value = ''
      conversations.value = await api.assistantConversations()
      const latest = messages.value[messages.value.length - 1]
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
        const { text } = await api.stt(blob, getLocale())
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

  // Explicit "Stop" control (separate from tapping the orb, which the UI
  // disables while thinking/speaking): interrupts whichever of
  // listening/speaking is active. Listening -> finish the recording and
  // submit it, same as tapping the orb again. Speaking -> cut the answer
  // off early; playToEnd()'s promise resolving unblocks askAndSpeak's
  // finally block, which returns state to idle.
  function stop() {
    if (state.value === 'listening') {
      toggleRecording()
    } else if (state.value === 'speaking') {
      waveform.stopPlayback()
    }
  }

  return {
    conversations,
    visibleConversations,
    conversationSearch,
    conversationSort,
    activeConversationId,
    messages,
    loadingConversations,
    question,
    state,
    error,
    toggleRecording,
    submitTyped,
    stop,
    selectConversation,
    startNewConversation,
  }
}
