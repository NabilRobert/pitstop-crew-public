import { computed, type Ref } from 'vue'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'
import type { ConversionActionRow } from '../../shared/api/types'

// Only 4 named actions exist (see profile.ts's CONVERSION_ACTIONS) and
// the endpoint already returns account-wide aggregates, not per-day rows
// — no grouping/toggle needed the way SegmentBreakdownChart's segment_type
// tabs are, closer to CampaignBarChart's single-dataset horizontal bar.
export function useConversionActionChart(rowsRef: Ref<ConversionActionRow[]>) {
  const sorted = computed(() => [...rowsRef.value].sort((a, b) => b.conversions - a.conversions))

  const chartData = computed(() => ({
    labels: sorted.value.map((r) => r.name),
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
