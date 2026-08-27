<script setup lang="ts">
import { computed } from 'vue'

// Pure-CSS glowing orb — no canvas, no animation library. Reacts to a live
// 0..1 amplitude level while listening/speaking (see useAudioLevel.ts),
// and falls back to a CSS keyframe pulse for 'thinking' (there's no
// amplitude to drive while waiting on the LLM). Colors come entirely from
// the app's existing --glow-1/--glow-2/--color-rosso/--color-giallo
// tokens, so it re-themes automatically with the Ferrari/Blueprint switch
// instead of needing its own palette.
const props = withDefaults(
  defineProps<{
    state: 'idle' | 'listening' | 'thinking' | 'speaking'
    level?: number
  }>(),
  { level: 0 }
)

// Clamp + smooth the raw meter reading into a scale/glow multiplier —
// sqrt so quiet sounds still register visually instead of only the
// loudest peaks moving the orb.
const intensity = computed(() => Math.min(1, Math.sqrt(Math.max(0, props.level))))
</script>

<template>
  <div class="voice-orb" :class="`voice-orb--${state}`" :style="{ '--intensity': intensity }">
    <div class="voice-orb__core" />
    <div class="voice-orb__ring" />
  </div>
</template>

<style scoped>
.voice-orb {
  --intensity: 0;
  position: relative;
  width: 9rem;
  height: 9rem;
  display: grid;
  place-items: center;
}

.voice-orb__core {
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  background: radial-gradient(
    circle at 35% 30%,
    color-mix(in srgb, var(--color-giallo) 70%, transparent),
    color-mix(in srgb, var(--color-rosso) 65%, transparent) 55%,
    var(--color-surface) 90%
  );
  box-shadow:
    0 0 calc(2rem + 3rem * var(--intensity)) calc(0.5rem + 1rem * var(--intensity)) var(--glow-1),
    0 0 calc(1rem + 2rem * var(--intensity)) var(--glow-2);
  transform: scale(calc(1 + 0.12 * var(--intensity)));
  transition: transform 80ms ease-out, box-shadow 80ms ease-out;
}

.voice-orb__ring {
  position: absolute;
  inset: -0.5rem;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--color-rosso) 40%, transparent);
  opacity: 0;
}

/* idle — quiet, static glow, no motion */
.voice-orb--idle .voice-orb__core { box-shadow: 0 0 2rem 0.5rem var(--glow-1); transform: none; }

/* listening — driven live by --intensity (mic level), set inline above */

/* thinking — no amplitude signal available, so a steady rotating ring
   substitutes for "processing" instead of reacting to nothing */
.voice-orb--thinking .voice-orb__core { animation: voice-orb-breathe 1.6s ease-in-out infinite; }
.voice-orb--thinking .voice-orb__ring {
  opacity: 1;
  border-style: dashed;
  animation: voice-orb-spin 3s linear infinite;
}

/* speaking — driven live by --intensity (playback level), same as listening */

@keyframes voice-orb-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
@keyframes voice-orb-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
