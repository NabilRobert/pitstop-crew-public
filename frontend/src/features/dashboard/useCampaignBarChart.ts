import { computed, type Ref } from 'vue'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'
import type { CampaignRow } from './useDashboard'

export function useCampaignBarChart(rowsRef: Ref<CampaignRow[]>) {
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
