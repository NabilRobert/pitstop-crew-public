<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Line } from 'vue-chartjs'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'
import { formatDate, formatNumber, formatMicrosAsIDR } from '../../shared/utils/format'

const props = defineProps({
  series: { type: Array, required: true }, // rows from /performance: {date, campaign, impressions, clicks, cost_micros, conversions}
})

const { t } = useI18n()

const METRICS = [
  { key: 'impressions', labelKey: 'metrics.impressions' },
  { key: 'clicks', labelKey: 'metrics.clicks' },
  { key: 'cost_micros', labelKey: 'metrics.cost' },
  { key: 'conversions', labelKey: 'metrics.conversions' },
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
      borderColor: CHART_COLORS.value.rosso,
      backgroundColor: `${CHART_COLORS.value.rosso}33`,
      pointBackgroundColor: CHART_COLORS.value.rosso,
      pointRadius: 3,
      tension: 0.3,
      fill: true,
    },
  ],
}))

// Each metric has its own real-world unit — cost_micros in particular is
// meaningless as a raw number (millions of micros per day), so the axis
// and tooltip both need the same per-metric formatter the rest of the
// app already uses, not the raw stored value.
function formatMetricValue(value) {
  if (metric.value === 'cost_micros') return formatMicrosAsIDR(value)
  if (metric.value === 'conversions') return (value ?? 0).toFixed(1)
  return formatNumber(value)
}

// createBaseChartOptions() returns a fresh, independently-owned object —
// see chartTheme.js for why that matters (Chart.js mutates options
// objects internally; sharing one across chart instances corrupts them).
const chartOptions = createBaseChartOptions()
chartOptions.plugins.tooltip.callbacks = {
  label: (context) => formatMetricValue(context.parsed.y),
}
chartOptions.scales.y.ticks.callback = (value) => formatMetricValue(value)
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
      <Line v-if="byDate.length" :data="chartData" :options="chartOptions" />
      <div v-else class="flex h-full items-center justify-center text-ink-faint">{{ t('common.noDataYet') }}</div>
    </div>
  </div>
</template>
