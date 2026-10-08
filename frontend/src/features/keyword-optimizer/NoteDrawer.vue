<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Suggestion } from '../../shared/api/types'
import { formatMicrosAsIDR, formatNumber } from '../../shared/utils/format'
import type { BoardNote } from './boardModel'
import { costPerConversionMicros } from './boardModel'
import IntentMixBar from './IntentMixBar.vue'
import SuggestionCard from './SuggestionCard.vue'
import { STICKERED, VERDICT_STYLE } from './verdict'

const props = defineProps<{
  /** The keyword whose note was opened, or null when a loose idea (no keyword) was opened. */
  note: BoardNote | null
  suggestions: Suggestion[]
  canEdit: boolean
  busyIds: Set<number>
  /** Show a link to the keyword's own campaign page (off where that page is already the one being viewed). */
  campaignLink?: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'status', id: number, status: 'open' | 'applied' | 'dismissed' | 'planned'): void
}>()

const { t } = useI18n()
const closeButton = ref<HTMLButtonElement | null>(null)
const previouslyFocused = ref<HTMLElement | null>(null)

const cpa = computed(() => (props.note ? costPerConversionMicros(props.note) : null))
const verdict = computed(() => props.note?.verdict ?? null)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(async () => {
  previouslyFocused.value = document.activeElement as HTMLElement | null
  document.addEventListener('keydown', onKey)
  await nextTick()
  closeButton.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  previouslyFocused.value?.focus?.()
})
</script>

<template>
  <div class="drawer-backdrop" @click.self="emit('close')">
    <aside
      class="drawer"
      role="dialog"
      aria-modal="true"
      :aria-label="note ? note.text : t('keywordOptimizer.board.drawer.ideaTitle')"
    >
      <header class="drawer__head">
        <div>
          <h2 class="drawer__title">{{ note ? note.text : t('keywordOptimizer.board.drawer.ideaTitle') }}</h2>
          <p v-if="note" class="drawer__where">
            {{ t(`keywordOptimizer.match.${note.matchType}`) }} · {{ note.campaign.name }} › {{ note.adGroup }}
          </p>
          <router-link
            v-if="note && campaignLink"
            :to="`/campaigns/${note.campaign.id}`"
            class="mt-2 inline-block font-mono text-[11px] font-bold uppercase tracking-wide text-link underline"
          >
            {{ t('keywordOptimizer.board.drawer.openCampaign') }}
          </router-link>
        </div>
        <button ref="closeButton" type="button" class="drawer__close" @click="emit('close')">
          {{ t('keywordOptimizer.board.drawer.close') }}
        </button>
      </header>

      <template v-if="note">
        <p v-if="note.status === 'paused'" class="drawer__paused">{{ t('keywordOptimizer.board.drawer.paused') }}</p>
        <div v-if="verdict" class="drawer__verdict">
          <span
            v-if="STICKERED.includes(verdict)"
            class="drawer__sticker"
            :style="{ background: VERDICT_STYLE[verdict].sticker, color: VERDICT_STYLE[verdict].stickerInk }"
          >{{ t(`keywordOptimizer.board.verdict.${verdict}`) }}</span>
          <p>{{ t(`keywordOptimizer.board.verdictHelp.${verdict}`) }}</p>
        </div>

        <dl class="drawer__numbers">
          <div><dt>{{ t('keywordOptimizer.evidence.cost') }}</dt><dd>{{ formatMicrosAsIDR(note.spendMicros) }}</dd></div>
          <div><dt>{{ t('keywordOptimizer.evidence.clicks') }}</dt><dd>{{ formatNumber(note.clicks) }}</dd></div>
          <div><dt>{{ t('keywordOptimizer.evidence.conversions') }}</dt><dd>{{ note.conversions.toFixed(1) }}</dd></div>
          <div>
            <dt>{{ t('keywordOptimizer.evidence.costPerConversion') }}</dt>
            <dd>{{ cpa === null ? '—' : formatMicrosAsIDR(cpa) }}</dd>
          </div>
        </dl>

        <div class="drawer__row">
          <span class="drawer__label">{{ t('keywordTable.columns.intent') }}</span>
          <IntentMixBar :mix="note.summary?.intent_mix" :coverage="note.summary?.intent_coverage" />
        </div>
        <div class="drawer__row">
          <span class="drawer__label">{{ t('keywordTable.columns.stock') }}</span>
          <span v-if="note.summary?.stock_count === 0" class="drawer__nostock">{{ t('keywordTable.noStock') }}</span>
          <span v-else-if="note.summary?.stock_count != null">{{ note.summary.stock_count }}</span>
          <span v-else class="drawer__dim">—</span>
        </div>
      </template>

      <h3 class="drawer__sub">{{ t('keywordOptimizer.board.drawer.advice', { n: suggestions.length }) }}</h3>
      <p v-if="suggestions.length === 0" class="drawer__dim">{{ t('keywordOptimizer.board.drawer.noAdvice') }}</p>
      <div class="drawer__cards">
        <SuggestionCard
          v-for="s in suggestions"
          :key="s.id"
          :suggestion="s"
          :can-edit="canEdit"
          :busy="busyIds.has(s.id)"
          @status="(status) => emit('status', s.id, status)"
        />
      </div>
    </aside>
  </div>
</template>

<style scoped>
.drawer-backdrop { position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, 0.55); display: flex; justify-content: flex-end; }
.drawer {
  width: min(100%, 34rem);
  height: 100%;
  overflow-y: auto;
  padding: 18px 18px 40px;
  background: var(--color-bg);
  color: var(--color-ink);
  border-left: 2px solid var(--color-border);
}
.drawer__head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
.drawer__title { margin: 0; font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; line-height: 1.15; }
.drawer__where { margin: 4px 0 0; font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-soft); }
.drawer__close { flex: none; padding: 6px 12px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--color-ink); background: var(--color-surface); border: 1.5px solid var(--color-border-strong); cursor: pointer; }
.drawer__verdict { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; padding: 10px; background: var(--color-surface); border: 1.5px solid var(--color-border); }
.drawer__verdict p { margin: 0; font-size: 0.92rem; color: var(--color-ink-soft); }
.drawer__paused { margin: 0 0 12px; padding: 8px 10px; font-size: 0.9rem; background: var(--color-surface-raised); border: 1.5px dashed var(--color-border-strong); }
.drawer__sticker { flex: none; padding: 1px 6px; border: 1px solid #000; font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.drawer__numbers { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 8px; margin: 0 0 12px; }
.drawer__numbers div { padding: 8px 10px; background: var(--color-surface); border: 1.5px solid var(--color-border); }
.drawer__numbers dt { font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--color-ink-faint); }
.drawer__numbers dd { margin: 2px 0 0; font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.drawer__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; border-top: 1px solid var(--color-border); }
.drawer__label { font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--color-ink-faint); }
.drawer__nostock { font-weight: 700; color: var(--color-flag-critical); }
.drawer__dim { color: var(--color-ink-faint); }
.drawer__sub { margin: 18px 0 8px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-ink-faint); }
.drawer__cards { display: flex; flex-direction: column; gap: 12px; }
</style>
