<script setup>
import { ref, inject, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../shared/api/api'
import { formatDate } from '../../shared/utils/format'

// Matches demo_state_overrides' CHECK constraint in schema.sql.
const STATES = ['good', 'bad', 'standstill', 'volatile']

const { t } = useI18n()
const dataSource = inject('dataSource')

const overrides = ref([])
const loading = ref(true)
const error = ref(null)
const saving = ref(false)

const newDate = ref('')
const newState = ref(STATES[0])

async function load() {
  loading.value = true
  error.value = null
  try {
    const map = await api.timeMachineOverrides()
    overrides.value = Object.entries(map)
      .map(([date, forced_state]) => ({ date, forced_state }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function setOverride() {
  if (!newDate.value) return
  saving.value = true
  error.value = null
  try {
    await api.setTimeMachineOverride(newDate.value, newState.value)
    newDate.value = ''
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function clearOverride(date) {
  try {
    await api.clearTimeMachineOverride(date)
    await load()
  } catch (e) {
    error.value = e.message
  }
}

onMounted(() => {
  if (dataSource?.value === 'demo') load()
  else loading.value = false
})
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
