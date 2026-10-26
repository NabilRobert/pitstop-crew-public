import { computed, type Ref } from 'vue'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'
import { formatDate, formatPercent } from '../../shared/utils/format'
import type { PerformanceRow } from '../../shared/api/types'

// A genuine deviation from this codebase's "always exactly one dataset"
// chart convention (see chartTheme.ts) — a stacked bar is the only sane
// way to show 3 shares of the same 100% pie (won/budget-lost/rank-lost)
// stacking to a visibly full or short bar. Uses the new flagGood/
// flagCaution/flagCritical palette entries (chartTheme.ts), NOT
// rosso/giallo/verde — those are Ferrari-brand accent colors that only
// happen to be green/yellow/red in the Ferrari theme; Blueprint
// reassigns them to gray/near-black/blue, which would silently break
// this chart's good/caution/critical meaning in that theme.
export function useImpressionShareChart(rowsRef: Ref<PerformanceRow[]>) {
  const chartData = computed(() => ({
    labels: rowsRef.value.map((r) => formatDate(r.date)),
    datasets: [
      {
        label: 'Impression share',
        data: rowsRef.value.map((r) => (r.search_impression_share ?? 0) * 100),
        backgroundColor: CHART_COLORS.value.flagGood,
        stack: 'share',
      },
      {
        label: 'Lost to budget',
        data: rowsRef.value.map((r) => (r.search_budget_lost_impression_share ?? 0) * 100),
        backgroundColor: CHART_COLORS.value.flagCaution,
        stack: 'share',
      },
      {
        label: 'Lost to rank',
        data: rowsRef.value.map((r) => (r.search_rank_lost_impression_share ?? 0) * 100),
        backgroundColor: CHART_COLORS.value.flagCritical,
        stack: 'share',
      },
    ],
  }))

  // createBaseChartOptions() returns a fresh, independently-owned object —
  // see chartTheme.ts for why sharing one across chart instances corrupts
  // rendering. stacked:true on both axes is new here — no other chart in
  // this app stacks, so this can't just reuse a shared stacked-options
  // constant.
  const chartOptions = createBaseChartOptions()
  chartOptions.plugins!.legend!.display = true
  chartOptions.plugins!.tooltip!.callbacks = {
    label: (context: { dataset: { label?: string }; parsed: { y: number | null } }) =>
      `${context.dataset.label}: ${formatPercent(context.parsed.y ?? 0)}`,
  }
  chartOptions.scales!.x!.stacked = true
  chartOptions.scales!.y!.stacked = true
  chartOptions.scales!.y!.max = 100
  chartOptions.scales!.y!.ticks!.callback = (value: number | string) => formatPercent(Number(value), 0)

  return { chartData, chartOptions }
}
