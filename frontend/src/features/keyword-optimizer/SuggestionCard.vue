<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Suggestion } from '../../shared/api/types'
import { formatDate, formatMicrosAsIDR } from '../../shared/utils/format'
import AdPreview from './AdPreview.vue'
import { openLaunch } from './useLaunchPanel'
import CampaignProposal from './CampaignProposal.vue'
import {
  suggestionTitle,
  evidenceRows,
  impactRows,
  hasNoAccountData,
  belowThreshold,
  formatIdr,
} from './suggestionView'

const props = defineProps<{
  suggestion: Suggestion
  /** Owner only. The demo account is read-only server-side, so the buttons are simply not offered. */
  canEdit: boolean
  busy: boolean
}>()
const emit = defineEmits<{ (e: 'status', status: 'open' | 'applied' | 'dismissed' | 'planned'): void }>()

const { t } = useI18n()

const title = computed(() => suggestionTitle(props.suggestion, t))
const evidence = computed(() => evidenceRows(props.suggestion, t))
const impact = computed(() => impactRows(props.suggestion, t))
const unverified = computed(() => props.suggestion.basis === 'prior')
const noAccountData = computed(() => hasNoAccountData(props.suggestion))
const lowEvidence = computed(() => belowThreshold(props.suggestion))
const payload = computed(() => props.suggestion.payload)
const where = computed(() =>
  [props.suggestion.campaign?.name, props.suggestion.ad_group?.name].filter(Boolean).join(' › ')
)
const isOpen = computed(() => props.suggestion.status === 'open')
const isPlanned = computed(() => props.suggestion.status === 'planned')
const proposal = computed(() => (props.suggestion.payload.kind === 'new_campaign' ? props.suggestion.payload : null))
const ad = computed(() => (props.suggestion.payload.kind === 'new_ad' ? props.suggestion.payload : null))
// An ad that belongs to a proposed campaign is created together with it, so it never gets its own 'I created it'.
const adWithCampaign = computed(() => ad.value?.target.kind === 'proposed_campaign')
// 'planned' is a valid status for campaign proposals and for ads.
const plannable = computed(() => !!proposal.value || !!ad.value)
</script>

<template>
  <article
    class="rounded-lg border border-border bg-surface p-5"
    :class="{ 'opacity-75': !isOpen }"
    :data-suggestion-id="suggestion.id"
  >
    <header class="mb-3 flex flex-wrap items-center gap-2">
      <span
        v-if="suggestion.rank !== null"
        class="rounded bg-surface-raised px-2 py-0.5 font-mono text-[11px] font-bold text-ink-soft"
        :title="t('keywordOptimizer.card.rankTooltip')"
      >
        #{{ suggestion.rank }}
      </span>
      <span class="rounded border border-border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-soft">
        {{ t(`keywordOptimizer.types.${suggestion.type}`) }}
      </span>
      <span
        class="rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
        :class="unverified ? 'border-flag-caution/40 bg-flag-caution-soft text-flag-caution' : 'border-flag-good/40 bg-flag-good-soft text-flag-good'"
        :title="unverified ? t('keywordOptimizer.card.unverifiedTooltip') : t('keywordOptimizer.card.evidenceTooltip')"
      >
        {{ unverified ? t('keywordOptimizer.card.unverified') : t('keywordOptimizer.card.backedByData') }}
      </span>
      <span class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        {{ t('keywordOptimizer.card.confidence', { level: t(`keywordOptimizer.confidence.${suggestion.confidence}`) }) }}
      </span>
      <span
        v-if="!isOpen"
        class="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-soft"
      >
        {{ isPlanned ? t('keywordOptimizer.proposal.plannedBadge') : t(`keywordOptimizer.filters.status.${suggestion.status}`) }}
      </span>
    </header>

    <h3 class="font-display text-lg font-bold text-ink">{{ title }}</h3>
    <p v-if="where" class="mt-1 font-mono text-[11px] text-ink-faint">{{ where }}</p>

    <CampaignProposal v-if="proposal" :suggestion="suggestion" :payload="proposal" />
    <AdPreview v-if="ad" :payload="ad" />

    <!-- Payload-specific detail. Everything is rendered as text, never as HTML:
         search-term text is untrusted input. -->
    <div v-if="payload.kind === 'negative_keyword' && payload.collisions.length" class="mt-3 rounded-md border border-flag-caution/40 bg-flag-caution-soft px-3 py-2 text-sm text-ink">
      <div class="font-mono text-[11px] font-bold uppercase tracking-wide text-flag-caution">
        {{ t('keywordOptimizer.card.collisionsTitle') }}
      </div>
      <ul class="mt-1 list-disc pl-5">
        <li v-for="c in payload.collisions" :key="c.search_term">
          {{ t('keywordOptimizer.card.collision', { term: c.search_term, n: c.conversions }) }}
        </li>
      </ul>
    </div>
    <p v-else-if="payload.kind === 'negative_keyword'" class="mt-3 text-sm text-ink-soft">
      {{ t('keywordOptimizer.card.noCollisions') }}
    </p>

    <p v-if="payload.kind === 'new_keyword'" class="mt-3 text-sm text-ink-soft">
      {{ t(`keywordOptimizer.card.newKeywordSource.${payload.source}`) }}
      <span v-if="payload.is_test" class="ml-1 font-mono text-[11px] font-bold uppercase text-ink-faint">
        · {{ t('keywordOptimizer.card.testSlice') }}
      </span>
    </p>
    <p v-if="payload.kind === 'raise_bid_candidate'" class="mt-3 text-sm text-ink-soft">
      {{ t('keywordOptimizer.card.bidInfo', {
        bid: payload.current_bid_micros === null ? t('keywordOptimizer.card.noBidData') : formatMicrosAsIDR(payload.current_bid_micros),
        lost: Math.round(payload.rank_lost_share * 100),
      }) }}
    </p>

    <!-- Evidence: structured numbers only. -->
    <p v-if="noAccountData" class="mt-3 text-sm italic text-ink-soft">{{ t('keywordOptimizer.card.noAccountData') }}</p>
    <p v-else-if="lowEvidence" class="mt-3 text-sm italic text-flag-caution">{{ t('keywordOptimizer.card.belowThreshold') }}</p>
    <dl v-if="evidence.length" class="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
      <div v-for="row in evidence" :key="row.label">
        <dt class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ row.label }}</dt>
        <dd class="font-display text-base font-bold tabular-nums text-ink">{{ row.value }}</dd>
      </div>
    </dl>
    <p v-if="evidence.length" class="mt-1 font-mono text-[10px] text-ink-faint">
      {{ t('keywordOptimizer.card.window', { from: formatDate(suggestion.evidence.window_start), to: formatDate(suggestion.evidence.window_end) }) }}
    </p>

    <dl v-if="impact.length" class="mt-3 flex flex-wrap gap-x-6 gap-y-1">
      <div v-for="row in impact" :key="row.label" class="flex items-baseline gap-2">
        <dt class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ row.label }}</dt>
        <dd class="font-display text-sm font-bold tabular-nums text-ink">{{ row.value }}</dd>
      </div>
    </dl>

    <!-- Inventory context; null means no stock link applies or inventory is unavailable. -->
    <div v-if="suggestion.inventory" class="mt-3 rounded-md bg-surface-raised px-3 py-2 text-sm text-ink-soft">
      <span v-if="suggestion.inventory.stock_count === 0" class="font-bold text-flag-critical">
        {{ t('keywordOptimizer.card.noStock') }}
      </span>
      <span v-else>{{ t('keywordOptimizer.card.inStock', { n: suggestion.inventory.stock_count }) }}</span>
      <span v-if="suggestion.inventory.avg_days_listed !== null">
        · {{ t('keywordOptimizer.card.daysListed', { n: Math.round(suggestion.inventory.avg_days_listed) }) }}
      </span>
      <span v-if="suggestion.inventory.avg_margin_idr !== null">
        · {{ t('keywordOptimizer.card.margin', { amount: formatIdr(suggestion.inventory.avg_margin_idr) }) }}
      </span>
      <span class="ml-1 font-mono text-[10px] text-ink-faint">
        · {{ t('keywordOptimizer.card.stockAsOf', { date: formatDate(suggestion.inventory.snapshot_on) }) }}
      </span>
    </div>

    <!-- The model's text. Numbers above come from the data, not from this. -->
    <div v-if="suggestion.explanation" class="mt-4 border-l-2 border-border-strong pl-3">
      <div class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        {{ t('keywordOptimizer.card.explanation') }}
      </div>
      <p class="mt-1 text-sm text-ink-soft">{{ suggestion.explanation }}</p>
    </div>

    <footer v-if="canEdit" class="mt-4 flex flex-wrap items-center gap-2">
      <template v-if="plannable && isOpen">
        <button
          type="button"
          class="rounded-md bg-rosso px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco hover:bg-rosso-dark disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="emit('status', 'planned')"
        >
          {{ t('keywordOptimizer.proposal.plan') }}
        </button>
        <button
          type="button"
          class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="emit('status', 'dismissed')"
        >
          {{ t('keywordOptimizer.card.dismiss') }}
        </button>
      </template>
      <template v-else-if="plannable && isPlanned">
        <p v-if="adWithCampaign" class="w-full text-sm text-ink-soft">{{ t('keywordOptimizer.ad.createdWithCampaign') }}</p>
        <button
          v-if="!adWithCampaign"
          type="button"
          class="rounded-md bg-rosso px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco hover:bg-rosso-dark"
          @click="openLaunch(suggestion.id)"
        >
          {{ t('keywordOptimizer.launch.reviewCreate') }}
        </button>
        <button
          v-if="!adWithCampaign"
          type="button"
          class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="emit('status', 'applied')"
        >
          {{ t('keywordOptimizer.proposal.iCreatedIt') }}
        </button>
        <button
          type="button"
          class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="emit('status', 'open')"
        >
          {{ t('keywordOptimizer.proposal.unplan') }}
        </button>
        <button
          type="button"
          class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="emit('status', 'dismissed')"
        >
          {{ t('keywordOptimizer.card.dismiss') }}
        </button>
      </template>
      <template v-else-if="isOpen">
        <button
          type="button"
          class="rounded-md bg-rosso px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco hover:bg-rosso-dark disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="emit('status', 'applied')"
        >
          {{ t('keywordOptimizer.card.markApplied') }}
        </button>
        <button
          type="button"
          class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="emit('status', 'dismissed')"
        >
          {{ t('keywordOptimizer.card.dismiss') }}
        </button>
      </template>
      <button
        v-else-if="suggestion.status !== 'superseded'"
        type="button"
        class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="busy"
        @click="emit('status', 'open')"
      >
        {{ t('keywordOptimizer.card.reopen') }}
      </button>
      <span v-if="suggestion.status_changed_at" class="font-mono text-[10px] text-ink-faint">
        {{ formatDate(suggestion.status_changed_at) }}
      </span>
    </footer>
  </article>
</template>
