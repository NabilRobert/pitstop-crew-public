<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { KeywordPerformanceRow, KeywordSummary, Suggestion } from '../../shared/api/types'
import BoardHeadline from './BoardHeadline.vue'
import BoardLegend from './BoardLegend.vue'
import CorkBoard from './CorkBoard.vue'
import NoteDrawer from './NoteDrawer.vue'
import NegativesExportPanel from './NegativesExportPanel.vue'
import SearchBox from './SearchBox.vue'
import {
  boardNumbers, buildNotes, campaignsOf, headline as buildHeadline, looseIdeas, visibleNotes,
  type BoardFilter, type BoardNote,
} from './boardModel'
import { LEGEND_ORDER } from './verdict'

// The whole cork-board experience (headline, legend, filters, board, bins, detail panel) as one
// panel, used account-wide on the Keyword Optimizer page and scoped to one campaign on that
// campaign's page. It owns no data: the parent loads rows, summaries and suggestions.
const props = defineProps<{
  rows: KeywordPerformanceRow[]
  summaries: KeywordSummary[]
  /** Every suggestion loaded, any status. */
  suggestions: Suggestion[]
  /** Scope everything to one campaign; null = the whole account. */
  campaignId: number | null
  canEdit: boolean
  busyIds: Set<number>
  /** True before the first optimizer run: the headline says there is nothing to do yet. */
  noRunYet: boolean
  /** The backend sent no verdicts (an older deploy): say so. */
  summaryMissing?: boolean
  /** The period the rows cover, if it differs from the 90 days verdicts are judged on, to say so. */
  periodDays?: number | null
  /** Show the export panel for open negatives under the board. */
  showExport?: boolean
}>()
const emit = defineEmits<{ (e: 'status', id: number, status: 'open' | 'applied' | 'dismissed' | 'planned'): void }>()

const { t } = useI18n()

const scoped = computed(() =>
  props.campaignId === null ? props.suggestions : props.suggestions.filter((s) => s.campaign?.id === props.campaignId)
)
// Rows are scoped here too, not just by whoever loaded them, so the panel is correct on its own.
const scopedRows = computed(() =>
  props.campaignId === null ? props.rows : props.rows.filter((r) => r.campaign_id === props.campaignId)
)
const scopedSummaries = computed(() =>
  props.campaignId === null ? props.summaries : props.summaries.filter((m) => !m.campaign || m.campaign.id === props.campaignId)
)
const notes = computed(() => buildNotes(scopedRows.value, scopedSummaries.value, scoped.value))
const ideas = computed(() => looseIdeas(scoped.value))
const headline = computed(() => buildHeadline(scoped.value))
const numbers = computed(() => boardNumbers(notes.value))
const campaigns = computed(() => campaignsOf(notes.value))
const appliedCount = computed(() => scoped.value.filter((s) => s.status === 'applied').length)
const dismissedCount = computed(() => scoped.value.filter((s) => s.status === 'dismissed').length)
const negativeCount = computed(() => scoped.value.filter((s) => s.type === 'negative_keyword' && s.status === 'open').length)

const filter = ref<BoardFilter>({ campaignId: null, verdict: 'all', showAll: false, query: '' })
const query = computed({
  get: () => filter.value.query ?? '',
  set: (v: string) => (filter.value = { ...filter.value, query: v }),
})
const searching = computed(() => query.value.trim() !== '')
const visible = computed(() => visibleNotes(notes.value, filter.value))
const hasVerdicts = computed(() => notes.value.some((n) => n.verdict !== null))
const periodNote = computed(() => props.periodDays != null && props.periodDays !== 90)

// --- detail panel ---
type DrawerTarget = { kind: 'note'; keywordId: number; focusId?: number } | { kind: 'idea'; suggestionId: number }
const drawer = ref<DrawerTarget | null>(null)
const drawerNote = computed<BoardNote | null>(() =>
  drawer.value?.kind === 'note' ? notes.value.find((n) => n.keywordId === (drawer.value as { keywordId: number }).keywordId) ?? null : null
)
const drawerSuggestions = computed<Suggestion[]>(() => {
  const d = drawer.value
  if (!d) return []
  if (d.kind === 'idea') return scoped.value.filter((s) => s.id === d.suggestionId)
  const all = drawerNote.value?.all ?? []
  // Opened from a specific tape strip: show that suggestion first.
  const first = d.focusId
  return first === undefined ? all : [...all].sort((a, b) => Number(b.id === first) - Number(a.id === first))
})
// If the thing being shown disappears (a reload, a superseded row), close the panel rather than show a stale one.
watch([drawerNote, drawerSuggestions], () => {
  if (drawer.value && !drawerNote.value && drawerSuggestions.value.length === 0) drawer.value = null
})
// A different campaign is a different board: forget filters and any open panel.
watch(
  () => props.campaignId,
  () => {
    filter.value = { campaignId: null, verdict: 'all', showAll: false, query: '' }
    drawer.value = null
  }
)

function openNote(note: BoardNote) {
  drawer.value = { kind: 'note', keywordId: note.keywordId }
}
function openSuggestion(note: BoardNote, s: Suggestion) {
  drawer.value = { kind: 'note', keywordId: note.keywordId, focusId: s.id }
}
function openIdea(s: Suggestion) {
  drawer.value = { kind: 'idea', suggestionId: s.id }
}
</script>

<template>
  <div>
    <BoardHeadline :headline="headline" :numbers="numbers" :no-run-yet="noRunYet" />
    <p v-if="summaryMissing" class="mb-3 text-sm text-ink-soft">{{ t('keywordOptimizer.board.noVerdicts') }}</p>
    <BoardLegend />
    <p v-if="periodNote" class="-mt-2 mb-3 text-xs text-ink-faint">{{ t('keywordOptimizer.board.periodNote') }}</p>

    <div class="mb-3">
      <SearchBox
        v-model="query"
        :label="t('keywordOptimizer.board.search.label')"
        :placeholder="t('keywordOptimizer.board.search.placeholder')"
        :clear-label="t('keywordOptimizer.board.search.clear')"
      />
      <p v-if="searching" class="mt-1 text-xs text-ink-soft" role="status">
        {{ visible.shown.length === 0
          ? t('keywordOptimizer.board.search.none', { q: query.trim() })
          : t('keywordOptimizer.board.search.results', { n: visible.shown.length, total: notes.length }) }}
      </p>
    </div>

    <!-- Campaign chips only make sense account-wide; on a campaign's own page everything is already that campaign. -->
    <div v-if="campaignId === null" class="mb-2 flex flex-wrap items-center gap-2" role="group" :aria-label="t('keywordOptimizer.board.filters.campaign')">
      <button
        type="button"
        class="rounded-full border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide"
        :class="filter.campaignId === null ? 'border-rosso bg-rosso text-bianco' : 'border-border text-ink-soft hover:text-ink'"
        :aria-pressed="filter.campaignId === null"
        @click="filter = { ...filter, campaignId: null }"
      >
        {{ t('keywordOptimizer.board.filters.allCampaigns') }}
      </button>
      <button
        v-for="c in campaigns"
        :key="c.id"
        type="button"
        class="rounded-full border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide"
        :class="filter.campaignId === c.id ? 'border-rosso bg-rosso text-bianco' : 'border-border text-ink-soft hover:text-ink'"
        :aria-pressed="filter.campaignId === c.id"
        @click="filter = { ...filter, campaignId: c.id }"
      >
        {{ c.name }}
      </button>
    </div>
    <div v-if="hasVerdicts" class="mb-4 flex flex-wrap items-center gap-2" role="group" :aria-label="t('keywordOptimizer.board.filters.verdict')">
      <button
        type="button"
        class="rounded-full border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide"
        :class="filter.verdict === 'all' ? 'border-rosso bg-rosso text-bianco' : 'border-border text-ink-soft hover:text-ink'"
        :aria-pressed="filter.verdict === 'all'"
        @click="filter = { ...filter, verdict: 'all' }"
      >
        {{ t('keywordOptimizer.board.filters.allVerdicts') }}
      </button>
      <button
        v-for="v in LEGEND_ORDER"
        :key="v"
        type="button"
        class="rounded-full border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide"
        :class="filter.verdict === v ? 'border-rosso bg-rosso text-bianco' : 'border-border text-ink-soft hover:text-ink'"
        :aria-pressed="filter.verdict === v"
        @click="filter = { ...filter, verdict: v }"
      >
        {{ t(`keywordOptimizer.board.verdict.${v}`) }}
      </button>
    </div>

    <CorkBoard
      :notes="visible.shown"
      :hidden="visible.hidden"
      :ideas="ideas"
      :can-edit="canEdit"
      :applied-count="appliedCount"
      :dismissed-count="dismissedCount"
      @open="openNote"
      @open-suggestion="openSuggestion"
      @open-idea="openIdea"
      @drop="(id, status) => emit('status', id, status)"
      @show-all="filter = { ...filter, showAll: true }"
    />
    <p v-if="filter.showAll" class="mt-2">
      <button type="button" class="font-mono text-[11px] font-bold uppercase tracking-wide text-link underline" @click="filter = { ...filter, showAll: false }">
        {{ t('keywordOptimizer.board.showLess') }}
      </button>
    </p>

    <NegativesExportPanel v-if="showExport && negativeCount > 0" class="mt-6" :count="negativeCount" />

    <NoteDrawer
      v-if="drawer"
      :note="drawerNote"
      :suggestions="drawerSuggestions"
      :can-edit="canEdit"
      :busy-ids="busyIds"
      @close="drawer = null"
      @status="(id, status) => emit('status', id, status)"
    />
  </div>
</template>
