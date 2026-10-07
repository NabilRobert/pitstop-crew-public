<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { InventorySummary } from '../../shared/api/types'
import { formatDate, formatNumber } from '../../shared/utils/format'
import InventoryFilters from './InventoryFilters.vue'
import InventoryTable from './InventoryTable.vue'
import { EMPTY_FILTERS, applyFilters, isFiltered, sortRows, type InvFilters, type SortDir, type SortKey } from './inventoryModel'

// The inventory block: totals, aging bars, the filter bar and the sortable table. Presentational (the loader is
// InventoryPanel) so it can be shown on the Keyword Optimizer page, where it can be hidden, and on its own page.
const props = defineProps<{
  inventory: InventorySummary
  /** Show a Hide / Show button and remember the choice under this key (per browser). Omit for an always-open block. */
  collapseKey?: string
}>()
const { t } = useI18n()

function readCollapsed(): boolean {
  if (!props.collapseKey) return false
  try {
    return localStorage.getItem(props.collapseKey) === 'hidden'
  } catch {
    return false
  }
}
const collapsed = ref(readCollapsed())
function toggleCollapsed() {
  collapsed.value = !collapsed.value
  if (!props.collapseKey) return
  try {
    localStorage.setItem(props.collapseKey, collapsed.value ? 'hidden' : 'shown')
  } catch {
    // storage blocked: the choice just doesn't persist
  }
}

const filters = ref<InvFilters>({ ...EMPTY_FILTERS })
const sortKey = ref<SortKey>('model')
const sortDir = ref<SortDir>('asc')
function sortBy(key: SortKey) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    // text starts A-Z, numbers start biggest first (what you usually want to see)
    sortDir.value = key === 'model' ? 'asc' : 'desc'
  }
}

const filtered = computed(() => applyFilters(props.inventory.by_model, filters.value))
const rows = computed(() => sortRows(filtered.value, sortKey.value, sortDir.value))
const maxAging = computed(() => Math.max(1, ...props.inventory.aging.map((a) => a.count)))
const emptyText = computed(() =>
  isFiltered(filters.value)
    ? t('keywordOptimizer.inventory.search.none', { q: filters.value.query.trim() || t('keywordOptimizer.inventory.filters.theseFilters') })
    : t('keywordOptimizer.inventory.empty')
)
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-ink-soft">
        <template v-if="inventory.source !== 'unavailable'">
          {{ t(`keywordOptimizer.inventory.source.${inventory.source}`) }}
          <span v-if="inventory.snapshot_on"> · {{ t('keywordOptimizer.card.stockAsOf', { date: formatDate(inventory.snapshot_on) }) }}</span>
        </template>
      </p>
      <button
        v-if="collapseKey"
        type="button"
        class="border border-border-strong px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink"
        :aria-expanded="!collapsed"
        @click="toggleCollapsed"
      >
        {{ collapsed ? t('keywordOptimizer.inventory.show') : t('keywordOptimizer.inventory.hide') }}
      </button>
    </div>

    <!-- The source being down is HTTP 200 with source: 'unavailable': the page degrades, it doesn't break. -->
    <div
      v-if="inventory.source === 'unavailable'"
      class="rounded-lg border border-flag-caution/40 bg-flag-caution-soft px-5 py-4 text-sm text-ink"
    >
      <div class="font-bold">{{ t('keywordOptimizer.inventory.unavailable') }}</div>
      <p v-if="inventory.error" class="mt-1 text-ink-soft">{{ inventory.error }}</p>
      <p class="mt-1 text-ink-soft">{{ t('keywordOptimizer.inventory.unavailableEffect') }}</p>
    </div>

    <template v-else-if="!collapsed">
      <div v-if="inventory.totals" class="mb-4 grid grid-cols-3 gap-4">
        <div class="rounded-lg border border-border bg-surface p-4">
          <div class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.available') }}</div>
          <div class="font-display text-2xl font-bold tabular-nums text-ink">{{ formatNumber(inventory.totals.available) }}</div>
        </div>
        <div class="rounded-lg border border-border bg-surface p-4">
          <div class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.reserved') }}</div>
          <div class="font-display text-2xl font-bold tabular-nums text-ink">{{ formatNumber(inventory.totals.reserved) }}</div>
        </div>
        <div class="rounded-lg border border-border bg-surface p-4">
          <div class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.sold30') }}</div>
          <div class="font-display text-2xl font-bold tabular-nums text-ink">{{ formatNumber(inventory.totals.sold_last_30d) }}</div>
        </div>
      </div>

      <div v-if="inventory.aging.length" class="mb-4 rounded-lg border border-border bg-surface p-4">
        <div class="mb-2 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.aging') }}</div>
        <div v-for="a in inventory.aging" :key="a.bucket" class="mb-1.5 flex items-center gap-3">
          <span class="w-16 font-mono text-[11px] text-ink-soft">{{ t('keywordOptimizer.inventory.days', { range: a.bucket }) }}</span>
          <div class="h-2 flex-1 rounded bg-surface-raised">
            <div class="h-2 rounded bg-rosso" :style="{ width: `${(a.count / maxAging) * 100}%` }" />
          </div>
          <span class="w-8 text-right font-mono text-[11px] tabular-nums text-ink">{{ a.count }}</span>
        </div>
      </div>

      <template v-if="inventory.by_model.length">
        <InventoryFilters v-model="filters" :rows="inventory.by_model" :shown="rows.length" />
        <InventoryTable :rows="rows" :sort-key="sortKey" :sort-dir="sortDir" :empty-text="emptyText" @sort="sortBy" />
      </template>
    </template>
  </div>
</template>
