<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatDate } from '../../shared/utils/format'
import StatusPill from '../../shared/components/StatusPill.vue'
import { useReportsList, STRIP_COLOR } from './useReportsList'

const { t } = useI18n()
const {
  period,
  reports,
  loading,
  error,
  generating,
  generateError,
  stripReports,
  generateNow,
  autoReportsEnabled,
  autoReportsSaving,
  toggleAutoReports,
} = useReportsList()
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-2xl font-bold text-ink">{{ t('reportsList.title') }}</h1>

      <div class="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          :aria-checked="autoReportsEnabled"
          :disabled="autoReportsSaving"
          class="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          :title="t('reportsList.autoReportsTooltip')"
          @click="toggleAutoReports"
        >
          <span class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            {{ t('reportsList.autoReports') }}
          </span>
          <span
            class="relative h-4 w-7 rounded-full transition-colors"
            :class="autoReportsEnabled ? 'bg-flag-good' : 'bg-border-strong'"
          >
            <span
              class="absolute top-0.5 h-3 w-3 rounded-full bg-bianco transition-transform"
              :class="autoReportsEnabled ? 'translate-x-3.5' : 'translate-x-0.5'"
            />
          </span>
        </button>
        <div class="flex rounded-md border border-border bg-surface p-1">
          <button
            type="button"
            class="rounded px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
            :class="period === 'daily' ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            @click="period = 'daily'"
          >
            {{ t('common.periods.daily') }}
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
            :class="period === 'weekly' ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            @click="period = 'weekly'"
          >
            {{ t('common.periods.weekly') }}
          </button>
        </div>
        <button
          type="button"
          class="rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="generating"
          @click="generateNow"
        >
          {{ generating ? t('reportsList.generating') : t('reportsList.generateNow') }}
        </button>
      </div>
    </div>

    <div v-if="generateError" class="mb-4 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-3 text-sm text-flag-critical">
      {{ generateError }}
    </div>

    <div v-if="loading" class="py-24 text-center text-ink-faint">{{ t('reportsList.loading') }}</div>

    <div
      v-else-if="error"
      class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical"
    >
      {{ t('common.couldNotReachBackend', { error }) }}
    </div>

    <div v-else-if="!reports.length" class="py-24 text-center text-ink-faint">
      {{ t('reportsList.noReports', { period: t(`common.periods.${period}`).toLowerCase() }) }}
    </div>

    <template v-else>
      <div class="mb-6 flex items-end gap-[3px] rounded-lg border border-border bg-surface px-4 py-3">
        <router-link
          v-for="report in stripReports"
          :key="`strip-${report.id}`"
          :to="`/reports/${period}/${report.id}`"
          class="h-6 flex-1 rounded-sm opacity-80 transition-opacity hover:opacity-100"
          :style="{ backgroundColor: STRIP_COLOR[report.status] ?? 'var(--color-ink-faint)' }"
          :title="`${formatDate(report.report_date)} — ${report.status}`"
        />
      </div>

      <div class="space-y-3">
      <router-link
        v-for="report in reports"
        :key="report.id"
        :to="`/reports/${period}/${report.id}`"
        class="block rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:border-border-strong hover:bg-surface-raised"
      >
        <div class="flex items-center justify-between">
          <span class="font-display text-sm font-bold text-ink">{{ formatDate(report.report_date) }}</span>
          <StatusPill :status="report.status" />
        </div>
        <p class="mt-2 line-clamp-2 text-sm text-ink-soft">{{ report.preview }}</p>
      </router-link>
      </div>
    </template>
  </main>
</template>
