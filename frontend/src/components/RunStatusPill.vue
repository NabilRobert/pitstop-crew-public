<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, required: true }, // 'success' | 'failure' | 'partial'
})

const config = computed(() => {
  switch (props.status) {
    case 'success':
      return { label: 'Success', color: 'flag-good', dot: true }
    case 'failure':
      return { label: 'Failure', color: 'flag-critical', dot: true }
    case 'partial':
      return { label: 'Partial', color: 'flag-caution', dot: true }
    default:
      return { label: props.status, color: 'ink-faint', dot: false }
  }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
    :style="{
      color: `var(--color-${config.color})`,
      borderColor: `color-mix(in srgb, var(--color-${config.color}) 40%, transparent)`,
      backgroundColor: `color-mix(in srgb, var(--color-${config.color}) 12%, transparent)`,
    }"
  >
    <span
      v-if="config.dot"
      class="h-1.5 w-1.5 rounded-full"
      :style="{ backgroundColor: `var(--color-${config.color})` }"
    />
    {{ config.label }}
  </span>
</template>
