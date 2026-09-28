import { computed, ref, type Ref } from 'vue'
import type { Plugin } from 'chart.js'
import { useI18n } from 'vue-i18n'
import { CHART_COLORS, createBaseChartOptions } from '../../shared/utils/chartTheme'
import { formatDate, formatPercent } from '../../shared/utils/format'
import type { GradeTrend, TrendAgent } from '../../shared/api/types'

export type TrendView = 'outcomes' | 'quality'

// Whole-percent share, or null when there's nothing to divide by — a null
// point leaves a gap in a line instead of a misleading drop to 0%.
function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
}

const dayMs = 86_400_000

// Deploy-event marker: a dashed vertical line at the event's date, placed by
// its position inside its week's category slot. The x scale runs with
// offset:true so both bar and line views have the same slot geometry.
function eventMarkerPlugin(trend: Ref<GradeTrend | null>): Plugin {
  return {
    id: 'deployEvents',
    afterDatasetsDraw(chart) {
      const t = trend.value
      const area = chart.chartArea
      if (!t || !t.weeks.length || !area) return
      const step = area.width / t.weeks.length
      const ctx = chart.ctx
      const drawn = new Set<number>()
      for (const ev of t.events) {
        const evMs = Date.parse(ev.date)
        const idx = t.weeks.findIndex((w, i) => {
          const start = Date.parse(w.week)
          const next = t.weeks[i + 1] ? Date.parse(t.weeks[i + 1].week) : start + 7 * dayMs
          return evMs >= start && evMs < next
        })
        if (idx < 0) continue
        const frac = (evMs - Date.parse(t.weeks[idx].week)) / (7 * dayMs)
        const x = Math.round(area.left + (idx + frac) * step) + 0.5
        if (drawn.has(x)) continue
        drawn.add(x)
        ctx.save()
        ctx.strokeStyle = CHART_COLORS.value.inkFaint
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(x, area.top)
        ctx.lineTo(x, area.bottom)
        ctx.stroke()
        ctx.restore()
      }
    },
  }
}

export function useGradeTrendChart(trend: Ref<GradeTrend | null>, agent: Ref<TrendAgent>, view: Ref<TrendView>) {
  const { t } = useI18n()

  const counts = computed(() => (trend.value?.weeks ?? []).map((w) => w.agents[agent.value]))
  const labels = computed(() => (trend.value?.weeks ?? []).map((w) => formatDate(w.week)))
  const totalOutputs = computed(() => counts.value.reduce((n, c) => n + c.outputs, 0))

  const outcomesData = computed(() => {
    const bands = [
      { key: 'approved_clean', label: t('learning.gradeTrend.bands.approvedClean'), color: CHART_COLORS.value.flagGood },
      { key: 'approved_with_notes', label: t('learning.gradeTrend.bands.approvedWithNotes'), color: CHART_COLORS.value.flagCaution },
      { key: 'flagged', label: t('learning.gradeTrend.bands.flagged'), color: CHART_COLORS.value.flagCritical },
      { key: 'no_review', label: t('learning.gradeTrend.bands.noReview'), color: CHART_COLORS.value.inkFaint },
    ] as const
    return {
      labels: labels.value,
      datasets: bands.map((b) => ({
        label: b.label,
        data: counts.value.map((c) => pct(c[b.key], c.outputs) ?? 0),
        rawCounts: counts.value.map((c) => c[b.key]),
        backgroundColor: b.color,
        stack: 'outcome',
      })),
    }
  })

  const qualityData = computed(() => {
    const lines = [
      { key: 'c_or_worse', label: t('learning.gradeTrend.lines.cOrWorse'), color: CHART_COLORS.value.flagCaution },
      { key: 'high_severity', label: t('learning.gradeTrend.lines.highSeverity'), color: CHART_COLORS.value.flagCritical },
    ] as const
    return {
      labels: labels.value,
      datasets: lines.map((l) => ({
        label: l.label,
        // Denominator is graded outputs only: no_review rows have no grade
        // to be "C or worse" in the first place.
        data: counts.value.map((c) => pct(c[l.key], c.outputs - c.no_review)),
        rawCounts: counts.value.map((c) => c[l.key]),
        borderColor: l.color,
        backgroundColor: l.color,
        pointBackgroundColor: l.color,
        pointRadius: 3,
        tension: 0.25,
        spanGaps: false,
      })),
    }
  })

  type TooltipCtx = { dataset: { label?: string; rawCounts?: number[] }; dataIndex: number; parsed: { y: number | null } }
  const tooltipLabel = (ctx: TooltipCtx) => {
    if (ctx.parsed.y === null) return `${ctx.dataset.label}: —`
    const n = ctx.dataset.rawCounts?.[ctx.dataIndex]
    return `${ctx.dataset.label}: ${formatPercent(ctx.parsed.y)}${n === undefined ? '' : ` (${n})`}`
  }

  function buildOptions(stacked: boolean) {
    const o = createBaseChartOptions()
    o.plugins!.legend!.display = true
    o.plugins!.legend!.labels = { color: () => CHART_COLORS.value.inkFaint, boxWidth: 10, font: { size: 11 } }
    o.plugins!.tooltip!.callbacks = { label: tooltipLabel as never }
    o.scales!.x!.offset = true
    o.scales!.y!.max = 100
    o.scales!.y!.ticks!.callback = (v: number | string) => formatPercent(Number(v), 0)
    if (stacked) {
      o.scales!.x!.stacked = true
      o.scales!.y!.stacked = true
    }
    return o
  }
  const outcomesOptions = buildOptions(true)
  const qualityOptions = buildOptions(false)

  const plugins = ref<Plugin[]>([eventMarkerPlugin(trend)])

  return { outcomesData, qualityData, outcomesOptions, qualityOptions, plugins, totalOutputs, view }
}
