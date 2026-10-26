<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatDate } from '../../shared/utils/format'
import type { RecommendationRow } from '../../shared/api/types'

const { t } = useI18n()

defineProps<{ rows: RecommendationRow[] }>()

function impactLabel(row: RecommendationRow): string | null {
  const parts: string[] = []
  if (row.impact_impressions_pct !== null) parts.push(`+${row.impact_impressions_pct}% ${t('recommendationsList.impressions')}`)
  if (row.impact_conversions_pct !== null) parts.push(`+${row.impact_conversions_pct}% ${t('recommendationsList.conversions')}`)
  return parts.length ? parts.join(' · ') : null
}
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <h2 class="mb-4 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
      {{ t('recommendationsList.title') }}
    </h2>

    <div v-if="!rows.length" class="py-10 text-center text-ink-faint">{{ t('recommendationsList.noData') }}</div>

    <div v-else class="space-y-3">
      <div v-for="row in rows" :key="row.id" class="rounded-lg border border-border bg-surface-raised p-4">
        <div class="mb-1 flex items-start justify-between gap-3">
          <div class="font-medium text-ink">{{ row.title }}</div>
          <span
            v-if="row.applied"
            class="shrink-0 rounded bg-flag-good-soft px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-flag-good"
          >
            {{ t('recommendationsList.applied') }}
          </span>
          <span
            v-else-if="row.dismissed"
            class="shrink-0 rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-faint"
          >
            {{ t('recommendationsList.dismissed') }}
          </span>
          <span
            v-else
            class="shrink-0 rounded bg-flag-caution-soft px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-flag-caution"
          >
            {{ t('recommendationsList.pending') }}
          </span>
        </div>
        <div class="mb-2 font-mono text-[11px] text-ink-faint">
          {{ row.campaign ?? t('recommendationsList.accountWide') }} · {{ formatDate(row.generated_date) }}
        </div>
        <p class="mb-2 text-sm text-ink-soft">{{ row.description }}</p>
        <div v-if="impactLabel(row)" class="font-mono text-[11px] text-ink-faint">
          {{ t('recommendationsList.estimatedImpact') }}: {{ impactLabel(row) }}
        </div>
      </div>
    </div>
  </div>
</template>
