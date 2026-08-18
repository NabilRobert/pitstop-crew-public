import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../shared/api/api'
import { formatDate } from '../../shared/utils/format'

export function useDashboard() {
  const { t } = useI18n()

  const loading = ref(true)
  const error = ref(null)
  const performance = ref([])
  const segmentPerformance = ref([])
  const dailyReport = ref({ analysis: null, recommendation: null, summary: null })
  const systemHealth = ref(null)

  const totals = computed(() => {
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

  const campaignRows = computed(() => {
    const byCampaign = new Map()
    for (const row of performance.value) {
      const key = row.campaign
      if (!byCampaign.has(key)) {
        byCampaign.set(key, { campaign: key, impressions: 0, clicks: 0, cost_micros: 0, conversions: 0 })
      }
      const agg = byCampaign.get(key)
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

  onMounted(async () => {
    try {
      const [perf, segPerf, report, health] = await Promise.all([
        api.performance(30),
        api.segmentPerformance(30),
        api.latestReport('daily'),
        api.systemHealth(),
      ])
      performance.value = perf
      segmentPerformance.value = segPerf
      dailyReport.value = report
      systemHealth.value = health
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  })

  return {
    loading,
    error,
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
