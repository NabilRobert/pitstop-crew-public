<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PERIOD_OPTIONS } from './useDashboard'

// The 1W-5Y period buttons, shared by the dashboard, the campaigns list and a campaign's page so
// all three read the same way. The parent owns the number of days (v-model).
const days = defineModel<number>({ required: true })
const { t } = useI18n()
</script>

<template>
  <div class="nav-scroll flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1" role="group" :aria-label="t('dashboard.periodLabel')">
    <button
      v-for="opt in PERIOD_OPTIONS"
      :key="opt.days"
      type="button"
      class="shrink-0 rounded-sm px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
      :class="days === opt.days ? 'bg-rosso text-bianco' : 'text-ink-faint hover:text-ink'"
      :aria-pressed="days === opt.days"
      @click="days = opt.days"
    >
      {{ t(opt.labelKey) }}
    </button>
  </div>
</template>
