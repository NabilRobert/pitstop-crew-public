<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bar } from 'vue-chartjs'
import { METRICS } from './metrics'
import { useTrendChart } from './useTrendChart'
import type { PerformanceRow } from '../../shared/api/types'

const props = defineProps<{ series: PerformanceRow[] }>()

const { t } = useI18n()

const { metric, byDate, chartData, chartOptions } = useTrendChart(toRef(props, 'series'))
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('trendChart.title') }}</h2>
      <div class="flex gap-1">
        <button
          v-for="m in METRICS"
          :key="m.key"
          type="button"
          class="rounded px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide"
          :class="metric === m.key ? 'bg-rosso text-bianco' : 'text-ink-faint hover:text-ink'"
          @click="metric = m.key"
        >
          {{ t(m.labelKey) }}
        </button>
      </div>
    </div>
    <div class="h-64">
      <Bar v-if="byDate.length" :data="chartData" :options="chartOptions" />
      <div v-else class="flex h-full items-center justify-center text-ink-faint">{{ t('common.noDataYet') }}</div>
    </div>
  </div>
</template>
