<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMicrosAsIDR, formatNumber } from '../../shared/utils/format'
import type { CampaignRollup } from '../keyword-optimizer/boardModel'
import { LEGEND_ORDER, VERDICT_STYLE } from '../keyword-optimizer/verdict'
import type { CampaignRow } from './useDashboard'

const props = defineProps<{
  row: CampaignRow
  /** null when the campaign link is unknown (the campaigns call and the performance rows disagree). */
  campaignId: number | null
  rollup: CampaignRollup | null
  /** Contract 3.6: created by a simulated launch; it does not exist in Google Ads. */
  simulated?: boolean
  /** False when the keyword calls failed, so a missing roll-up means "unknown", not "no keywords". */
  keywordInfoAvailable: boolean
}>()
const emit = defineEmits<{ (e: 'open-keyword', keywordId: number): void }>()
const { t } = useI18n()

const costPerEnquiry = computed(() => (props.row.conversions > 0 ? props.row.cost_micros / props.row.conversions : null))
const verdictChips = computed(() =>
  props.rollup ? LEGEND_ORDER.map((v) => ({ v, n: props.rollup!.verdicts[v] })).filter((c) => c.n > 0) : []
)
// The campaign's own keywords, written out: the first few always, the rest one click away.
const SHOWN = 6
const expanded = ref(false)
const listed = computed(() => (props.rollup ? (expanded.value ? props.rollup.keywordList : props.rollup.keywordList.slice(0, SHOWN)) : []))
const moreCount = computed(() => (props.rollup ? Math.max(0, props.rollup.keywordList.length - SHOWN) : 0))
const steady = computed(() => (props.rollup ? props.rollup.verdicts.steady : 0))
</script>

<template>
  <article class="rounded-lg border border-border bg-surface p-5">
    <span
      v-if="simulated"
      class="mb-2 inline-block border border-border-strong bg-giallo px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-black"
      :title="t('campaignsList.card.simulatedHelp')"
    >
      {{ t('campaignsList.card.simulated') }}
    </span>
    <h2 class="font-display text-lg font-bold leading-tight text-ink">
      <router-link v-if="campaignId !== null" :to="`/campaigns/${campaignId}`" class="hover:underline">{{ row.campaign }}</router-link>
      <template v-else>{{ row.campaign }}</template>
    </h2>

    <p v-if="row.noData" class="mt-3 text-sm text-ink-soft">{{ t('campaignsList.card.noData') }}</p>
    <dl v-else class="mt-3 flex flex-wrap gap-x-6 gap-y-3">
      <div>
        <dt class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('campaignDetail.scoreboard.spend') }}</dt>
        <dd class="font-display text-base font-bold tabular-nums text-ink">{{ formatMicrosAsIDR(row.cost_micros) }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('campaignDetail.scoreboard.enquiries') }}</dt>
        <dd class="font-display text-base font-bold tabular-nums text-ink">{{ row.conversions.toFixed(1) }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('campaignDetail.scoreboard.costPer') }}</dt>
        <dd class="font-display text-base font-bold tabular-nums text-ink">{{ costPerEnquiry === null ? '—' : formatMicrosAsIDR(costPerEnquiry) }}</dd>
      </div>
    </dl>
    <p v-if="!row.noData" class="mt-1 font-mono text-[11px] text-ink-faint">
      {{ t('campaignsList.card.clicks', { n: formatNumber(row.clicks) }) }}
    </p>

    <!-- Keyword line: only when the keyword calls worked. "No keywords" only when we KNOW there are none. -->
    <div class="mt-4 border-t border-border pt-3">
      <p v-if="!keywordInfoAvailable" class="text-sm text-ink-faint">{{ t('campaignsList.card.keywordsUnavailable') }}</p>
      <p v-else-if="!rollup" class="text-sm text-ink-soft">{{ simulated ? t('campaignsList.card.simulatedNoKeywords') : t('campaignsList.card.noKeywords') }}</p>
      <template v-else>
        <p class="text-sm text-ink-soft">{{ t('campaignsList.card.keywords', { n: rollup.keywords }, rollup.keywords) }}</p>
        <ul class="mt-2 flex flex-wrap gap-1.5">
          <li
            v-for="c in verdictChips"
            :key="c.v"
            class="border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase"
            :style="{ background: VERDICT_STYLE[c.v].sticker, color: VERDICT_STYLE[c.v].stickerInk, borderColor: '#000' }"
          >
            {{ c.n }} {{ t(`keywordOptimizer.board.verdict.${c.v}`) }}
          </li>
          <li v-if="steady > 0" class="border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-ink-soft">
            {{ steady }} {{ t('keywordOptimizer.board.verdict.steady') }}
          </li>
        </ul>
        <ul v-if="listed.length" class="mt-3 flex flex-wrap gap-1.5" :class="{ 'max-h-40 overflow-y-auto': expanded }" :aria-label="t('campaignsList.card.keywordList')">
          <li v-for="k in listed" :key="k.keywordId">
            <button
              type="button"
              class="border px-1.5 py-0.5 text-left text-xs hover:border-ink focus-visible:outline focus-visible:outline-2"
              :class="k.status === 'paused' ? 'border-dashed border-border-strong text-ink-faint' : 'border-border text-ink'"
              :aria-label="t('campaignsList.card.openKeyword', { keyword: k.text })"
              @click="emit('open-keyword', k.keywordId)"
            >
              {{ k.text }}
              <span v-if="k.status === 'paused'" class="font-mono text-[9px] font-bold uppercase">{{ t('keywordOptimizer.board.note.paused') }}</span>
            </button>
          </li>
        </ul>
        <button
          v-if="moreCount > 0"
          type="button"
          class="mt-1 font-mono text-[11px] font-bold uppercase tracking-wide text-link underline"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? t('campaignsList.card.showFewer') : t('campaignsList.card.showAllKeywords', { n: rollup.keywordList.length }) }}
        </button>
        <p class="mt-2 text-sm" :class="rollup.openSuggestions > 0 ? 'font-bold text-ink' : 'text-ink-faint'">
          {{ rollup.openSuggestions > 0 ? t('campaignsList.card.waiting', { n: rollup.openSuggestions }, rollup.openSuggestions) : t('campaignsList.card.nothingWaiting') }}
        </p>
      </template>
    </div>

    <router-link
      v-if="campaignId !== null"
      :to="`/campaigns/${campaignId}`"
      class="mt-4 inline-block font-mono text-[11px] font-bold uppercase tracking-wide text-link underline"
    >
      {{ t('campaignsList.card.open') }}
    </router-link>
  </article>
</template>
