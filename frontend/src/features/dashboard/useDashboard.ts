import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../shared/api/api'
import { formatDate } from '../../shared/utils/format'
import type { Campaign, PerformanceRow, SegmentPerformanceRow, Report, SystemHealth } from '../../shared/api/types'

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

// labelKey is the short button label ("3M"); subtitleKey is the fuller
// phrase used in the page subtitle ("Last 3 months") — each gets its own
// wording rather than deriving it from the raw day count, since "Last
// 1825 days" reads oddly for the longer options.
export const PERIOD_OPTIONS = [
  { days: 7, labelKey: 'dashboard.period1w', subtitleKey: 'dashboard.period1wSubtitle' },
  { days: 30, labelKey: 'dashboard.period1m', subtitleKey: 'dashboard.period1mSubtitle' },
  { days: 90, labelKey: 'dashboard.period3m', subtitleKey: 'dashboard.period3mSubtitle' },
  { days: 180, labelKey: 'dashboard.period6m', subtitleKey: 'dashboard.period6mSubtitle' },
  { days: 365, labelKey: 'dashboard.period1y', subtitleKey: 'dashboard.period1ySubtitle' },
  { days: 730, labelKey: 'dashboard.period2y', subtitleKey: 'dashboard.period2ySubtitle' },
  { days: 1825, labelKey: 'dashboard.period5y', subtitleKey: 'dashboard.period5ySubtitle' },
] as const

const DEFAULT_PERIOD_DAYS = 90 // 3 months

export function useDashboard() {
  const { t } = useI18n()

  const loading = ref(true)
  const error = ref<string | null>(null)
  const days = ref<number>(DEFAULT_PERIOD_DAYS)
  const performance = ref<PerformanceRow[]>([])
  const segmentPerformance = ref<SegmentPerformanceRow[]>([])
  const dailyReport = ref<Report>({ analysis: null, recommendation: null, summary: null })
  const systemHealth = ref<SystemHealth | null>(null)
  // Not period-scoped (campaign identity doesn't change with the date
  // range) — fetched once on mount, used to build campaign drill-down
  // links (CampaignTable.vue) since PerformanceRow only carries the
  // campaign's name, not its id.
  const campaigns = ref<Campaign[]>([])

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

  // v2 Stage 4 — impression share + optimization score. "Blended" per
  // Google Ads' own usage of the term: an impressions-weighted average
  // across whichever campaigns report each metric (Search-type only for
  // impression share; see PerformanceRow), not a plain average — a
  // bigger campaign's number should count for more. Rows from PMax/
  // Display (null values) are excluded from both, not treated as 0.
  function blendedShare(rows: PerformanceRow[], pick: (r: PerformanceRow) => number | null): number | null {
    let weightedSum = 0
    let weight = 0
    for (const r of rows) {
      const value = pick(r)
      if (value === null) continue
      weightedSum += value * r.impressions
      weight += r.impressions
    }
    return weight ? weightedSum / weight : null
  }

  const blendedImpressionShare = computed(() => blendedShare(performance.value, (r) => r.search_impression_share))
  const blendedOptimizationScore = computed(() => blendedShare(performance.value, (r) => r.optimization_score))

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
      const [, report, health, campaignList] = await Promise.all([
        loadPerformance(),
        api.latestReport('daily'),
        api.systemHealth(),
        api.campaigns(),
      ])
      dailyReport.value = report
      systemHealth.value = health
      campaigns.value = campaignList
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
    campaigns,
    totals,
    ctr,
    blendedImpressionShare,
    blendedOptimizationScore,
    campaignRows,
    lastRunLabel,
    latestReportLink,
  }
}
