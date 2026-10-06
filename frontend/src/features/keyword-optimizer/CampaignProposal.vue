<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NewCampaignPayload, Suggestion } from '../../shared/api/types'
import { downloadBlob, safeFilename } from '../../shared/utils/download'
import { formatDate, formatMicrosAsIDR } from '../../shared/utils/format'
import { keywordOptimizerApi } from './keywordOptimizerApi'
import { formatIdr } from './suggestionView'

// The body of a new-campaign proposal (contract 3.3): why, the stock behind it, the ad groups and
// keywords, starter negatives, the budget with its assumptions, overlap warnings and the brief
// download. Everything shown is read from the payload; the model's explanation is shown elsewhere.
const props = defineProps<{ suggestion: Suggestion; payload: NewCampaignPayload }>()
const { t } = useI18n()

const busy = ref(false)
const message = ref<string | null>(null)

async function download(format: 'csv' | 'txt') {
  busy.value = true
  message.value = null
  try {
    const blob = await keywordOptimizerApi.exportBrief(props.suggestion.id, format)
    downloadBlob(blob, `${safeFilename(props.payload.name)}-brief.${format}`)
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="proposal mt-3 space-y-3">
    <p class="text-sm text-ink-soft">{{ t(`keywordOptimizer.proposal.basis.${payload.basis}`) }}</p>
    <p v-if="payload.theme" class="text-sm text-ink-soft">{{ t('keywordOptimizer.proposal.theme', { theme: payload.theme }) }}</p>

    <p class="text-sm text-ink">
      {{ t('keywordOptimizer.proposal.stock', { units: payload.stock.units }, payload.stock.units) }}
      <span v-if="payload.stock.avg_days_listed !== null"> · {{ t('keywordOptimizer.card.daysListed', { n: Math.round(payload.stock.avg_days_listed) }) }}</span>
      <span v-if="payload.stock.avg_margin_idr !== null"> · {{ t('keywordOptimizer.card.margin', { amount: formatIdr(payload.stock.avg_margin_idr) }) }}</span>
      <span v-if="payload.stock.total_value_idr !== null"> · {{ t('keywordOptimizer.proposal.value', { amount: formatIdr(payload.stock.total_value_idr) }) }}</span>
      <span class="ml-1 font-mono text-[10px] text-ink-faint">· {{ t('keywordOptimizer.card.stockAsOf', { date: formatDate(payload.stock.snapshot_on) }) }}</span>
    </p>

    <div v-if="payload.overlaps.length" class="rounded-md border border-flag-caution/40 bg-flag-caution-soft px-3 py-2 text-sm text-ink">
      <div class="font-mono text-[11px] font-bold uppercase tracking-wide text-flag-caution">{{ t('keywordOptimizer.proposal.overlapsTitle') }}</div>
      <ul class="mt-1 list-disc pl-5">
        <li v-for="o in payload.overlaps" :key="o.campaign_id">
          {{ t('keywordOptimizer.proposal.overlap', { name: o.name, n: o.shared_keywords }, o.shared_keywords) }}
        </li>
      </ul>
    </div>

    <section>
      <h4 class="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        {{ t('keywordOptimizer.proposal.adGroups', { n: payload.ad_groups.length }) }}
      </h4>
      <ul class="space-y-2">
        <li v-for="g in payload.ad_groups" :key="g.name" class="border border-border bg-surface-raised px-3 py-2">
          <div class="text-sm font-bold text-ink">{{ g.name }}</div>
          <ul class="mt-1 flex flex-wrap gap-1.5">
            <li v-for="k in g.keywords" :key="k.text + k.match_type" class="border border-border bg-surface px-1.5 py-0.5 text-xs text-ink">
              {{ k.text }}
              <span class="font-mono text-[9px] uppercase text-ink-faint">{{ t(`keywordOptimizer.match.${k.match_type}`) }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section v-if="payload.starter_negatives.length">
      <h4 class="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.proposal.negatives') }}</h4>
      <ul class="flex flex-wrap gap-1.5">
        <li v-for="n in payload.starter_negatives" :key="n.text + n.match_type" class="border border-border bg-surface px-1.5 py-0.5 text-xs text-ink">
          {{ n.text }}
          <span class="font-mono text-[9px] uppercase text-ink-faint">{{ t(`keywordOptimizer.match.${n.match_type}`) }}</span>
        </li>
      </ul>
    </section>

    <section>
      <dl class="grid grid-cols-2 gap-x-6 gap-y-2">
        <div>
          <dt class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.proposal.dailyBudget') }}</dt>
          <dd class="font-display text-base font-bold tabular-nums text-ink">{{ formatMicrosAsIDR(payload.budget.daily_micros) }}</dd>
        </div>
        <div>
          <dt class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.proposal.targetCost') }}</dt>
          <!-- null = no margin data to derive it from: say so, never show 0. -->
          <dd v-if="payload.budget.target_cpa_micros !== null" class="font-display text-base font-bold tabular-nums text-ink">{{ formatMicrosAsIDR(payload.budget.target_cpa_micros) }}</dd>
          <dd v-else class="text-sm text-ink-faint">{{ t('keywordOptimizer.proposal.noTargetCost') }}</dd>
        </div>
      </dl>
      <p class="mt-1 text-xs text-ink-faint">
        {{ t('keywordOptimizer.proposal.assumptions', {
          share: Math.round(payload.budget.assumptions.allowed_spend_share * 100),
          rate: Math.round(payload.budget.assumptions.lead_to_sale_rate * 100),
        }) }}
      </p>
    </section>

    <p v-if="suggestion.linked_campaign" class="text-sm font-bold text-flag-good">
      {{ t('keywordOptimizer.proposal.linked', { name: suggestion.linked_campaign.name }) }}
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="busy"
        @click="download('csv')"
      >
        {{ t('keywordOptimizer.proposal.briefCsv') }}
      </button>
      <button
        type="button"
        class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="busy"
        @click="download('txt')"
      >
        {{ t('keywordOptimizer.proposal.briefTxt') }}
      </button>
      <span v-if="message" class="text-sm text-flag-critical" role="alert">{{ message }}</span>
    </div>
    <p class="text-xs text-ink-faint">{{ t('keywordOptimizer.proposal.notCreatedNote') }}</p>
  </div>
</template>
