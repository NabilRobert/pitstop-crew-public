<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatMicrosAsIDR, formatNumber, formatPercent } from '../../shared/utils/format'
import type { CampaignRow } from './useDashboard'

defineProps<{ rows: CampaignRow[] }>()

const { t } = useI18n()
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border bg-surface">
    <table class="w-full border-collapse text-left">
      <thead>
        <tr class="border-b border-border">
          <th
            class="cursor-help px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint"
            :title="t('campaignTable.columnHelp.campaign')"
          >
            {{ t('campaignTable.columns.campaign') }}
          </th>
          <th
            class="cursor-help px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint"
            :title="t('campaignTable.columnHelp.impressions')"
          >
            {{ t('campaignTable.columns.impressions') }}
          </th>
          <th
            class="cursor-help px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint"
            :title="t('campaignTable.columnHelp.clicks')"
          >
            {{ t('campaignTable.columns.clicks') }}
          </th>
          <th
            class="cursor-help px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint"
            :title="t('campaignTable.columnHelp.ctr')"
          >
            {{ t('campaignTable.columns.ctr') }}
          </th>
          <th
            class="cursor-help px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint"
            :title="t('campaignTable.columnHelp.cost')"
          >
            {{ t('campaignTable.columns.cost') }}
          </th>
          <th
            class="cursor-help px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint"
            :title="t('campaignTable.columnHelp.conversions')"
          >
            {{ t('campaignTable.columns.conversions') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.campaign"
          class="border-b border-border/60 last:border-0 hover:bg-surface-raised"
        >
          <td class="px-4 py-3 font-medium text-ink">{{ row.campaign }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.impressions) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.clicks) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatPercent(row.ctr) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatMicrosAsIDR(row.cost_micros) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink">{{ row.conversions.toFixed(1) }}</td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="6" class="px-4 py-8 text-center text-ink-faint">{{ t('campaignTable.noData') }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
