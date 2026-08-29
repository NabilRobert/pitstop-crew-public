<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import CampaignTable from './CampaignTable.vue'
import { useCampaignsList } from './useCampaignsList'

const { t } = useI18n()

const { loading, error, campaigns, campaignRows } = useCampaignsList()
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <h1 class="mb-1 font-display text-2xl font-bold text-ink">{{ t('campaignsList.title') }}</h1>
    <p class="mb-8 font-mono text-xs text-ink-faint">{{ t('campaignsList.subtitle') }}</p>

    <div v-if="loading" class="py-24 text-center text-ink-faint">{{ t('campaignsList.loading') }}</div>

    <div
      v-else-if="error"
      class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical"
    >
      {{ t('common.couldNotReachBackend', { error }) }}
    </div>

    <CampaignTable v-else :rows="campaignRows" :campaigns="campaigns" />
  </main>
</template>
