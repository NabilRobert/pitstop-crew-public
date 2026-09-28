<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Line } from 'vue-chartjs'
import { formatDate } from '../../shared/utils/format'
import { renderMarkdown } from '../../shared/utils/markdown'
import { useLearning } from './useLearning'

const { t } = useI18n()
const { loading, error, flagRate, suggestions, chartData, chartOptions } = useLearning()
</script>

<template>
  <main class="mx-auto max-w-4xl px-6 py-8">
    <h1 class="mb-2 font-display text-2xl font-bold text-ink">{{ t('learning.title') }}</h1>
    <p class="mb-6 text-sm text-ink-faint">
      {{ t('learning.description') }}
    </p>

    <div v-if="loading" class="py-24 text-center text-ink-faint">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-4 text-flag-critical">
      {{ t('common.couldNotReachBackend', { error }) }}
    </div>

    <template v-else>
      <div class="rounded-lg border border-border bg-surface p-5">
        <h2 class="mb-1 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
          {{ t('learning.flagRateTitle') }}
        </h2>
        <p class="mb-4 text-xs text-ink-faint">
          {{ t('learning.flagRateDesc') }}
        </p>
        <div class="h-56">
          <Line v-if="flagRate.length" :data="chartData" :options="chartOptions" />
          <div v-else class="flex h-full items-center justify-center text-ink-faint">{{ t('learning.noReportsYet') }}</div>
        </div>
      </div>

      <div class="mt-8 rounded-lg border border-border bg-surface p-5">
        <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('learning.gradingCriteriaTitle') }}</h2>
        <div class="space-y-2 text-sm text-ink-soft">
          <p><span class="font-bold text-flag-good">{{ t('learning.grades.a.label') }}</span> {{ t('learning.grades.a.desc') }}</p>
          <p><span class="font-bold text-flag-good">{{ t('learning.grades.b.label') }}</span> {{ t('learning.grades.b.desc') }}</p>
          <p><span class="font-bold text-flag-caution">{{ t('learning.grades.c.label') }}</span> {{ t('learning.grades.c.desc') }}</p>
          <p><span class="font-bold text-flag-critical">{{ t('learning.grades.d.label') }}</span> {{ t('learning.grades.d.desc') }}</p>
          <p><span class="font-bold text-flag-critical">{{ t('learning.grades.f.label') }}</span> {{ t('learning.grades.f.desc') }}</p>
        </div>
        <p class="mt-4 border-t border-border pt-4 text-sm text-ink-soft">
          <span class="font-bold text-ink">{{ t('learning.approvalRuleTitle') }}</span> {{ t('learning.approvalRuleBody') }}
        </p>
      </div>

      <h2 class="mb-3 mt-8 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        {{ t('learning.weeklySuggestionsTitle') }}
      </h2>
      <div v-if="!suggestions.length" class="rounded-lg border border-border bg-surface px-5 py-10 text-center text-ink-faint">
        {{ t('learning.noSuggestions') }}
      </div>
      <div v-else class="space-y-4">
        <div v-for="s in suggestions" :key="s.id" class="rounded-lg border border-border bg-surface p-5">
          <div class="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ t('learning.weekOf', { date: formatDate(s.week_of) }) }}
          </div>
          <div class="agent-prose" v-html="renderMarkdown(s.content)" />
        </div>
      </div>
    </template>
  </main>
</template>
