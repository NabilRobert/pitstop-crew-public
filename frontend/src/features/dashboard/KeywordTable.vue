<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatMicrosAsIDR, formatNumber, formatPercent } from '../../shared/utils/format'
import type { KeywordRow } from './useCampaignDetail'

defineProps<{ rows: KeywordRow[] }>()

const { t } = useI18n()

// 8-10 reads as healthy, 5-7 as worth watching, 1-4 as a real problem —
// reuses the existing racing-flag semantic colors (good/caution/critical)
// rather than inventing a new QS-specific palette.
function qsColorClass(score: number | null): string {
  if (score === null) return 'text-ink-faint'
  if (score >= 8) return 'text-flag-good'
  if (score >= 5) return 'text-flag-caution'
  return 'text-flag-critical'
}

function subScoreTooltip(row: KeywordRow): string {
  const label = (b: KeywordRow['expected_ctr']) =>
    b === 'above_average' ? t('keywordTable.above') : b === 'below_average' ? t('keywordTable.below') : t('keywordTable.avg')
  return `${t('keywordTable.expectedCtr')}: ${label(row.expected_ctr)} · ${t('keywordTable.adRelevance')}: ${label(row.ad_relevance)} · ${t('keywordTable.landingPageExperience')}: ${label(row.landing_page_experience)}`
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border bg-surface">
    <table class="w-full border-collapse text-left">
      <thead>
        <tr class="border-b border-border">
          <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('keywordTable.columns.keyword') }}
          </th>
          <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('keywordTable.columns.adGroup') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('keywordTable.columns.impressions') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('keywordTable.columns.clicks') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('keywordTable.columns.ctr') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('keywordTable.columns.cost') }}
          </th>
          <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('keywordTable.columns.conversions') }}
          </th>
          <th
            class="cursor-help px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint"
            :title="t('keywordTable.columnHelp.qualityScore')"
          >
            {{ t('keywordTable.columns.qualityScore') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.keyword_id" class="border-b border-border/60 last:border-0 hover:bg-surface-raised">
          <td class="px-4 py-3">
            <span class="font-medium text-ink">{{ row.text }}</span>
            <span class="ml-1.5 rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
              {{ row.match_type }}
            </span>
          </td>
          <td class="px-4 py-3 text-ink-soft">{{ row.ad_group }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.impressions) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatNumber(row.clicks) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatPercent(row.ctr) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatMicrosAsIDR(row.cost_micros) }}</td>
          <td class="px-4 py-3 text-right tabular-nums text-ink">{{ row.conversions.toFixed(1) }}</td>
          <td class="cursor-help px-4 py-3 text-right tabular-nums font-bold" :class="qsColorClass(row.quality_score)" :title="subScoreTooltip(row)">
            {{ row.quality_score ?? '—' }}
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="8" class="px-4 py-8 text-center text-ink-faint">{{ t('keywordTable.noData') }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
