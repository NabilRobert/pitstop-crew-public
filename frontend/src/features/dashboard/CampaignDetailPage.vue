<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMicrosAsIDR, formatNumber, formatPercent } from '../../shared/utils/format'
import KeywordTable from './KeywordTable.vue'
import SearchTermTable from './SearchTermTable.vue'
import AdPerformanceTable from './AdPerformanceTable.vue'
import ImpressionShareChart from './ImpressionShareChart.vue'
import MetricCard from './MetricCard.vue'
import PeriodSelector from './PeriodSelector.vue'
import KeywordBoardPanel from '../keyword-optimizer/KeywordBoardPanel.vue'
import { useKeywordOptimizer } from '../keyword-optimizer/useKeywordOptimizer'
import { isDemo } from '../../shared/composables/auth'
import AssetGroupBarChart from './AssetGroupBarChart.vue'
import { useCampaignDetail } from './useCampaignDetail'
import { PERIOD_OPTIONS } from './useDashboard'

const props = defineProps({
  id: { type: [String, Number], required: true },
})

const { t } = useI18n()

// Same period buttons as the dashboard (1W ... 5Y), same 3-month default.
const days = ref(90)
const periodSubtitleKey = computed(
  () => PERIOD_OPTIONS.find((opt) => opt.days === days.value)?.subtitleKey ?? PERIOD_OPTIONS[2].subtitleKey
)

const {
  loading,
  error,
  campaignName,
  campaignSimulated,
  adGroupRows,
  keywordRows,
  searchTermRows,
  adRows,
  impressionShareRows,
  assetGroupRows,
  totals,
  keywordPerfRows,
  keywordSummaries,
} = useCampaignDetail(toRef(props, 'id'), days)

// Suggestions are shared with the Keyword Optimizer page (same data, same actions), scoped to this campaign.
const optimizer = useKeywordOptimizer()
const hasKeywords = computed(() => adGroupRows.value.length > 0)
const campaignIdNumber = computed(() => Number(props.id))

// Board is the default; the table is one click away. Remembered per browser; works without storage.
type KeywordView = 'board' | 'table'
const VIEW_KEY = 'pitstop-campaign-keyword-view'
function readView(): KeywordView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'board'
  } catch {
    return 'board'
  }
}
const keywordView = ref<KeywordView>(readView())
function setKeywordView(v: KeywordView) {
  keywordView.value = v
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // storage blocked: the choice just doesn't persist
  }
}

// Only the very first load replaces the page with a spinner. Changing the period refreshes in place
// (dimmed) so the page doesn't jump back to the top or lose what you were looking at.
const hasLoaded = ref(false)
watch(loading, (isLoading) => {
  if (!isLoading) hasLoaded.value = true
})
const costPerEnquiry = computed(() => (totals.value.conversions > 0 ? totals.value.cost_micros / totals.value.conversions : null))
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <router-link to="/" class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink">
      {{ t('campaignDetail.back') }}
    </router-link>

    <div v-if="loading && !hasLoaded" class="py-24 text-center text-ink-faint">{{ t('campaignDetail.loading') }}</div>

    <div
      v-else-if="error"
      class="mt-6 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical"
    >
      {{ t('campaignDetail.couldNotLoad', { error }) }}
    </div>

    <div v-else :class="{ 'opacity-60 transition-opacity': loading }" :aria-busy="loading">
      <div class="mb-6 mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span v-if="campaignSimulated" class="mb-1 mr-2 inline-block border border-border-strong bg-giallo px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-black" :title="t('campaignsList.card.simulatedHelp')">{{ t('campaignsList.card.simulated') }}</span>
          <h1 class="mb-1 font-display text-2xl font-bold text-ink">{{ campaignName }}</h1>
          <p class="font-mono text-xs text-ink-faint">{{ t('campaignDetail.subtitle', { period: t(periodSubtitleKey) }) }}</p>
        </div>
        <PeriodSelector v-model="days" />
      </div>

      <div class="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard :label="t('campaignDetail.scoreboard.spend')" :value="formatMicrosAsIDR(totals.cost_micros)" accent="rosso" />
        <MetricCard :label="t('campaignDetail.scoreboard.clicks')" :value="formatNumber(totals.clicks)" />
        <MetricCard :label="t('campaignDetail.scoreboard.enquiries')" :value="totals.conversions.toFixed(1)" accent="giallo" />
        <MetricCard :label="t('campaignDetail.scoreboard.costPer')" :value="costPerEnquiry === null ? '—' : formatMicrosAsIDR(costPerEnquiry)" />
      </div>

      <div v-if="impressionShareRows.length" class="mb-8">
        <ImpressionShareChart :rows="impressionShareRows" />
      </div>

      <div v-if="assetGroupRows.length" class="mb-8">
        <AssetGroupBarChart :rows="assetGroupRows" />
      </div>

      <section class="mb-10">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
            {{ t('campaignDetail.keywordsHeading') }}
          </h2>
          <div v-if="hasKeywords" class="flex items-center" role="group" :aria-label="t('campaignDetail.viewLabel')">
            <button
              type="button"
              class="border border-border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
              :class="keywordView === 'board' ? 'border-rosso bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
              :aria-pressed="keywordView === 'board'"
              @click="setKeywordView('board')"
            >
              {{ t('campaignDetail.viewBoard') }}
            </button>
            <button
              type="button"
              class="border border-l-0 border-border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
              :class="keywordView === 'table' ? 'border-rosso bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
              :aria-pressed="keywordView === 'table'"
              @click="setKeywordView('table')"
            >
              {{ t('campaignDetail.viewTable') }}
            </button>
          </div>
        </div>

        <!-- Performance Max and Display have no keywords in Google Ads: say so instead of showing an empty section. -->
        <p v-if="!hasKeywords" class="rounded-lg border border-border bg-surface px-5 py-4 text-sm text-ink-soft">
          {{ t('campaignDetail.noKeywordsType') }}
        </p>
        <KeywordTable v-else-if="keywordView === 'table'" :rows="keywordRows" />
        <KeywordBoardPanel
          v-else
          :rows="keywordPerfRows"
          :summaries="keywordSummaries"
          :suggestions="optimizer.items.value"
          :campaign-id="campaignIdNumber"
          :can-edit="!isDemo"
          :busy-ids="optimizer.busyIds.value"
          :no-run-yet="!optimizer.loading.value && !optimizer.data.value?.run && optimizer.items.value.length === 0"
          :summary-missing="keywordSummaries.length === 0 && keywordPerfRows.length > 0"
          :period-days="days"
          @status="(id, status) => optimizer.setStatus(id, status)"
        />
        <p v-if="hasKeywords && !keywordSummaries.some((m) => m.text)" class="mt-2 text-xs text-ink-faint">{{ t('campaignDetail.activityNote') }}</p>
      </section>

      <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        {{ t('campaignDetail.adGroupsHeading') }}
      </h2>
      <div class="mb-8 overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full min-w-max border-collapse text-left">
          <thead>
            <tr class="border-b border-border">
              <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                {{ t('campaignDetail.adGroupColumns.adGroup') }}
              </th>
              <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                {{ t('campaignDetail.adGroupColumns.impressions') }}
              </th>
              <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                {{ t('campaignDetail.adGroupColumns.clicks') }}
              </th>
              <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                {{ t('campaignDetail.adGroupColumns.ctr') }}
              </th>
              <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                {{ t('campaignDetail.adGroupColumns.cost') }}
              </th>
              <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                {{ t('campaignDetail.adGroupColumns.conversions') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in adGroupRows" :key="row.ad_group_id" class="border-b border-border/60 last:border-0 hover:bg-surface-raised">
              <td class="px-4 py-3 font-medium text-ink">{{ row.ad_group }}</td>
              <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.impressions) }}</td>
              <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.clicks) }}</td>
              <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatPercent(row.ctr) }}</td>
              <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatMicrosAsIDR(row.cost_micros) }}</td>
              <td class="px-4 py-3 text-right tabular-nums text-ink">{{ row.conversions.toFixed(1) }}</td>
            </tr>
            <tr v-if="!adGroupRows.length">
              <td colspan="6" class="px-4 py-8 text-center text-ink-faint">{{ t('campaignDetail.noAdGroups') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 class="mb-3 mt-8 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        {{ t('campaignDetail.searchTermsHeading') }}
      </h2>
      <SearchTermTable :rows="searchTermRows" />

      <h2 class="mb-3 mt-8 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        {{ t('campaignDetail.adsHeading') }}
      </h2>
      <AdPerformanceTable :rows="adRows" />
    </div>
  </main>
</template>
