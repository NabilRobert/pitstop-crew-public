<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatNumber } from '../../shared/utils/format'
import type { InvRow, SortDir, SortKey } from './inventoryModel'
import { formatIdr } from './suggestionView'

// The model table: every column sorts (click again to flip), "no data" always sorts last, and a model that is
// out of stock but still advertised is called out, because every click on it is wasted.
defineProps<{ rows: InvRow[]; sortKey: SortKey; sortDir: SortDir; emptyText: string }>()
const emit = defineEmits<{ (e: 'sort', key: SortKey): void }>()
const { t } = useI18n()

const COLS: { key: SortKey; label: string; right: boolean }[] = [
  { key: 'model', label: 'model', right: false },
  { key: 'available', label: 'available', right: true },
  { key: 'days', label: 'daysListed', right: true },
  { key: 'price', label: 'price', right: true },
  { key: 'margin', label: 'margin', right: true },
  { key: 'keywords', label: 'keywords', right: true },
]
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border bg-surface">
    <table class="w-full min-w-max border-collapse text-left">
      <thead>
        <tr class="border-b border-border">
          <th
            v-for="c in COLS"
            :key="c.key"
            scope="col"
            class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint"
            :class="c.right ? 'text-right' : ''"
            :aria-sort="sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
          >
            <button type="button" class="inline-flex items-center gap-1 uppercase hover:text-ink" @click="emit('sort', c.key)">
              {{ t(`keywordOptimizer.inventory.columns.${c.label}`) }}
              <span aria-hidden="true">{{ sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '' }}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in rows" :key="`${m.make}-${m.model}`" class="border-b border-border last:border-b-0">
          <td class="px-4 py-3 font-medium text-ink">{{ m.make }} {{ m.model }}</td>
          <td class="px-4 py-3 text-right tabular-nums" :class="m.available === 0 && m.linked_keyword_count > 0 ? 'font-bold text-flag-critical' : 'text-ink'">
            {{ formatNumber(m.available) }}
            <span v-if="m.available === 0 && m.linked_keyword_count > 0" class="ml-1 font-mono text-[10px] uppercase">{{ t('keywordOptimizer.inventory.noStockButAdvertised') }}</span>
          </td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ m.avg_days_listed === null ? '—' : Math.round(m.avg_days_listed) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatIdr(m.avg_price_idr) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatIdr(m.avg_margin_idr) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ m.linked_keyword_count }}</td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="COLS.length" class="px-4 py-6 text-center text-ink-faint">{{ emptyText }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
