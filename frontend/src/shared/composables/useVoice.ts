import { ref } from 'vue'
import { api } from '../api/api'
import { createLevelMeter } from './useAudioLevel'
import type { VoiceAgentType } from '../api/types'

// Shared mic-in/speak-out layer for both the per-report Ask panel and the
// Ask Aska page — one MediaRecorder-based STT path, one Audio-element TTS
// path, reused by whichever composable needs voice. micLevel/playbackLevel
// are live 0..1 amplitude readings (see useAudioLevel.ts) for driving the
// voice orb's glow/scale while listening or speaking.
export function useVoice() {
  const recording = ref(false)
  const transcribing = ref(false)
  const speaking = ref(false)
  const error = ref<string | null>(null)

  const micMeter = createLevelMeter()
  const playbackMeter = createLevelMeter()

  let audioCtx: AudioContext | null = null
  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let currentAudio: HTMLAudioElement | null = null
  // createMediaElementSource can only be called once per <audio> element,
  // so a single reusable element (rather than `new Audio()` per speak()
  // call) avoids hitting that limit on a second answer.
  let ttsAudioEl: HTMLAudioElement | null = null

  function getAudioContext(): AudioContext {
    if (!audioCtx) audioCtx = new AudioContext()
    return audioCtx
  }

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

      const ctx = getAudioContext()
      await ctx.resume()
      micMeter.start(ctx, ctx.createMediaStreamSource(stream))
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  function stopRecording(): Promise<string | null> {
    return new Promise((resolve) => {
      micMeter.stop()
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

      if (!ttsAudioEl) {
        ttsAudioEl = new Audio()
        const ctx = getAudioContext()
        const source = ctx.createMediaElementSource(ttsAudioEl)
        // Route through the analyser AND back to the speakers — capturing
        // an element into the Web Audio graph silences it unless it's
        // explicitly reconnected to the destination.
        source.connect(ctx.destination)
        ttsAudioEl.addEventListener('play', () => playbackMeter.start(ctx, source))
      }
      const audio = ttsAudioEl
      audio.src = url
      currentAudio = audio
      audio.onended = () => {
        speaking.value = false
        playbackMeter.stop()
        URL.revokeObjectURL(url)
        if (currentAudio === audio) currentAudio = null
      }
      audio.onerror = () => {
        speaking.value = false
        playbackMeter.stop()
        URL.revokeObjectURL(url)
        if (currentAudio === audio) currentAudio = null
      }
      await getAudioContext().resume()
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
    playbackMeter.stop()
    speaking.value = false
  }

  return {
    recording,
    transcribing,
    speaking,
    error,
    micLevel: micMeter.level,
    playbackLevel: playbackMeter.level,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
  }
}
