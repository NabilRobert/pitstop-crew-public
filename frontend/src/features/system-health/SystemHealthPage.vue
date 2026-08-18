<script setup>
import { useI18n } from 'vue-i18n'
import { formatDateTime, formatMicrosAsUSD } from '../../shared/utils/format'
import RunStatusPill from './RunStatusPill.vue'
import { useSystemHealth } from './useSystemHealth'

const { t } = useI18n()
const { health, loading, error, switchStatus } = useSystemHealth()
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <h1 class="mb-6 font-display text-2xl font-bold text-ink">{{ t('systemHealth.title') }}</h1>

    <div v-if="loading" class="py-24 text-center text-ink-faint">{{ t('common.loading') }}</div>

    <div
      v-else-if="error"
      class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical"
    >
      {{ t('common.couldNotReachBackend', { error }) }}
    </div>

    <template v-else>
      <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="rounded-lg border border-border bg-surface p-5">
          <div class="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
            {{ t('systemHealth.lastSuccessfulRun') }}
          </div>
          <div class="mt-2 font-display text-xl font-bold text-ink">
            {{ formatDateTime(health.last_successful_daily_run?.finished_at) }}
          </div>
        </div>

        <div class="rounded-lg border border-border bg-surface p-5">
          <div class="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
            {{ t('systemHealth.deadManSwitch') }}
          </div>
          <div class="mt-2 flex items-center gap-2">
            <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: `var(--color-${switchStatus.color})` }" />
            <span class="font-display text-xl font-bold" :style="{ color: `var(--color-${switchStatus.color})` }">
              {{ switchStatus.label }}
            </span>
          </div>
        </div>
      </div>

      <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('systemHealth.recentRuns') }}</h2>
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-left">
          <thead>
            <tr class="border-b border-border">
              <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('systemHealth.columns.type') }}</th>
              <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('systemHealth.columns.started') }}</th>
              <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('systemHealth.columns.finished') }}</th>
              <th class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('systemHealth.columns.status') }}</th>
              <th class="px-4 py-3 text-right font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('systemHealth.columns.cost') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="run in health.recent_runs" :key="run.id">
              <tr class="border-b border-border/60 last:border-0 hover:bg-surface-raised">
                <td class="px-4 py-3 font-medium capitalize text-ink">{{ run.run_type.replace('_', ' ') }}</td>
                <td class="px-4 py-3 text-ink-soft">{{ formatDateTime(run.started_at) }}</td>
                <td class="px-4 py-3 text-ink-soft">{{ formatDateTime(run.finished_at) }}</td>
                <td class="px-4 py-3"><RunStatusPill :status="run.status" /></td>
                <td class="px-4 py-3 text-right tabular-nums text-ink-soft">{{ formatMicrosAsUSD(run.cost_usd_micros) }}</td>
              </tr>
              <tr v-if="run.error_message" class="border-b border-border/60 last:border-0">
                <td colspan="5" class="px-4 pb-3 text-sm text-flag-critical">{{ run.error_message }}</td>
              </tr>
            </template>
            <tr v-if="!health.recent_runs.length">
              <td colspan="5" class="px-4 py-8 text-center text-ink-faint">{{ t('systemHealth.noRuns') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </main>
</template>
