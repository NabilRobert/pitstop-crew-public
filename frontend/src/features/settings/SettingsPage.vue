<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../shared/api/api'

const { t } = useI18n()
const loading = ref(true)
const saving = ref(false)
const error = ref(null)
const saved = ref(false)

const dailyRunTime = ref('06:00')
const weeklyRunTime = ref('06:00')
const gradeForcesRevision = ref(false)
const reportRecipientEmail = ref('')
const reportLanguage = ref('en')

onMounted(async () => {
  try {
    const settings = await api.settings()
    dailyRunTime.value = settings.daily_run_time
    weeklyRunTime.value = settings.weekly_run_time
    gradeForcesRevision.value = settings.grade_forces_revision === 'true'
    reportRecipientEmail.value = settings.report_recipient_email
    reportLanguage.value = settings.report_language
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  error.value = null
  saved.value = false
  try {
    const settings = await api.updateSettings({
      daily_run_time: dailyRunTime.value,
      weekly_run_time: weeklyRunTime.value,
      grade_forces_revision: String(gradeForcesRevision.value),
      report_recipient_email: reportRecipientEmail.value.trim(),
      report_language: reportLanguage.value,
    })
    dailyRunTime.value = settings.daily_run_time
    weeklyRunTime.value = settings.weekly_run_time
    gradeForcesRevision.value = settings.grade_forces_revision === 'true'
    reportRecipientEmail.value = settings.report_recipient_email
    reportLanguage.value = settings.report_language
    saved.value = true
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-2xl px-6 py-8">
    <h1 class="mb-2 font-display text-2xl font-bold text-ink">{{ t('settings.title') }}</h1>
    <p class="mb-6 text-sm text-ink-faint">
      {{ t('settings.description') }}
    </p>

    <div v-if="loading" class="py-12 text-center text-ink-faint">{{ t('common.loading') }}</div>

    <template v-else>
      <div class="rounded-lg border border-border bg-surface p-5">
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              {{ t('settings.dailyRunTime') }}
            </label>
            <input
              v-model="dailyRunTime"
              type="time"
              class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-rosso focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              {{ t('settings.weeklyRunTime') }} <span class="normal-case text-ink-faint">{{ t('settings.mondaysSuffix') }}</span>
            </label>
            <input
              v-model="weeklyRunTime"
              type="time"
              class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-rosso focus:outline-none"
            />
          </div>
        </div>

        <div class="mt-5 border-t border-border pt-5">
          <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            {{ t('settings.reportRecipientEmail') }}
          </label>
          <input
            v-model="reportRecipientEmail"
            type="email"
            placeholder="you@example.com"
            class="w-full max-w-sm rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-rosso focus:outline-none"
          />
          <p class="mt-1 text-xs text-ink-faint">
            {{ t('settings.emailHelp') }}
          </p>
        </div>

        <div class="mt-5 border-t border-border pt-5">
          <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            {{ t('settings.reportLanguage') }}
          </label>
          <select
            v-model="reportLanguage"
            class="w-full max-w-sm rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-rosso focus:outline-none"
          >
            <option value="en">{{ t('settings.reportLanguageEn') }}</option>
            <option value="id">{{ t('settings.reportLanguageId') }}</option>
          </select>
          <p class="mt-1 text-xs text-ink-faint">
            {{ t('settings.reportLanguageHelp') }}
          </p>
        </div>

        <label class="mt-5 flex items-start gap-3 border-t border-border pt-5">
          <input v-model="gradeForcesRevision" type="checkbox" class="mt-0.5 h-4 w-4 accent-rosso" />
          <span class="text-sm text-ink-soft">
            <span class="font-medium text-ink">{{ t('settings.requireRevisionTitle') }}</span><br />
            {{ t('settings.requireRevisionDesc') }}
          </span>
        </label>

        <button
          type="button"
          class="mt-5 rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? t('settings.saving') : t('settings.save') }}
        </button>
        <span v-if="saved" class="ml-3 text-sm text-flag-good">{{ t('settings.saved') }}</span>
      </div>

      <div v-if="error" class="mt-4 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-3 text-sm text-flag-critical">
        {{ error }}
      </div>
    </template>
  </main>
</template>
