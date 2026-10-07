<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate, formatNumber } from '../../shared/utils/format'
import { formatIdr } from './suggestionView'
import { matchesAllWords } from './boardModel'
import SearchBox from './SearchBox.vue'
import { useInventorySummary } from './useInventorySummary'

const { t } = useI18n()
const { inventory, loading, error } = useInventorySummary()

const query = ref('')
/** Every word of the search must appear in "make model" (see matchesAllWords). */
const models = computed(() => (inventory.value?.by_model ?? []).filter((m) => matchesAllWords(`${m.make} ${m.model}`, query.value)))
const searching = computed(() => query.value.trim() !== '')

const maxAging = computed(() => Math.max(1, ...(inventory.value?.aging ?? []).map((a) => a.count)))
</script>

<template>
  <section class="mt-10">
    <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.title') }}</h2>

    <div v-if="loading" class="py-6 text-ink-faint">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="rounded-lg border border-border bg-surface px-5 py-4 text-sm text-ink-soft">
      {{ t('keywordOptimizer.inventory.loadFailed', { error }) }}
    </div>

    <template v-else-if="inventory">
      <!-- The source being down is HTTP 200 with source: 'unavailable' — the page degrades, it doesn't break. -->
      <div
        v-if="inventory.source === 'unavailable'"
        class="rounded-lg border border-flag-caution/40 bg-flag-caution-soft px-5 py-4 text-sm text-ink"
      >
        <div class="font-bold">{{ t('keywordOptimizer.inventory.unavailable') }}</div>
        <p v-if="inventory.error" class="mt-1 text-ink-soft">{{ inventory.error }}</p>
        <p class="mt-1 text-ink-soft">{{ t('keywordOptimizer.inventory.unavailableEffect') }}</p>
      </div>

      <template v-else>
        <p class="mb-3 text-sm text-ink-soft">
          {{ t(`keywordOptimizer.inventory.source.${inventory.source}`) }}
          <span v-if="inventory.snapshot_on"> · {{ t('keywordOptimizer.card.stockAsOf', { date: formatDate(inventory.snapshot_on) }) }}</span>
        </p>

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

        <div v-if="inventory.by_model.length" class="mb-2">
          <SearchBox
            v-model="query"
            :label="t('keywordOptimizer.inventory.search.label')"
            :placeholder="t('keywordOptimizer.inventory.search.placeholder')"
            :clear-label="t('keywordOptimizer.board.search.clear')"
          />
          <p v-if="searching" class="mt-1 text-xs text-ink-soft" role="status">
            {{ t('keywordOptimizer.inventory.search.count', { n: models.length, total: inventory.by_model.length }) }}
          </p>
        </div>
        <div v-if="inventory.by_model.length" class="overflow-x-auto rounded-lg border border-border bg-surface">
          <table class="w-full min-w-max border-collapse text-left">
            <thead>
              <tr class="border-b border-border">
                <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.model') }}</th>
                <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.available') }}</th>
                <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.daysListed') }}</th>
                <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.price') }}</th>
                <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.margin') }}</th>
                <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.inventory.columns.keywords') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in models" :key="`${m.make}-${m.model}`" class="border-b border-border last:border-b-0">
                <td class="px-4 py-3 font-medium text-ink">{{ m.make }} {{ m.model }}</td>
                <td class="px-4 py-3 text-right tabular-nums" :class="m.available === 0 && m.linked_keyword_count > 0 ? 'font-bold text-flag-critical' : 'text-ink'">
                  {{ m.available }}
                  <span v-if="m.available === 0 && m.linked_keyword_count > 0" class="ml-1 font-mono text-[10px] uppercase">{{ t('keywordOptimizer.inventory.noStockButAdvertised') }}</span>
                </td>
                <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ m.avg_days_listed === null ? '—' : Math.round(m.avg_days_listed) }}</td>
                <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatIdr(m.avg_price_idr) }}</td>
                <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatIdr(m.avg_margin_idr) }}</td>
                <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ m.linked_keyword_count }}</td>
              </tr>
              <tr v-if="searching && models.length === 0">
                <td colspan="6" class="px-4 py-6 text-center text-ink-faint">{{ t('keywordOptimizer.inventory.search.none', { q: query.trim() }) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </section>
</template>
