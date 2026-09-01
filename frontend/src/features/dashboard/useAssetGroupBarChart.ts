import { computed, type Ref } from 'vue'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'
import type { AssetGroupRow } from './useCampaignDetail'

// Mirrors useCampaignBarChart.ts exactly — same single-dataset horizontal
// bar pattern, just sorted by conversions over asset groups instead of
// campaigns. Only ever 4 rows (see profile.ts's ASSET_GROUPS), all
// implicitly pmax-only.
export function useAssetGroupBarChart(rowsRef: Ref<AssetGroupRow[]>) {
  const sorted = computed(() => [...rowsRef.value].sort((a, b) => b.conversions - a.conversions))

  const chartData = computed(() => ({
    labels: sorted.value.map((r) => r.asset_group),
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
