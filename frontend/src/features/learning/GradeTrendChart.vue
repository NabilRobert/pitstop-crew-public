<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bar, Line } from 'vue-chartjs'
import { formatDate } from '../../shared/utils/format'
import { useGradeTrendChart, type TrendView } from './useGradeTrendChart'
import type { GradeTrend, TrendAgent } from '../../shared/api/types'

const props = defineProps<{ trend: GradeTrend }>()
const { t } = useI18n()

const AGENTS: { key: TrendAgent; labelKey: string }[] = [
  { key: 'analysis', labelKey: 'learning.gradeTrend.agents.analysis' },
  { key: 'recommendation', labelKey: 'learning.gradeTrend.agents.recommendation' },
  { key: 'summary', labelKey: 'learning.gradeTrend.agents.summary' },
]
const VIEWS: { key: TrendView; labelKey: string }[] = [
  { key: 'outcomes', labelKey: 'learning.gradeTrend.views.outcomes' },
  { key: 'quality', labelKey: 'learning.gradeTrend.views.quality' },
]

const agent = ref<TrendAgent>('analysis')
const view = ref<TrendView>('outcomes')
const trend = computed(() => props.trend)

const { outcomesData, qualityData, outcomesOptions, qualityOptions, plugins, totalOutputs } = useGradeTrendChart(
  toRef(props, 'trend'),
  agent,
  view
)

const events = computed(() => props.trend.events)
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <div class="mb-1 flex flex-wrap items-center justify-between gap-3">
      <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        {{ t('learning.gradeTrend.title', { weeks: trend.weeks.length }) }}
      </h2>
      <div class="flex flex-wrap gap-2">
        <div class="flex gap-1 rounded-lg border border-border bg-surface p-1">
          <button
            v-for="a in AGENTS"
            :key="a.key"
            type="button"
            class="rounded px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
            :class="agent === a.key ? 'bg-rosso text-bianco' : 'text-ink-faint hover:text-ink'"
            @click="agent = a.key"
          >
            {{ t(a.labelKey) }}
          </button>
        </div>
        <div class="flex gap-1 rounded-lg border border-border bg-surface p-1">
          <button
            v-for="v in VIEWS"
            :key="v.key"
            type="button"
            class="rounded px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
            :class="view === v.key ? 'bg-rosso text-bianco' : 'text-ink-faint hover:text-ink'"
            @click="view = v.key"
          >
            {{ t(v.labelKey) }}
          </button>
        </div>
      </div>
    </div>
    <p class="mb-4 text-xs text-ink-faint">{{ t(`learning.gradeTrend.desc.${view}`) }}</p>

    <div class="h-64">
      <template v-if="totalOutputs > 0">
        <Bar v-if="view === 'outcomes'" :data="outcomesData" :options="outcomesOptions" :plugins="plugins" />
        <Line v-else :data="qualityData" :options="qualityOptions" :plugins="plugins" />
      </template>
      <div v-else class="flex h-full items-center justify-center text-ink-faint">{{ t('learning.noReportsYet') }}</div>
    </div>

    <ul v-if="events.length" class="mt-4 space-y-1 border-t border-border pt-3 text-xs text-ink-faint">
      <li v-for="ev in events" :key="ev.key">
        <span class="font-mono font-bold text-ink-soft">┆ {{ formatDate(ev.date) }}</span>
        — {{ t(`learning.gradeTrend.events.${ev.key}`, ev.label) }}
      </li>
    </ul>
    <p class="mt-2 text-xs text-ink-faint">{{ t('learning.gradeTrend.caveat') }}</p>
  </div>
</template>
