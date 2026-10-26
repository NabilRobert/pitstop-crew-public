import { ref, type Ref } from 'vue'

// Small Web Audio AnalyserNode wrapper — samples a live audio source
// (mic input while recording, or a playing <audio> element) into a
// single 0..1 RMS level per frame, for driving the voice orb's glow/scale.
export function createLevelMeter() {
  const level: Ref<number> = ref(0)

  let analyser: AnalyserNode | null = null
  let data: Uint8Array<ArrayBuffer> | null = null
  let rafId: number | null = null

  function tick() {
    if (!analyser || !data) return
    analyser.getByteTimeDomainData(data)
    let sumSquares = 0
    for (const v of data) {
      const norm = (v - 128) / 128
      sumSquares += norm * norm
    }
    level.value = Math.sqrt(sumSquares / data.length)
    rafId = requestAnimationFrame(tick)
  }

  function start(audioCtx: AudioContext, sourceNode: AudioNode) {
    stop()
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    data = new Uint8Array(analyser.frequencyBinCount)
    sourceNode.connect(analyser)
    tick()
  }

  function stop() {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    analyser = null
    data = null
    level.value = 0
  }

  return { level, start, stop }
}
