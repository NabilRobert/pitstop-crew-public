<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMicrosAsIDR, formatNumber, formatPercent } from '../../shared/utils/format'
import MetricCard from './MetricCard.vue'
import CampaignTable from './CampaignTable.vue'
import StatusPill from '../../shared/components/StatusPill.vue'
import ReportTabs from '../../shared/report/ReportTabs.vue'
import ReportDrawer from '../../shared/report/ReportDrawer.vue'
import AskPanel from '../../shared/report/AskPanel.vue'
import WhyTrailPanel from '../../shared/report/WhyTrailPanel.vue'
import TrendChart from './TrendChart.vue'
import CampaignBarChart from './CampaignBarChart.vue'
import SegmentBreakdownChart from './SegmentBreakdownChart.vue'
import { useReportDrawer } from '../../shared/report/useReportDrawer'
import { useDashboard, PERIOD_OPTIONS } from './useDashboard'

const { t } = useI18n()
const {
  loading,
  error,
  days,
  performance,
  segmentPerformance,
  dailyReport,
  totals,
  ctr,
  campaignRows,
  lastRunLabel,
  latestReportLink,
} = useDashboard()

const activePeriodSubtitleKey = computed(
  () => PERIOD_OPTIONS.find((opt) => opt.days === days.value)?.subtitleKey ?? PERIOD_OPTIONS[1].subtitleKey
)

const showCampaignGlossary = ref(false)

const { activeDrawer, openDrawer, closeDrawer } = useReportDrawer()
const drawerTitle = () => (activeDrawer.value?.type === 'ask' ? t('askPanel.title') : t('reportSection.whyThis'))
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <div v-if="loading" class="py-24 text-center text-ink-faint">{{ t('dashboard.loading') }}</div>

    <div
      v-else-if="error"
      class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical"
    >
      {{ t('dashboard.couldNotReach', { error }) }}
    </div>

    <template v-else>
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="font-display text-2xl font-bold text-ink">{{ t('dashboard.title') }}</h1>
          <p class="mt-1 font-mono text-xs text-ink-faint">
            {{ t('dashboard.subtitle', { period: t(activePeriodSubtitleKey), lastRun: lastRunLabel }) }}
          </p>
        </div>
        <div class="flex gap-1 rounded-lg border border-border bg-surface p-1">
          <button
            v-for="opt in PERIOD_OPTIONS"
            :key="opt.days"
            type="button"
            class="rounded px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
            :class="days === opt.days ? 'bg-rosso text-bianco' : 'text-ink-faint hover:text-ink'"
            @click="days = opt.days"
          >
            {{ t(opt.labelKey) }}
          </button>
        </div>
      </div>

      <div class="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard :label="t('metrics.impressions')" :value="formatNumber(totals.impressions)" />
        <MetricCard :label="t('metrics.clicks')" :value="formatNumber(totals.clicks)" />
        <MetricCard :label="t('metrics.ctr')" :value="formatPercent(ctr)" accent="giallo" />
        <MetricCard :label="t('metrics.cost')" :value="formatMicrosAsIDR(totals.cost_micros)" accent="rosso" />
      </div>

      <div class="mb-8">
        <TrendChart :series="performance" />
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div class="lg:col-span-3 space-y-6">
          <CampaignBarChart :rows="campaignRows" />
          <div>
            <div class="mb-3 flex items-center justify-between">
              <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
                {{ t('dashboard.campaignsHeading') }}
              </h2>
              <button
                type="button"
                class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink"
                @click="showCampaignGlossary = !showCampaignGlossary"
              >
                {{ showCampaignGlossary ? t('dashboard.glossaryToggleHide') : t('dashboard.glossaryToggleShow') }}
              </button>
            </div>

            <div
              v-if="showCampaignGlossary"
              class="mb-4 grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2"
            >
              <div>
                <h3 class="mb-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                  {{ t('campaignGlossary.typesTitle') }}
                </h3>
                <p class="mb-2 text-xs text-ink-faint">{{ t('campaignGlossary.typesIntro') }}</p>
                <dl class="space-y-2 text-xs text-ink-soft">
                  <div>
                    <dt class="font-medium text-ink">Performance Max</dt>
                    <dd>{{ t('campaignGlossary.types.performanceMax') }}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-ink">Search</dt>
                    <dd>{{ t('campaignGlossary.types.search') }}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-ink">Display / Remarketing</dt>
                    <dd>{{ t('campaignGlossary.types.display') }}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-ink">Brand</dt>
                    <dd>{{ t('campaignGlossary.types.brand') }}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3 class="mb-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                  {{ t('campaignGlossary.metricsTitle') }}
                </h3>
                <dl class="space-y-2 text-xs text-ink-soft">
                  <div>
                    <dt class="font-medium text-ink">{{ t('campaignTable.columns.impressions') }}</dt>
                    <dd>{{ t('campaignTable.columnHelp.impressions') }}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-ink">{{ t('campaignTable.columns.clicks') }}</dt>
                    <dd>{{ t('campaignTable.columnHelp.clicks') }}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-ink">{{ t('campaignTable.columns.ctr') }}</dt>
                    <dd>{{ t('campaignTable.columnHelp.ctr') }}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-ink">{{ t('campaignTable.columns.cost') }}</dt>
                    <dd>{{ t('campaignTable.columnHelp.cost') }}</dd>
                  </div>
                  <div>
                    <dt class="font-medium text-ink">{{ t('campaignTable.columns.conversions') }}</dt>
                    <dd>{{ t('campaignTable.columnHelp.conversions') }}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <CampaignTable :rows="campaignRows" />
          </div>
        </div>
        <div class="lg:col-span-2">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
              {{ t('dashboard.aiReportHeading') }}
            </h2>
            <div class="flex items-center gap-3">
              <StatusPill v-if="dailyReport.summary" :status="dailyReport.summary.status" />
              <router-link
                v-if="latestReportLink"
                :to="latestReportLink"
                class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink"
              >
                {{ t('dashboard.viewFullReport') }}
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
