<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../lib/api'
import { formatMicrosAsIDR, formatNumber, formatPercent, formatDate } from '../lib/format'
import MetricCard from '../components/MetricCard.vue'
import CampaignTable from '../components/CampaignTable.vue'
import StatusPill from '../components/StatusPill.vue'
import ReportTabs from '../components/ReportTabs.vue'
import ReportDrawer from '../components/ReportDrawer.vue'
import AskPanel from '../components/AskPanel.vue'
import WhyTrailPanel from '../components/WhyTrailPanel.vue'
import TrendChart from '../components/TrendChart.vue'
import CampaignBarChart from '../components/CampaignBarChart.vue'
import SegmentBreakdownChart from '../components/SegmentBreakdownChart.vue'
import { useReportDrawer } from '../lib/useReportDrawer'

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

const ctr = computed(() =>
  totals.value.impressions ? (totals.value.clicks / totals.value.impressions) * 100 : 0
)

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
  return run ? formatDate(run.finished_at) : 'never'
})

const latestReportLink = computed(() => {
  const date = dailyReport.value?.summary?.report_date
  return date ? `/reports/daily/${date}` : null
})

const { activeDrawer, openDrawer, closeDrawer } = useReportDrawer()
const drawerTitle = () => (activeDrawer.value?.type === 'ask' ? 'Ask about this report' : 'Why this?')

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
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <div v-if="loading" class="py-24 text-center text-ink-faint">Loading telemetry…</div>

    <div
      v-else-if="error"
      class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical"
    >
      Couldn't reach the backend: {{ error }}
    </div>

    <template v-else>
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="font-display text-2xl font-bold text-ink">Account Performance</h1>
          <p class="mt-1 font-mono text-xs text-ink-faint">Last 30 days · last pipeline run: {{ lastRunLabel }}</p>
        </div>
      </div>

      <div class="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Impressions" :value="formatNumber(totals.impressions)" />
        <MetricCard label="Clicks" :value="formatNumber(totals.clicks)" />
        <MetricCard label="CTR" :value="formatPercent(ctr)" accent="giallo" />
        <MetricCard label="Cost" :value="formatMicrosAsIDR(totals.cost_micros)" accent="rosso" />
      </div>

      <div class="mb-8">
        <TrendChart :series="performance" />
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div class="lg:col-span-3 space-y-6">
          <CampaignBarChart :rows="campaignRows" />
          <div>
            <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
              Campaigns
            </h2>
            <CampaignTable :rows="campaignRows" />
          </div>
        </div>
        <div class="lg:col-span-2">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
              AI Report
            </h2>
            <div class="flex items-center gap-3">
              <StatusPill v-if="dailyReport.summary" :status="dailyReport.summary.status" />
              <router-link
                v-if="latestReportLink"
                :to="latestReportLink"
                class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink"
              >
                View full report →
              </router-link>
            </div>
          </div>
          <ReportTabs
            :report="dailyReport"
            default-tab="summary"
            @ask="openDrawer('ask', $event)"
            @why-trail="openDrawer('why-trail', $event)"
          />
        </div>
      </div>

      <div class="mt-8">
        <SegmentBreakdownChart :rows="segmentPerformance" />
      </div>

      <ReportDrawer :open="!!activeDrawer" :title="drawerTitle()" @close="closeDrawer">
        <WhyTrailPanel v-if="activeDrawer?.type === 'why-trail'" :key="activeDrawer.outputId" :output-id="activeDrawer.outputId" />
        <AskPanel v-else-if="activeDrawer?.type === 'ask'" :key="activeDrawer.outputId" :output-id="activeDrawer.outputId" />
      </ReportDrawer>
    </template>
  </main>
</template>
