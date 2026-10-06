<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMicrosAsIDR } from '../../shared/utils/format'
import type { Headline, BoardNumbers } from './boardModel'

const props = defineProps<{ headline: Headline; numbers: BoardNumbers; noRunYet: boolean }>()
const { t } = useI18n()

/** "3 stop wasting money, 2 do more of what works, 1 is worth trying" — groups with nothing in them are left out. */
const parts = computed(() => {
  const out: string[] = []
  if (props.headline.stop) out.push(t('keywordOptimizer.board.headline.stop', { n: props.headline.stop }))
  if (props.headline.grow) out.push(t('keywordOptimizer.board.headline.grow', { n: props.headline.grow }))
  if (props.headline.fresh) out.push(t('keywordOptimizer.board.headline.fresh', { n: props.headline.fresh }))
  return out
})
</script>

<template>
  <section class="headline" :aria-label="t('keywordOptimizer.board.headline.aria')">
    <div class="headline__sentence">
      <h2 class="headline__title">
        <template v-if="noRunYet">{{ t('keywordOptimizer.board.headline.noRun') }}</template>
        <template v-else-if="headline.total === 0">{{ t('keywordOptimizer.board.headline.nothing') }}</template>
        <template v-else>{{ t('keywordOptimizer.board.headline.title', { n: headline.total }, headline.total) }}</template>
      </h2>
      <p v-if="!noRunYet && headline.total > 0" class="headline__detail">{{ parts.join(', ') }}.</p>
      <p v-else-if="noRunYet" class="headline__detail">{{ t('keywordOptimizer.board.headline.noRunDetail') }}</p>
      <p class="headline__safe">{{ t('keywordOptimizer.board.headline.safe') }}</p>
    </div>

    <dl class="headline__numbers">
      <div class="stat stat--pink">
        <dt>{{ t('keywordOptimizer.board.numbers.nowhere') }}</dt>
        <dd>{{ numbers.nowhereMicros === null ? '—' : formatMicrosAsIDR(numbers.nowhereMicros) }}</dd>
        <dd class="stat__hint">{{ t('keywordOptimizer.board.numbers.nowhereHint') }}</dd>
      </div>
      <div class="stat stat--cyan">
        <dt>{{ t('keywordOptimizer.board.numbers.winners') }}</dt>
        <dd>{{ numbers.winnersMicros === null ? '—' : formatMicrosAsIDR(numbers.winnersMicros) }}</dd>
        <dd class="stat__hint">{{ t('keywordOptimizer.board.numbers.winnersHint') }}</dd>
      </div>
      <div class="stat stat--white">
        <dt>{{ t('keywordOptimizer.board.numbers.todo') }}</dt>
        <dd>{{ headline.total }}</dd>
        <dd class="stat__hint">{{ t('keywordOptimizer.board.numbers.todoHint') }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.headline { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.headline__sentence { flex: 2 1 280px; background: #ffe556; color: #000; border: 1.5px solid #000; padding: 12px 14px; }
.headline__title { margin: 0; font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; line-height: 1.15; color: #000; }
.headline__detail { margin: 4px 0 0; font-size: 1rem; }
.headline__safe { margin: 6px 0 0; font-size: 0.82rem; }
.headline__numbers { flex: 3 1 360px; display: flex; flex-wrap: wrap; gap: 12px; margin: 0; }
.stat { flex: 1 1 130px; padding: 10px 12px; color: #000; border: 1.5px solid #000; }
.stat--pink { background: #f4c2c2; }
.stat--cyan { background: #00bcf0; }
.stat--white { background: #ffffff; }
.stat dt { font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.stat dd { margin: 0; }
.stat dd:not(.stat__hint) { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
.stat__hint { font-size: 0.78rem; line-height: 1.3; }
</style>
