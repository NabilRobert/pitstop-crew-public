<script setup lang="ts">
import { toRef, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bar } from 'vue-chartjs'
import { formatPercent } from '../../shared/utils/format'
import { useImpressionShareChart } from './useImpressionShareChart'
import type { PerformanceRow } from '../../shared/api/types'

const props = defineProps<{ rows: PerformanceRow[] }>()

const { t } = useI18n()

const { chartData, chartOptions } = useImpressionShareChart(toRef(props, 'rows'))

// Optimization Score is a single account-health number, not a 3-way
// split — shown as a stat next to the chart title rather than folded
// into the stacked bar. Latest day's value, not an average — it's a
// current-state diagnostic like Quality Score, not something to blend
// across a window.
const latestOptimizationScore = computed(() => {
  const withScore = props.rows.filter((r) => r.optimization_score !== null)
  if (!withScore.length) return null
  return withScore[withScore.length - 1].optimization_score
})
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        {{ t('impressionShareChart.title') }}
      </h2>
      <div v-if="latestOptimizationScore !== null" class="text-right">
        <div class="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          {{ t('impressionShareChart.optimizationScore') }}
        </div>
        <div class="font-display text-lg font-bold tabular-nums text-ink">
          {{ formatPercent(latestOptimizationScore * 100, 0) }}
        </div>
      </div>
    </div>
    <div class="h-64">
      <Bar v-if="rows.length" :data="chartData" :options="chartOptions" />
      <div v-else class="flex h-full items-center justify-center text-ink-faint">{{ t('common.noDataYet') }}</div>
    </div>
  </div>
</template>
