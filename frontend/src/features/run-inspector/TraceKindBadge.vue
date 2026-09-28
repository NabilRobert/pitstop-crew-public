<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TraceKind } from '../../shared/api/types'

const props = defineProps<{ kind: TraceKind }>()
const { t } = useI18n()

// Semantic tokens only (the flag-* colors hold in both themes): calls are
// neutral, judgement steps are caution, failures are critical.
const COLOR: Record<TraceKind, string> = {
  run: 'ink',
  context: 'ink-faint',
  agent: 'flag-good',
  llm_call: 'ink-soft',
  critic_review: 'flag-caution',
  decision: 'flag-caution',
  revision: 'flag-good',
  email: 'ink-faint',
  error: 'flag-critical',
}
const color = computed(() => COLOR[props.kind] ?? 'ink-faint')
</script>

<template>
  <span
    class="inline-block w-24 shrink-0 rounded border px-1.5 py-0.5 text-center font-mono text-[10px] font-bold uppercase tracking-wide"
    :style="{
      color: `var(--color-${color})`,
      borderColor: `color-mix(in srgb, var(--color-${color}) 40%, transparent)`,
      backgroundColor: `color-mix(in srgb, var(--color-${color}) 10%, transparent)`,
    }"
  >
    {{ t(`runInspector.kinds.${kind}`) }}
  </span>
</template>
