<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bar } from 'vue-chartjs'
import { useSegmentBreakdownChart } from './useSegmentBreakdownChart'
import type { SegmentPerformanceRow } from '../../shared/api/types'

const { t } = useI18n()

const props = defineProps<{ rows: SegmentPerformanceRow[] }>()

const { types, activeType, rowsForType, chartData, chartOptions } = useSegmentBreakdownChart(toRef(props, 'rows'))
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        {{ t('segmentChart.title') }}
      </h2>
      <div class="nav-scroll flex max-w-full gap-1 overflow-x-auto">
        <button
          v-for="t in types"
          :key="t"
          type="button"
          class="shrink-0 whitespace-nowrap rounded-sm px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide capitalize"
          :class="activeType === t ? 'bg-rosso text-bianco' : 'text-ink-faint hover:text-ink'"
          @click="activeType = t"
        >
          {{ t }}
        </button>
      </div>
    </div>
    <div class="h-64">
      <Bar v-if="rowsForType.length" :data="chartData" :options="chartOptions" />
      <div v-else class="flex h-full items-center justify-center text-ink-faint">{{ t('segmentChart.noData') }}</div>
    </div>
  </div>
</template>
