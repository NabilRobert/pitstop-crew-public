<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, required: true }, // 'approved' | 'flagged' | 'draft' | 'revised'
})

const config = computed(() => {
  switch (props.status) {
    case 'approved':
      return { label: 'Critic-approved', color: 'flag-good', dot: true }
    case 'flagged':
      return { label: 'Flagged by critic', color: 'flag-caution', dot: true }
    case 'revised':
      return { label: 'Revised', color: 'ink-soft', dot: false }
    default:
      return { label: 'Draft', color: 'ink-faint', dot: false }
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
