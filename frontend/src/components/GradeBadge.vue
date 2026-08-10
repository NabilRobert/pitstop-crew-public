<script setup>
import { computed } from 'vue'

const props = defineProps({
  grade: { type: String, default: null }, // 'A' | 'B' | 'C' | 'D' | 'F' | null
  rationale: { type: String, default: '' },
})

const color = computed(() => {
  if (props.grade === 'A' || props.grade === 'B') return 'flag-good'
  if (props.grade === 'C') return 'flag-caution'
  if (props.grade === 'D' || props.grade === 'F') return 'flag-critical'
  return 'ink-faint'
})
</script>

<template>
  <span
    v-if="grade"
    class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
    :class="{ 'has-tooltip': rationale }"
    :data-tooltip="rationale || undefined"
    :tabindex="rationale ? 0 : undefined"
    :style="{
      color: `var(--color-${color})`,
      borderColor: `color-mix(in srgb, var(--color-${color}) 40%, transparent)`,
      backgroundColor: `color-mix(in srgb, var(--color-${color}) 12%, transparent)`,
    }"
  >
    Grade {{ grade }}
  </span>
</template>
