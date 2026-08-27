import { ref } from 'vue'
import { api } from '../api/api'
import type { VoiceAgentType } from '../api/types'

// Shared mic-in/speak-out layer for both the per-report Ask panel and the
// Ask Aska page — one MediaRecorder-based STT path, one Audio-element TTS
// path, reused by whichever composable needs voice.
export function useVoice() {
  const recording = ref(false)
  const transcribing = ref(false)
  const speaking = ref(false)
  const error = ref<string | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let currentAudio: HTMLAudioElement | null = null

  async function startRecording() {
    error.value = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks = []
      // No explicit mimeType — letting the browser pick its own default
      // (webm on Chrome, mp4 on Safari, etc.) is the most broadly
      // compatible option; ElevenLabs STT accepts "all major audio and
      // video formats" regardless of which one we end up with.
      mediaRecorder = new MediaRecorder(stream)
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      mediaRecorder.start()
      recording.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  function stopRecording(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!mediaRecorder || !recording.value) {
        resolve(null)
        return
      }
      const recorder = mediaRecorder
      recorder.onstop = async () => {
        recording.value = false
        recorder.stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        transcribing.value = true
        error.value = null
        try {
          const { text } = await api.stt(blob)
          resolve(text)
        } catch (e) {
          error.value = e instanceof Error ? e.message : String(e)
          resolve(null)
        } finally {
          transcribing.value = false
        }
      }
      recorder.stop()
    })
  }

  async function speak(text: string, agentType: VoiceAgentType) {
    stopSpeaking()
    error.value = null
    speaking.value = true
    try {
      const audioBlob = await api.tts(text, agentType)
      const url = URL.createObjectURL(audioBlob)
      const audio = new Audio(url)
      currentAudio = audio
      audio.onended = () => {
        speaking.value = false
        URL.revokeObjectURL(url)
        if (currentAudio === audio) currentAudio = null
      }
      audio.onerror = () => {
        speaking.value = false
        URL.revokeObjectURL(url)
        if (currentAudio === audio) currentAudio = null
      }
      await audio.play()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      speaking.value = false
    }
  }

  function stopSpeaking() {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    speaking.value = false
  }

  return { recording, transcribing, speaking, error, startRecording, stopRecording, speak, stopSpeaking }
}
