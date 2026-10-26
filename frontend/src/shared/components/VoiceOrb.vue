<script setup lang="ts">
import { computed } from 'vue'

// Pure-CSS glowing orb — no canvas, no animation library. Four states:
// idle/thinking are static (no motion — thinking is deliberately calm,
// not a spinner, so it doesn't compete with listening/speaking for
// attention), listening/speaking react live to a 0..1 amplitude level
// (mic input / TTS playback respectively, see useAudioLevel.ts) — those
// are the two states that actually move or flicker. Colors come entirely
// from the app's existing --glow-1/--glow-2/--color-rosso/--color-giallo
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

/* idle (standby) — quiet, static glow, no motion */
.voice-orb--idle .voice-orb__core { box-shadow: 0 0 2rem 0.5rem var(--glow-1); transform: none; }

/* listening — driven live by --intensity (mic level), set inline above */

/* thinking — deliberately static, not animated: this is Aska "working,"
   not another audio-reactive state, so it should read as visually calm
   and distinct from listening/speaking rather than competing with them.
   A dimmer, cooler-tinted glow (no giallo warmth) signals "paused" at a
   glance. */
.voice-orb--thinking .voice-orb__core {
  background: radial-gradient(
    circle at 35% 30%,
    color-mix(in srgb, var(--color-ink-faint) 45%, transparent),
    color-mix(in srgb, var(--color-rosso) 35%, transparent) 55%,
    var(--color-surface) 90%
  );
  box-shadow: 0 0 1.5rem 0.25rem var(--glow-2);
  transform: none;
}

/* speaking — driven live by --intensity (playback level) like listening,
   but pushed further: a wider scale range and a brighter, more saturated
   glow so the orb reads as noticeably more energetic while Aska talks
   than it does while just listening. */
.voice-orb--speaking .voice-orb__core {
  box-shadow:
    0 0 calc(2.5rem + 5rem * var(--intensity)) calc(0.75rem + 1.5rem * var(--intensity)) var(--glow-1),
    0 0 calc(1.5rem + 3rem * var(--intensity)) calc(0.5rem + 1rem * var(--intensity)) var(--color-giallo-soft);
  transform: scale(calc(1 + 0.22 * var(--intensity)));
}
</style>
