<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../lib/api'
import { formatMicrosAsIDR, formatNumber, formatPercent, formatDate } from '../lib/format'
import MetricCard from '../components/MetricCard.vue'
import CampaignTable from '../components/CampaignTable.vue'
import ReportPanel from '../components/ReportPanel.vue'

const loading = ref(true)
const error = ref(null)
const performance = ref([])
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

onMounted(async () => {
  try {
    const [perf, report, health] = await Promise.all([
      api.performance(30),
      api.latestReport('daily'),
      api.systemHealth(),
    ])
    performance.value = perf
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

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div class="lg:col-span-3">
          <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
            Campaigns
          </h2>
          <CampaignTable :rows="campaignRows" />
        </div>
        <div class="lg:col-span-2">
          <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
            AI Report
          </h2>
          <ReportPanel :report="dailyReport" period="daily" />
        </div>
      </div>
    </template>
  </main>
</template>
