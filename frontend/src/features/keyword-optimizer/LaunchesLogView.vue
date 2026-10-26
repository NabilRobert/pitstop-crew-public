<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LaunchListItem } from '../../shared/api/types'
import { formatDateTime } from '../../shared/utils/format'

// The audit log of launches (contract 3.6): every attempt, including validate-only checks and failures. Read-only,
// newest first, collapsed until opened. A server without it simply shows nothing.
const props = defineProps<{ items: LaunchListItem[]; startOpen?: boolean }>()
const { t } = useI18n()
const open = ref(props.startOpen ?? false)

const statusClass = (s: LaunchListItem['status']) =>
  s === 'created' ? 'text-flag-good' : s === 'failed' ? 'text-flag-critical' : 'text-ink-soft'
</script>

<template>
  <section class="mt-10" :aria-label="t('campaignsList.launches.title')">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        {{ t('campaignsList.launches.title') }} <span class="font-mono text-[11px]">{{ items.length }}</span>
      </h2>
      <button
        type="button"
        class="border border-border-strong px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink"
        :aria-expanded="open"
        @click="open = !open"
      >
        {{ open ? t('campaignsList.launches.hide') : t('campaignsList.launches.show') }}
      </button>
    </div>
    <p class="mt-1 max-w-3xl text-sm text-ink-soft">{{ t('campaignsList.launches.hint') }}</p>

    <template v-if="open">
      <p v-if="items.length === 0" class="mt-3 text-sm text-ink-faint">{{ t('campaignsList.launches.empty') }}</p>
      <ul v-else class="mt-3 divide-y divide-border border border-border bg-surface">
        <li v-for="(l, i) in items" :key="l.id ?? `v${i}`" class="px-4 py-3 text-sm">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="font-mono text-[11px] text-ink-faint">{{ formatDateTime(l.created_at) }}</span>
            <span class="font-mono text-[10px] font-bold uppercase tracking-wide" :class="statusClass(l.status)">{{ t(`campaignsList.launches.status.${l.status}`) }}</span>
            <span class="border border-border px-1.5 font-mono text-[10px] font-bold uppercase text-ink-soft">{{ t('campaignsList.launches.simulated') }}</span>
            <span v-if="l.validate_only" class="font-mono text-[10px] uppercase text-ink-faint">{{ t('campaignsList.launches.validateOnly') }}</span>
            <span class="font-bold text-ink">{{ l.campaign?.name ?? t('campaignsList.launches.suggestion', { id: l.suggestion_id }) }}</span>
          </div>
          <p class="mt-1 text-ink-soft">{{ t('campaignsList.launches.objects', { n: l.objects.length }) }}</p>
          <p v-for="m in l.messages" :key="m" class="text-ink-faint">{{ m }}</p>
        </li>
      </ul>
    </template>
  </section>
</template>
