import { ref, computed } from 'vue'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'
import { formatDate, formatNumber, formatMicrosAsIDR } from '../../shared/utils/format'

export function useTrendChart(seriesRef) {
  const metric = ref('impressions')

  const byDate = computed(() => {
    const totals = new Map()
    for (const row of seriesRef.value) {
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

  return { metric, byDate, chartData, chartOptions }
}
