<script setup>
import { useI18n } from 'vue-i18n'
import { formatDate } from '../../shared/utils/format'
import { STATES } from './states'
import { useTimeMachine } from './useTimeMachine'

const { t } = useI18n()
const { dataSource, overrides, loading, error, saving, newDate, newState, setOverride, clearOverride } =
  useTimeMachine()
</script>

<template>
  <main class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="mb-2 font-display text-2xl font-bold text-ink">{{ t('timeMachine.title') }}</h1>
    <p class="mb-6 text-sm text-ink-faint">
      {{ t('timeMachine.description') }}
    </p>

    <div v-if="dataSource !== 'demo'" class="rounded-lg border border-border bg-surface px-5 py-10 text-center text-ink-faint">
      {{ t('timeMachine.demoOnly') }}
    </div>

    <template v-else>
      <div class="rounded-lg border border-border bg-surface p-5">
        <div class="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">{{ t('timeMachine.setOverride') }}</div>
        <form class="mt-3 flex flex-wrap items-end gap-3" @submit.prevent="setOverride">
          <div>
            <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">{{ t('timeMachine.dateLabel') }}</label>
            <input
              v-model="newDate"
              type="date"
              required
              class="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-rosso focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">{{ t('timeMachine.stateLabel') }}</label>
            <select
              v-model="newState"
              class="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm capitalize text-ink focus:border-rosso focus:outline-none"
            >
              <option v-for="s in STATES" :key="s" :value="s">{{ t(`timeMachine.states.${s}`) }}</option>
            </select>
          </div>
          <button
            type="submit"
            class="rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="saving || !newDate"
          >
            {{ saving ? t('timeMachine.setting') : t('timeMachine.setOverrideButton') }}
          </button>
        </form>
      </div>

      <h2 class="mb-3 mt-8 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('timeMachine.activeOverrides') }}</h2>

      <div v-if="loading" class="py-12 text-center text-ink-faint">{{ t('common.loading') }}</div>
      <div v-else-if="!overrides.length" class="rounded-lg border border-border bg-surface px-5 py-10 text-center text-ink-faint">
        {{ t('timeMachine.noOverrides') }}
      </div>
      <div v-else class="overflow-hidden rounded-lg border border-border bg-surface">
        <div
          v-for="o in overrides"
          :key="o.date"
          class="flex items-center justify-between border-b border-border/60 px-5 py-3 last:border-0"
        >
          <div class="flex items-center gap-3">
            <span class="font-medium text-ink">{{ formatDate(o.date) }}</span>
            <span class="rounded-full border border-border-strong px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide capitalize text-ink-soft">
              {{ t(`timeMachine.states.${o.forced_state}`) }}
            </span>
          </div>
          <button
            type="button"
            class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-flag-critical"
            @click="clearOverride(o.date)"
          >
            {{ t('timeMachine.clear') }}
          </button>
        </div>
      </div>
    </template>

    <div v-if="error" class="mt-4 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-3 text-sm text-flag-critical">
      {{ error }}
    </div>
  </main>
</template>
