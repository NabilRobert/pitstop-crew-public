<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatMicrosAsIDR, formatNumber, formatPercent } from '../../shared/utils/format'
import type { SearchTermRow } from './useCampaignDetail'

defineProps<{ rows: SearchTermRow[] }>()

const { t } = useI18n()
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border bg-surface">
    <table class="w-full min-w-max border-collapse text-left">
      <thead>
        <tr class="border-b border-border">
          <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('searchTermTable.columns.searchTerm') }}
          </th>
          <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('searchTermTable.columns.keyword') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('searchTermTable.columns.impressions') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('searchTermTable.columns.clicks') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('searchTermTable.columns.ctr') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('searchTermTable.columns.cost') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('searchTermTable.columns.conversions') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('searchTermTable.columns.value') }}
          </th>
          <th
            class="cursor-help px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint"
            :title="t('searchTermTable.columnHelp.intent')"
          >
            {{ t('searchTermTable.columns.intent') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.search_term_id"
          class="border-b border-border/60 last:border-0 hover:bg-surface-raised"
          :class="row.wasted ? 'bg-flag-critical-soft/40' : ''"
        >
          <td class="px-4 py-3">
            <span class="font-medium text-ink">{{ row.search_term }}</span>
            <span class="ml-1.5 rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
              {{ row.match_flavor === 'close_variant' ? t('searchTermTable.closeVariant') : t('searchTermTable.broader') }}
            </span>
            <span
              v-if="row.wasted"
              class="ml-1.5 rounded bg-flag-critical-soft px-1.5 py-0.5 font-mono text-[10px] uppercase text-flag-critical"
              :title="t('searchTermTable.wastedSpendHelp')"
            >
              {{ t('searchTermTable.wastedSpend') }}
            </span>
          </td>
          <td class="px-4 py-3 text-ink-soft">{{ row.keyword }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.impressions) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.clicks) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatPercent(row.ctr) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatMicrosAsIDR(row.cost_micros) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink">{{ row.conversions.toFixed(1) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">
            <template v-if="row.value_micros">{{ formatMicrosAsIDR(row.value_micros) }}</template>
            <span v-else class="text-ink-faint" :title="t('searchTermTable.noDataYet')">—</span>
          </td>
          <td class="px-4 py-3" :title="row.intent_method ? t('searchTermTable.intentMethod', { method: t(`searchTermTable.methods.${row.intent_method}`), pct: Math.round((row.intent_confidence ?? 0) * 100) }) : ''">
            <span v-if="row.intent === null" class="text-ink-faint" :title="t('searchTermTable.noDataYet')">—</span>
            <span v-else class="font-mono text-[10px] font-bold uppercase tracking-wide text-ink-soft">
              {{ t(`keywordOptimizer.intent.${row.intent}`) }}
            </span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="9" class="px-4 py-8 text-center text-ink-faint">{{ t('searchTermTable.noData') }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
