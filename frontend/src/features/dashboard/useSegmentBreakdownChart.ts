import { ref, computed, watch, type Ref } from 'vue'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'
import type { SegmentPerformanceRow } from '../../shared/api/types'

export function useSegmentBreakdownChart(rowsRef: Ref<SegmentPerformanceRow[]>) {
  const types = computed(() => [...new Set(rowsRef.value.map((r) => r.segment_type))].sort())
  const activeType = ref<string | null>(types.value[0] ?? null)
  watch(types, (t) => {
    if (!activeType.value || !t.includes(activeType.value)) activeType.value = t[0] ?? null
  })

  const rowsForType = computed(() =>
    rowsRef.value.filter((r) => r.segment_type === activeType.value).sort((a, b) => b.conversions - a.conversions)
  )

  const chartData = computed(() => ({
    labels: rowsForType.value.map((r) => r.segment_value),
    datasets: [
      {
        data: rowsForType.value.map((r) => r.conversions),
        backgroundColor: CHART_COLORS.value.verde,
        borderRadius: 3,
      },
    ],
  }))

  const chartOptions = createBaseChartOptions()
  chartOptions.indexAxis = 'y'

  return { types, activeType, rowsForType, chartData, chartOptions }
}
