<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Intent } from '../../shared/api/types'
import { INTENT_COLOR, dominantIntent, mixParts } from './intent'

const props = defineProps<{
  mix: Partial<Record<Intent, number>> | null | undefined
  /** Visible search-term spend / keyword spend, 0-1. */
  coverage?: number | null
}>()

const { t } = useI18n()

const parts = computed(() => mixParts(props.mix))
const dominant = computed(() => dominantIntent(parts.value))
const pct = (share: number) => Math.round(share * 100)

const tooltip = computed(() => {
  const lines = parts.value.map((p) => `${t(`keywordOptimizer.intent.${p.intent}`)} ${pct(p.share)}%`)
  if (props.coverage !== null && props.coverage !== undefined) {
    lines.push(t('keywordOptimizer.intent.coverage', { pct: pct(props.coverage) }))
  }
  lines.push(t('keywordOptimizer.intent.proxyNote'))
  return lines.join(' · ')
})
</script>

<template>
  <!-- null / empty = no classified terms yet: "no data yet", never a 0% bar. -->
  <span v-if="!dominant" class="text-ink-faint" :title="t('keywordOptimizer.intent.noData')">—</span>
  <div v-else class="min-w-[7rem]" :title="tooltip">
    <div class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-soft">
      {{ t(`keywordOptimizer.intent.${dominant.intent}`) }} {{ pct(dominant.share) }}%
    </div>
    <div class="mt-1 flex h-1.5 w-full gap-px overflow-hidden rounded bg-surface-raised" role="img" :aria-label="tooltip">
      <span
        v-for="p in parts"
        :key="p.intent"
        :style="{ width: `${p.share * 100}%`, backgroundColor: INTENT_COLOR[p.intent] }"
      />
    </div>
  </div>
</template>
