<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '../../shared/utils/format'
import type { ChangeEventRow } from '../../shared/api/types'

const { t } = useI18n()

defineProps<{ rows: ChangeEventRow[] }>()
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <h2 class="mb-4 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
      {{ t('changeEventTimeline.title') }}
    </h2>

    <div v-if="!rows.length" class="py-10 text-center text-ink-faint">{{ t('changeEventTimeline.noData') }}</div>

    <ul v-else class="space-y-3">
      <li v-for="row in rows" :key="row.id" class="border-l-2 border-border py-1 pl-4">
        <div class="font-mono text-[11px] text-ink-faint">
          {{ formatDateTime(row.changed_at) }} · {{ row.campaign ?? t('recommendationsList.accountWide') }}
        </div>
        <div class="text-sm text-ink">
          <span class="font-medium">{{ row.resource_type }}</span>
          <span class="text-ink-faint"> — {{ row.change_operation }}</span>
          <span v-if="row.field_changed"> · {{ row.field_changed }}</span>
        </div>
        <div v-if="row.old_value || row.new_value" class="font-mono text-xs text-ink-soft">
          <span v-if="row.old_value">{{ row.old_value }} → </span>
          <span class="text-ink">{{ row.new_value ?? '—' }}</span>
        </div>
        <div class="font-mono text-[11px] text-ink-faint">{{ row.changed_by }}</div>
      </li>
    </ul>
  </div>
</template>
