import { onUnmounted, watch, type Ref } from 'vue'
import WaveSurfer from 'wavesurfer.js'
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.js'
import { theme } from './theme'

// wavesurfer draws to <canvas>, so it needs resolved color values, not
// CSS var() strings — read the live custom properties off the root
// element rather than hardcoding hex, so this stays in sync if the
// design tokens in style.css ever change.
function readThemeColors() {
  const styles = getComputedStyle(document.documentElement)
  return {
    waveColor: styles.getPropertyValue('--color-border-strong').trim() || '#3c393f',
    progressColor: styles.getPropertyValue('--color-rosso').trim() || '#e42528',
    cursorColor: styles.getPropertyValue('--color-giallo').trim() || '#f8e823',
  }
}

// Live-recording + playback waveform, backing the Ask Aska page's visual.
// Record plugin owns the actual mic capture here (rather than reusing
// useVoice.ts's MediaRecorder path) so the live scrolling waveform and
// the captured audio come from the same single mic stream, instead of
// opening two separate getUserMedia sessions for one recording.
export function useWaveform(containerRef: Ref<HTMLElement | null>) {
  let wavesurfer: WaveSurfer | null = null
  let recordPlugin: RecordPlugin | null = null

  function ensureInstance(): WaveSurfer {
    if (wavesurfer) return wavesurfer
    if (!containerRef.value) throw new Error('useWaveform: container ref not mounted yet')
    const colors = readThemeColors()
    wavesurfer = WaveSurfer.create({
      container: containerRef.value,
      height: 64,
      barWidth: 3,
      barGap: 2,
      barRadius: 2,
      cursorWidth: 0,
      ...colors,
    })
    recordPlugin = wavesurfer.registerPlugin(
      RecordPlugin.create({ scrollingWaveform: true, renderRecordedAudio: false })
    )
    return wavesurfer
  }

  // Re-theme in place (Ferrari <-> Blueprint) without recreating the
  // instance — setOptions() re-renders with the new resolved colors.
  watch(theme, () => {
    wavesurfer?.setOptions(readThemeColors())
  })

  async function startRecording() {
    ensureInstance()
    await recordPlugin!.startRecording()
  }

  function stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!recordPlugin) {
        resolve(new Blob())
        return
      }
      recordPlugin.once('record-end', (blob: Blob) => resolve(blob))
      recordPlugin.stopRecording()
    })
  }

  async function loadPlayback(blob: Blob) {
    const instance = ensureInstance()
    await instance.loadBlob(blob)
  }

  // Loads and plays a completed audio blob (the TTS answer), resolving
  // once playback finishes — lets the caller drive an orb state
  // transition (e.g. 'speaking' -> 'idle') off a real event instead of
  // a guessed timeout.
  async function playToEnd(blob: Blob): Promise<void> {
    const instance = ensureInstance()
    await instance.loadBlob(blob)
    return new Promise((resolve) => {
      instance.once('finish', () => resolve())
      instance.play()
    })
  }

  function destroy() {
    recordPlugin?.destroy()
    wavesurfer?.destroy()
    wavesurfer = null
    recordPlugin = null
  }

  onUnmounted(destroy)

  return { startRecording, stopRecording, loadPlayback, playToEnd, destroy }
}
