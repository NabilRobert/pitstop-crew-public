import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../shared/api/api'
import { formatDate } from '../../shared/utils/format'
import type { PerformanceRow, SegmentPerformanceRow, Report, SystemHealth } from '../../shared/api/types'

interface Totals {
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
}

export interface CampaignRow extends Totals {
  campaign: string
  ctr: number
}

// labelKey is the short button label ("7D"); subtitleKey is the fuller
// phrase used in the page subtitle ("Last 7 days") — "Last 1825 days"
// reads oddly for the 5-year option, so that one gets its own phrasing
// ("Last 5 years") rather than deriving it from the raw day count.
export const PERIOD_OPTIONS = [
  { days: 7, labelKey: 'dashboard.period7d', subtitleKey: 'dashboard.period7dSubtitle' },
  { days: 30, labelKey: 'dashboard.period30d', subtitleKey: 'dashboard.period30dSubtitle' },
  { days: 90, labelKey: 'dashboard.period90d', subtitleKey: 'dashboard.period90dSubtitle' },
  { days: 1825, labelKey: 'dashboard.period5y', subtitleKey: 'dashboard.period5ySubtitle' },
] as const

export function useDashboard() {
  const { t } = useI18n()

  const loading = ref(true)
  const error = ref<string | null>(null)
  const days = ref(30)
  const performance = ref<PerformanceRow[]>([])
  const segmentPerformance = ref<SegmentPerformanceRow[]>([])
  const dailyReport = ref<Report>({ analysis: null, recommendation: null, summary: null })
  const systemHealth = ref<SystemHealth | null>(null)

  const totals = computed<Totals>(() => {
    return performance.value.reduce(
      (acc, row) => {
        acc.impressions += row.impressions
        acc.clicks += row.clicks
        acc.cost_micros += row.cost_micros
        acc.conversions += row.conversions
        return acc
      },
      { impressions: 0, clicks: 0, cost_micros: 0, conversions: 0 }
    )
  })

  const ctr = computed(() => (totals.value.impressions ? (totals.value.clicks / totals.value.impressions) * 100 : 0))

  const campaignRows = computed<CampaignRow[]>(() => {
    const byCampaign = new Map<string, Totals & { campaign: string }>()
    for (const row of performance.value) {
      const key = row.campaign
      if (!byCampaign.has(key)) {
        byCampaign.set(key, { campaign: key, impressions: 0, clicks: 0, cost_micros: 0, conversions: 0 })
      }
      const agg = byCampaign.get(key)!
      agg.impressions += row.impressions
      agg.clicks += row.clicks
      agg.cost_micros += row.cost_micros
      agg.conversions += row.conversions
    }
    return Array.from(byCampaign.values())
      .map((c) => ({ ...c, ctr: c.impressions ? (c.clicks / c.impressions) * 100 : 0 }))
      .sort((a, b) => b.cost_micros - a.cost_micros)
  })

  const lastRunLabel = computed(() => {
    const run = systemHealth.value?.last_successful_daily_run
    return run ? formatDate(run.finished_at) : t('dashboard.never')
  })

  const latestReportLink = computed(() => {
    const id = dailyReport.value?.summary?.id
    return id ? `/reports/daily/${id}` : null
  })

  // dailyReport/systemHealth aren't period-scoped (a report, a health
  // snapshot) — only performance/segmentPerformance need refetching when
  // the selected period changes.
  async function loadPerformance() {
    const [perf, segPerf] = await Promise.all([api.performance(days.value), api.segmentPerformance(days.value)])
    performance.value = perf
    segmentPerformance.value = segPerf
  }

  watch(days, () => {
    loadPerformance().catch((e) => {
      error.value = e instanceof Error ? e.message : String(e)
    })
  })

  onMounted(async () => {
    try {
      const [, report, health] = await Promise.all([loadPerformance(), api.latestReport('daily'), api.systemHealth()])
      dailyReport.value = report
      systemHealth.value = health
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  })

  return {
    loading,
    error,
    days,
    performance,
    segmentPerformance,
    dailyReport,
    systemHealth,
    totals,
    ctr,
    campaignRows,
    lastRunLabel,
    latestReportLink,
  }
}
