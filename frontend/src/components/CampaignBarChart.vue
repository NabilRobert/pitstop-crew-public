<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import { CHART_COLORS, baseChartOptions } from '../lib/chartTheme'

const props = defineProps({
  rows: { type: Array, required: true }, // {campaign, conversions, ...}
})

const sorted = computed(() => [...props.rows].sort((a, b) => b.conversions - a.conversions))

const chartData = computed(() => ({
  labels: sorted.value.map((r) => r.campaign),
  datasets: [
    {
      data: sorted.value.map((r) => r.conversions),
      backgroundColor: CHART_COLORS.giallo,
      borderRadius: 3,
    },
  ],
}))

const chartOptions = computed(() => ({
  ...baseChartOptions,
  indexAxis: 'y',
  scales: {
    ...baseChartOptions.scales,
    y: { ...baseChartOptions.scales.y, beginAtZero: undefined },
  },
}))
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <h2 class="mb-4 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
      Campaigns by conversions
    </h2>
    <div class="h-64">
      <Bar v-if="sorted.length" :data="chartData" :options="chartOptions" />
      <div v-else class="flex h-full items-center justify-center text-ink-faint">No data yet.</div>
    </div>
  </div>
</template>
