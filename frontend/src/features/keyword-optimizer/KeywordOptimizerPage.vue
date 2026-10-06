<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isDemo } from '../../shared/composables/auth'
import { formatDateTime, formatDate } from '../../shared/utils/format'
import SuggestionCard from './SuggestionCard.vue'
import NegativesExportPanel from './NegativesExportPanel.vue'
import InventoryPanel from './InventoryPanel.vue'
import { SUGGESTION_TYPES } from './suggestionView'
import { USE_FIXTURES } from './keywordOptimizerApi'
import { useKeywordOptimizer, type StatusFilter } from './useKeywordOptimizer'

const { t } = useI18n()
const {
  data, loading, error, statusFilter, typeFilter, setFilter, typeCounts, visibleItems,
  truncated, busyIds, actionError, runMessage, runStarting, setStatus, runNow,
} = useKeywordOptimizer()

const STATUS_FILTERS: StatusFilter[] = ['open', 'applied', 'dismissed', 'all']

// Demo accounts can read everything but not write (server returns 403 on any non-GET).
const canEdit = computed(() => !isDemo.value)
const canRun = computed(() => !isDemo.value && !USE_FIXTURES)

const run = computed(() => data.value?.run ?? null)
const negativeCount = computed(
  () => (data.value?.items ?? []).filter((s) => s.type === 'negative_keyword' && s.status === 'open').length
)
const showExport = computed(() => statusFilter.value === 'open' && negativeCount.value > 0)
const noRunYet = computed(() => !loading.value && !error.value && run.value === null && (data.value?.total ?? 0) === 0)

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

    <div v-else-if="error" class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical">
      {{ t('common.couldNotReachBackend', { error }) }}
    </div>

    <template v-else-if="data">
      <!-- Run + inventory status. A null run is a normal first-install state, not an error. -->
      <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <div class="rounded-lg border border-border bg-surface p-4">
          <div class="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">{{ t('keywordOptimizer.openCount') }}</div>
          <div class="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{{ data.total }}</div>
          <div class="font-mono text-[11px] text-ink-faint">{{ t(`keywordOptimizer.filters.status.${statusFilter}`) }}</div>
        </div>
      </div>

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
            @click="setFilter(f)"
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
            {{ t('keywordOptimizer.filters.allTypes') }} ({{ data.items.length }})
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

        <NegativesExportPanel v-if="showExport" :count="negativeCount" />

        <p v-if="truncated" class="mb-3 text-sm text-ink-soft">
          {{ t('keywordOptimizer.truncated', { n: data.items.length, total: data.total }) }}
        </p>

        <div v-if="visibleItems.length === 0" class="rounded-lg border border-border bg-surface px-6 py-10 text-center text-sm text-ink-soft">
          {{ data.total === 0 && statusFilter === 'open' ? t('keywordOptimizer.empty.open') : t('keywordOptimizer.empty.filtered') }}
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

      <InventoryPanel />
    </template>
  </main>
</template>
