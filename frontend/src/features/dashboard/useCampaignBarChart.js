import { computed } from 'vue'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'

export function useCampaignBarChart(rowsRef) {
  const sorted = computed(() => [...rowsRef.value].sort((a, b) => b.conversions - a.conversions))

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

  return { sorted, chartData, chartOptions }
}
