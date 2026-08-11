<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bar } from 'vue-chartjs'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'

const { t } = useI18n()

const props = defineProps({
  rows: { type: Array, required: true }, // {campaign, conversions, ...}
})

const sorted = computed(() => [...props.rows].sort((a, b) => b.conversions - a.conversions))

const chartData = computed(() => ({
  labels: sorted.value.map((r) => r.campaign),
  datasets: [
    {
      data: sorted.value.map((r) => r.conversions),
      backgroundColor: CHART_COLORS.value.giallo,
      borderRadius: 3,
    },
  ],
}))

const chartOptions = (() => {
  const opts = createBaseChartOptions()
  opts.indexAxis = 'y'
  opts.scales.y.beginAtZero = undefined
  return opts
})()
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <h2 class="mb-4 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
      {{ t('campaignBarChart.title') }}
    </h2>
    <div class="h-64">
      <Bar v-if="sorted.length" :data="chartData" :options="chartOptions" />
      <div v-else class="flex h-full items-center justify-center text-ink-faint">{{ t('common.noDataYet') }}</div>
    </div>
  </div>
</template>
