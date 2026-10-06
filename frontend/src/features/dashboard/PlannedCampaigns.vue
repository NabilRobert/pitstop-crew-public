<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { NewCampaignPayload, Suggestion } from '../../shared/api/types'
import { formatMicrosAsIDR } from '../../shared/utils/format'

// Campaigns the owner approved but that do not exist in Google Ads yet (contract 3.3). They are
// visibly NOT campaigns: Pitstop cannot create them yet, so each card is a plan plus a brief to
// take to Google Ads. When the server links one to the real campaign, it leaves this lane.
defineProps<{ items: Suggestion[]; canEdit: boolean; busyIds: Set<number> }>()
const emit = defineEmits<{
  (e: 'open', s: Suggestion): void
  (e: 'created', s: Suggestion): void
}>()
const { t } = useI18n()

const payloadOf = (s: Suggestion) => s.payload as NewCampaignPayload
const keywordCount = (p: NewCampaignPayload) => p.ad_groups.reduce((n, g) => n + g.keywords.length, 0)
</script>

<template>
  <section class="mb-8" :aria-label="t('campaignsList.planned.title')">
    <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('campaignsList.planned.title') }}</h2>
    <p class="mb-3 mt-1 max-w-3xl text-sm text-ink-soft">{{ t('campaignsList.planned.hint') }}</p>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="s in items"
        :key="s.id"
        class="border-2 border-dashed border-border-strong bg-surface p-5"
      >
        <span class="inline-block border border-border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-soft">
          {{ t('keywordOptimizer.proposal.plannedBadge') }}
        </span>
        <h3 class="mt-2 font-display text-lg font-bold leading-tight text-ink">{{ payloadOf(s).name }}</h3>
        <p class="mt-1 text-sm text-ink-soft">{{ t(`keywordOptimizer.proposal.basis.${payloadOf(s).basis}`) }}</p>
        <p class="mt-2 text-sm text-ink">
          {{ t('campaignsList.planned.summary', {
            groups: payloadOf(s).ad_groups.length,
            keywords: keywordCount(payloadOf(s)),
            budget: formatMicrosAsIDR(payloadOf(s).budget.daily_micros),
          }) }}
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink"
            @click="emit('open', s)"
          >
            {{ t('campaignsList.planned.viewBrief') }}
          </button>
          <button
            v-if="canEdit"
            type="button"
            class="rounded-md bg-rosso px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco hover:bg-rosso-dark disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="busyIds.has(s.id)"
            @click="emit('created', s)"
          >
            {{ t('keywordOptimizer.proposal.iCreatedIt') }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
