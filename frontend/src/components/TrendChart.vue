<script setup>
import { ref, computed } from 'vue'
import { Line } from 'vue-chartjs'
import { CHART_COLORS, baseChartOptions } from '../lib/chartTheme'
import { formatDate } from '../lib/format'

const props = defineProps({
  series: { type: Array, required: true }, // rows from /performance: {date, campaign, impressions, clicks, cost_micros, conversions}
})

const METRICS = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'cost_micros', label: 'Cost' },
  { key: 'conversions', label: 'Conversions' },
]
const metric = ref('impressions')

const byDate = computed(() => {
  const totals = new Map()
  for (const row of props.series) {
    if (!totals.has(row.date)) totals.set(row.date, { impressions: 0, clicks: 0, cost_micros: 0, conversions: 0 })
    const acc = totals.get(row.date)
    acc.impressions += row.impressions
    acc.clicks += row.clicks
    acc.cost_micros += row.cost_micros
    acc.conversions += row.conversions
  }
  return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b))
})

const chartData = computed(() => ({
  labels: byDate.value.map(([date]) => formatDate(date)),
  datasets: [
    {
      data: byDate.value.map(([, totals]) => totals[metric.value]),
      borderColor: CHART_COLORS.rosso,
      backgroundColor: `${CHART_COLORS.rosso}33`,
      pointBackgroundColor: CHART_COLORS.rosso,
      pointRadius: 3,
      tension: 0.3,
      fill: true,
    },
  ],
}))
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">Trend</h2>
      <div class="flex gap-1">
        <button
          v-for="m in METRICS"
          :key="m.key"
          type="button"
          class="rounded px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide"
          :class="metric === m.key ? 'bg-rosso text-bianco' : 'text-ink-faint hover:text-ink'"
          @click="metric = m.key"
        >
          {{ m.label }}
        </button>
      </div>
    </div>
    <div class="h-64">
      <Line v-if="byDate.length" :data="chartData" :options="baseChartOptions" />
      <div v-else class="flex h-full items-center justify-center text-ink-faint">No data yet.</div>
    </div>
  </div>
</template>
