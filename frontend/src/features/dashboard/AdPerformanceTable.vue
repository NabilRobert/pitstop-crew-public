<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatMicrosAsIDR, formatNumber, formatPercent } from '../../shared/utils/format'
import type { AdRow } from './useCampaignDetail'
import type { AdStrength } from '../../shared/api/types'

defineProps<{ rows: AdRow[] }>()

const { t } = useI18n()

// excellent/good read as healthy, average as worth watching, poor as a
// real problem — same 3-tier semantic mapping as KeywordTable's QS
// colors, collapsed from Google Ads' 4-tier ad_strength scale.
function strengthColorClass(strength: AdStrength): string {
  if (strength === 'excellent' || strength === 'good') return 'text-flag-good'
  if (strength === 'average') return 'text-flag-caution'
  return 'text-flag-critical'
}

function strengthLabel(strength: AdStrength): string {
  return t(`adPerformanceTable.strength.${strength}`)
}

function preview(lines: string[], max = 2): string {
  return lines.slice(0, max).join(' · ')
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border bg-surface">
    <table class="w-full border-collapse text-left">
      <thead>
        <tr class="border-b border-border">
          <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('adPerformanceTable.columns.ad') }}
          </th>
          <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('adPerformanceTable.columns.adGroup') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('adPerformanceTable.columns.impressions') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('adPerformanceTable.columns.clicks') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('adPerformanceTable.columns.ctr') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('adPerformanceTable.columns.cost') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('adPerformanceTable.columns.conversions') }}
          </th>
          <th
            class="cursor-help px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint"
            :title="t('adPerformanceTable.columnHelp.adStrength')"
          >
            {{ t('adPerformanceTable.columns.adStrength') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.ad_id" class="border-b border-border/60 last:border-0 hover:bg-surface-raised">
          <td class="max-w-xs px-4 py-3">
            <span class="font-medium text-ink">{{ row.label }}</span>
            <div class="mt-1 truncate font-mono text-[11px] text-ink-faint" :title="row.headlines.join(' · ')">
              {{ preview(row.headlines) }}
            </div>
            <div class="truncate text-[11px] text-ink-faint" :title="row.descriptions.join(' · ')">
              {{ preview(row.descriptions, 1) }}
            </div>
          </td>
          <td class="px-4 py-3 text-ink-soft">{{ row.ad_group }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.impressions) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.clicks) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatPercent(row.ctr) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatMicrosAsIDR(row.cost_micros) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink">{{ row.conversions.toFixed(1) }}</td>
          <td class="px-4 py-3 text-right font-bold" :class="strengthColorClass(row.ad_strength)">
            {{ strengthLabel(row.ad_strength) }}
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="8" class="px-4 py-8 text-center text-ink-faint">{{ t('adPerformanceTable.noData') }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
