<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CampaignCard from './CampaignCard.vue'
import ProposalsSection from '../keyword-optimizer/ProposalsSection.vue'
import { keywordOptimizerApi } from '../keyword-optimizer/keywordOptimizerApi'
import { isDemo } from '../../shared/composables/auth'
import PeriodSelector from './PeriodSelector.vue'
import { PERIOD_OPTIONS } from './useDashboard'
import { useCampaignsList } from './useCampaignsList'

const { t } = useI18n()

// Same period buttons and 3-month default as the dashboard and each campaign's page.
const days = ref(90)
const periodSubtitleKey = computed(
  () => PERIOD_OPTIONS.find((opt) => opt.days === days.value)?.subtitleKey ?? PERIOD_OPTIONS[2].subtitleKey
)

const { loading, error, campaigns, campaignRows, rollups, keywordInfoAvailable, suggestions, reload } = useCampaignsList(days)
const idByName = computed(() => new Map(campaigns.value.map((c) => [c.name, c.id])))

// --- campaign proposals (contract 3.3): the lanes and their detail panel live in ProposalsSection ---
const canEdit = computed(() => !isDemo.value)
const busyIds = ref<Set<number>>(new Set())
const actionError = ref<string | null>(null)

async function setStatus(id: number, status: 'open' | 'applied' | 'dismissed' | 'planned') {
  if (busyIds.value.has(id)) return
  busyIds.value = new Set(busyIds.value).add(id)
  actionError.value = null
  try {
    await keywordOptimizerApi.setStatus(id, status)
    await reload()
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e)
  } finally {
    const next = new Set(busyIds.value)
    next.delete(id)
    busyIds.value = next
  }
}

// Only the very first load shows a spinner; changing the period refreshes in place.
const hasLoaded = ref(false)
watch(loading, (isLoading) => {
  if (!isLoading) hasLoaded.value = true
})
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="mb-1 font-display text-2xl font-bold text-ink">{{ t('campaignsList.title') }}</h1>
        <p class="font-mono text-xs text-ink-faint">{{ t('campaignsList.subtitle', { period: t(periodSubtitleKey) }) }}</p>
      </div>
      <PeriodSelector v-model="days" />
    </div>

    <p v-if="actionError" class="mb-4 rounded-md border border-flag-critical/40 bg-flag-critical-soft px-3 py-2 text-sm text-flag-critical" role="alert">{{ actionError }}</p>

    <div v-if="loading && !hasLoaded" class="py-24 text-center text-ink-faint">{{ t('campaignsList.loading') }}</div>

    <div
      v-else-if="error"
      class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical"
    >
      {{ t('common.couldNotReachBackend', { error }) }}
    </div>

    <template v-else>
      <!-- The AI's whole-campaign ideas come first, in their own lanes, clearly not real campaigns yet. -->
      <ProposalsSection :suggestions="suggestions" :can-edit="canEdit" :busy-ids="busyIds" @status="(id, status) => setStatus(id, status)" />

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" :class="{ 'opacity-60 transition-opacity': loading }" :aria-busy="loading">
      <CampaignCard
        v-for="row in campaignRows"
        :key="row.campaign"
        :row="row"
        :campaign-id="idByName.get(row.campaign) ?? null"
        :rollup="rollups.get(idByName.get(row.campaign) ?? -1) ?? null"
        :keyword-info-available="keywordInfoAvailable"
      />
    </div>
    </template>

  </main>
</template>
