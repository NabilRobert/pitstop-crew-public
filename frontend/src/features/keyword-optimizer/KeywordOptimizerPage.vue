<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isDemo } from '../../shared/composables/auth'
import { formatDateTime, formatDate } from '../../shared/utils/format'
import type { Suggestion } from '../../shared/api/types'
import SuggestionCard from './SuggestionCard.vue'
import NegativesExportPanel from './NegativesExportPanel.vue'
import InventoryPanel from './InventoryPanel.vue'
import BoardHeadline from './BoardHeadline.vue'
import BoardLegend from './BoardLegend.vue'
import CorkBoard from './CorkBoard.vue'
import NoteDrawer from './NoteDrawer.vue'
import { SUGGESTION_TYPES } from './suggestionView'
import { USE_FIXTURES } from './keywordOptimizerApi'
import { useKeywordOptimizer, type StatusFilter } from './useKeywordOptimizer'
import { useBoardData } from './useBoardData'
import {
  boardNumbers, buildNotes, campaignsOf, headline as buildHeadline, looseIdeas, visibleNotes,
  type BoardFilter, type BoardNote,
} from './boardModel'
import { LEGEND_ORDER } from './verdict'

const { t } = useI18n()
const {
  data, loading, error, backendMissing, items, openCount, appliedCount, dismissedCount, statusFilter, typeFilter,
  typeCounts, visibleItems, truncated, busyIds, actionError, runMessage, runStarting, setStatus, runNow,
} = useKeywordOptimizer()
const board = useBoardData()

// --- view toggle (remembered per browser; the page works without storage) ---
type View = 'board' | 'list'
const VIEW_KEY = 'pitstop-keyword-view'
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'
  } catch {
    return 'board'
  }
}
const view = ref<View>(readView())
function setView(v: View) {
  view.value = v
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // storage blocked: the choice just doesn't persist
  }
}

const STATUS_FILTERS: StatusFilter[] = ['open', 'applied', 'dismissed', 'all']

// Demo accounts can read everything but not write (server returns 403 on any non-GET).
const canEdit = computed(() => !isDemo.value)
const canRun = computed(() => !isDemo.value && !USE_FIXTURES && !backendMissing.value)

const run = computed(() => data.value?.run ?? null)
const noRunYet = computed(() => !loading.value && !error.value && run.value === null && items.value.length === 0)

// --- board ---
const notes = computed(() => buildNotes(board.rows.value, board.summaries.value, items.value))
const ideas = computed(() => looseIdeas(items.value))
const headline = computed(() => buildHeadline(items.value))
const numbers = computed(() => boardNumbers(notes.value))
const campaigns = computed(() => campaignsOf(notes.value))
const filter = ref<BoardFilter>({ campaignId: null, verdict: 'all', showAll: false })
const visible = computed(() => visibleNotes(notes.value, filter.value))
const hasVerdicts = computed(() => notes.value.some((n) => n.verdict !== null))

// --- detail panel ---
type DrawerTarget = { kind: 'note'; keywordId: number; focusId?: number } | { kind: 'idea'; suggestionId: number }
const drawer = ref<DrawerTarget | null>(null)
const drawerNote = computed<BoardNote | null>(() =>
  drawer.value?.kind === 'note' ? notes.value.find((n) => n.keywordId === (drawer.value as { keywordId: number }).keywordId) ?? null : null
)
const drawerSuggestions = computed<Suggestion[]>(() => {
  const d = drawer.value
  if (!d) return []
  if (d.kind === 'idea') return items.value.filter((s) => s.id === d.suggestionId)
  const all = drawerNote.value?.all ?? []
  // Opened from a specific tape strip: show that suggestion first.
  const first = d.focusId
  return first === undefined ? all : [...all].sort((a, b) => Number(b.id === first) - Number(a.id === first))
})
// If the thing being shown disappears (a reload, a superseded row), close the panel rather than show a stale one.
watch([drawerNote, drawerSuggestions], () => {
  if (drawer.value && !drawerNote.value && drawerSuggestions.value.length === 0) drawer.value = null
})

function openNote(note: BoardNote) {
  drawer.value = { kind: 'note', keywordId: note.keywordId }
}
function openSuggestion(note: BoardNote, s: Suggestion) {
  drawer.value = { kind: 'note', keywordId: note.keywordId, focusId: s.id }
}
function openIdea(s: Suggestion) {
  drawer.value = { kind: 'idea', suggestionId: s.id }
}

const negativeCount = computed(() => items.value.filter((s) => s.type === 'negative_keyword' && s.status === 'open').length)
const showExport = computed(() => negativeCount.value > 0)

function runStatusClass(status: string): string {
  if (status === 'success') return 'text-flag-good'
  if (status === 'failure') return 'text-flag-critical'
  return 'text-flag-caution'
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-ink">{{ t('keywordOptimizer.title.page') }}</h1>
        <p class="mt-1 max-w-2xl text-sm text-ink-soft">{{ t('keywordOptimizer.subtitle') }}</p>
      </div>
      <button
        v-if="canRun"
        type="button"
        class="rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco hover:bg-rosso-dark disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="runStarting"
        @click="runNow"
      >
        {{ runStarting ? t('keywordOptimizer.runStarting') : t('keywordOptimizer.runNow') }}
      </button>
    </div>

    <p v-if="USE_FIXTURES" class="mb-4 rounded-md border border-flag-caution/40 bg-flag-caution-soft px-3 py-2 text-sm text-ink">
      {{ t('keywordOptimizer.fixtureBanner') }}
    </p>
    <p v-if="runMessage" class="mb-4 rounded-md border border-flag-good/40 bg-flag-good-soft px-3 py-2 text-sm text-ink" role="status">
      {{ t('keywordOptimizer.runStarted', { id: runMessage }) }}
    </p>
    <p v-if="actionError" class="mb-4 rounded-md border border-flag-critical/40 bg-flag-critical-soft px-3 py-2 text-sm text-flag-critical" role="alert">
      {{ actionError }}
    </p>

    <div v-if="loading && !data" class="py-24 text-center text-ink-faint">{{ t('common.loading') }}</div>

    <div v-else-if="backendMissing" class="rounded-lg border border-flag-caution/40 bg-flag-caution-soft px-5 py-4 text-ink">
      <div class="font-bold text-flag-caution">{{ t('keywordOptimizer.backendMissing.title') }}</div>
      <p class="mt-1 text-sm text-ink-soft">{{ t('keywordOptimizer.backendMissing.body') }}</p>
    </div>

    <div v-else-if="error" class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical">
      {{ t('common.couldNotReachBackend', { error }) }}
    </div>

    <template v-else-if="data">
      <!-- Run + inventory status. A null run is a normal first-install state, not an error. -->
      <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="rounded-lg border border-border bg-surface p-4">
          <div class="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">{{ t('keywordOptimizer.lastRun') }}</div>
          <div v-if="run" class="mt-1">
            <div class="font-display text-base font-bold text-ink">{{ formatDateTime(run.finished_at) }}</div>
            <div class="font-mono text-[11px] font-bold uppercase" :class="runStatusClass(run.status)">
              {{ t(`keywordOptimizer.runStatus.${run.status}`) }}
              <router-link :to="`/runs/${run.id}`" class="ml-1 normal-case text-link underline">#{{ run.id }}</router-link>
            </div>
          </div>
          <div v-else class="mt-1 text-sm text-ink-soft">{{ t('keywordOptimizer.noRunShort') }}</div>
        </div>
        <div class="rounded-lg border border-border bg-surface p-4">
          <div class="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">{{ t('keywordOptimizer.inventory.title') }}</div>
          <div class="mt-1 font-display text-base font-bold text-ink">
            {{ t(`keywordOptimizer.inventory.source.${data.inventory.source}`) }}
          </div>
          <div class="font-mono text-[11px] text-ink-faint">
            {{ data.inventory.snapshot_on ? t('keywordOptimizer.card.stockAsOf', { date: formatDate(data.inventory.snapshot_on) }) : t('keywordOptimizer.noSnapshot') }}
          </div>
        </div>
      </div>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center" role="group" :aria-label="t('keywordOptimizer.board.view.label')">
          <button
            type="button"
            class="border border-border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
            :class="view === 'board' ? 'border-rosso bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            :aria-pressed="view === 'board'"
            @click="setView('board')"
          >
            {{ t('keywordOptimizer.board.view.board') }}
          </button>
          <button
            type="button"
            class="border border-l-0 border-border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
            :class="view === 'list' ? 'border-rosso bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            :aria-pressed="view === 'list'"
            @click="setView('list')"
          >
            {{ t('keywordOptimizer.board.view.list') }}
          </button>
        </div>
      </div>

      <NegativesExportPanel v-if="showExport && view === 'list'" :count="negativeCount" />

      <!-- ===================== BOARD ===================== -->
      <template v-if="view === 'board'">
        <BoardHeadline :headline="headline" :numbers="numbers" :no-run-yet="noRunYet" />
        <p v-if="board.summaryMissing.value" class="mb-3 text-sm text-ink-soft">{{ t('keywordOptimizer.board.noVerdicts') }}</p>
        <BoardLegend />

        <div v-if="board.loading.value" class="py-10 text-center text-ink-faint">{{ t('common.loading') }}</div>
        <div v-else-if="board.error.value" class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-sm text-flag-critical">
          {{ t('keywordOptimizer.board.numbersFailed', { error: board.error.value }) }}
        </div>
        <template v-else>
          <div class="mb-2 flex flex-wrap items-center gap-2" role="group" :aria-label="t('keywordOptimizer.board.filters.campaign')">
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
            @drop="(id, status) => setStatus(id, status)"
            @show-all="filter = { ...filter, showAll: true }"
          />
          <p v-if="filter.showAll" class="mt-2">
            <button type="button" class="font-mono text-[11px] font-bold uppercase tracking-wide text-link underline" @click="filter = { ...filter, showAll: false }">
              {{ t('keywordOptimizer.board.showLess') }}
            </button>
          </p>

          <NegativesExportPanel v-if="showExport" class="mt-6" :count="negativeCount" />
        </template>
      </template>

      <!-- ===================== LIST ===================== -->
      <template v-else>
        <div v-if="noRunYet" class="rounded-lg border border-border bg-surface px-6 py-10 text-center">
          <div class="font-display text-lg font-bold text-ink">{{ t('keywordOptimizer.noRunYet.title') }}</div>
          <p class="mx-auto mt-2 max-w-xl text-sm text-ink-soft">{{ t('keywordOptimizer.noRunYet.body') }}</p>
        </div>

        <template v-else>
          <div class="mb-4 flex flex-wrap items-center gap-2" role="group" :aria-label="t('keywordOptimizer.filters.statusLabel')">
            <button
              v-for="f in STATUS_FILTERS"
              :key="f"
              type="button"
              class="rounded-full border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
              :class="statusFilter === f ? 'border-rosso bg-rosso text-bianco' : 'border-border text-ink-soft hover:text-ink'"
              :aria-pressed="statusFilter === f"
              @click="statusFilter = f"
            >
              {{ t(`keywordOptimizer.filters.status.${f}`) }}
            </button>
          </div>
          <div class="mb-6 flex flex-wrap items-center gap-2" role="group" :aria-label="t('keywordOptimizer.filters.typeLabel')">
            <button
              type="button"
              class="rounded-full border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
              :class="typeFilter === 'all' ? 'border-rosso bg-rosso text-bianco' : 'border-border text-ink-soft hover:text-ink'"
              :aria-pressed="typeFilter === 'all'"
              @click="typeFilter = 'all'"
            >
              {{ t('keywordOptimizer.filters.allTypes') }}
            </button>
            <button
              v-for="type in SUGGESTION_TYPES"
              :key="type"
              type="button"
              class="rounded-full border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              :class="typeFilter === type ? 'border-rosso bg-rosso text-bianco' : 'border-border text-ink-soft hover:text-ink'"
              :aria-pressed="typeFilter === type"
              :disabled="typeCounts[type] === 0"
              @click="typeFilter = type"
            >
              {{ t(`keywordOptimizer.types.${type}`) }} ({{ typeCounts[type] }})
            </button>
          </div>

          <p v-if="truncated" class="mb-3 text-sm text-ink-soft">
            {{ t('keywordOptimizer.truncated', { n: items.length, total: data.total }) }}
          </p>

          <div v-if="visibleItems.length === 0" class="rounded-lg border border-border bg-surface px-6 py-10 text-center text-sm text-ink-soft">
            {{ openCount === 0 && statusFilter === 'open' ? t('keywordOptimizer.empty.open') : t('keywordOptimizer.empty.filtered') }}
          </div>
          <div v-else class="space-y-4">
            <SuggestionCard
              v-for="s in visibleItems"
              :key="s.id"
              :suggestion="s"
              :can-edit="canEdit"
              :busy="busyIds.has(s.id)"
              @status="(status) => setStatus(s.id, status)"
            />
          </div>
        </template>
      </template>

      <InventoryPanel />
    </template>

    <NoteDrawer
      v-if="drawer"
      :note="drawerNote"
      :suggestions="drawerSuggestions"
      :can-edit="canEdit"
      :busy-ids="busyIds"
      @close="drawer = null"
      @status="(id, status) => setStatus(id, status)"
    />
  </main>
</template>
