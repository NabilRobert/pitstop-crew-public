<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'

const loading = ref(true)
const saving = ref(false)
const error = ref(null)
const saved = ref(false)

const dailyRunTime = ref('06:00')
const weeklyRunTime = ref('06:00')
const gradeForcesRevision = ref(false)
const reportRecipientEmail = ref('')

onMounted(async () => {
  try {
    const settings = await api.settings()
    dailyRunTime.value = settings.daily_run_time
    weeklyRunTime.value = settings.weekly_run_time
    gradeForcesRevision.value = settings.grade_forces_revision === 'true'
    reportRecipientEmail.value = settings.report_recipient_email
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
    })
    dailyRunTime.value = settings.daily_run_time
    weeklyRunTime.value = settings.weekly_run_time
    gradeForcesRevision.value = settings.grade_forces_revision === 'true'
    reportRecipientEmail.value = settings.report_recipient_email
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
    <h1 class="mb-2 font-display text-2xl font-bold text-ink">Settings</h1>
    <p class="mb-6 text-sm text-ink-faint">
      Controls when the daily and weekly pipeline (Anna → Rico → Sammy) fires. Times are server-local,
      matching whatever timezone the VPS is set to — not UTC, not your browser's timezone.
    </p>

    <div v-if="loading" class="py-12 text-center text-ink-faint">Loading…</div>

    <template v-else>
      <div class="rounded-lg border border-border bg-surface p-5">
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              Daily run time
            </label>
            <input
              v-model="dailyRunTime"
              type="time"
              class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-rosso focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              Weekly run time <span class="normal-case text-ink-faint">(Mondays)</span>
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
            Report recipient email
          </label>
          <input
            v-model="reportRecipientEmail"
            type="email"
            placeholder="you@example.com"
            class="w-full max-w-sm rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-rosso focus:outline-none"
          />
          <p class="mt-1 text-xs text-ink-faint">
            Every generated report — scheduled or "Generate report now" — gets emailed here. Leave blank to skip
            email and just log the report instead.
          </p>
        </div>

        <label class="mt-5 flex items-start gap-3 border-t border-border pt-5">
          <input v-model="gradeForcesRevision" type="checkbox" class="mt-0.5 h-4 w-4 accent-rosso" />
          <span class="text-sm text-ink-soft">
            <span class="font-medium text-ink">Require revision on a D/F critic grade</span><br />
            The critic already revises when it flags real issues. This also forces a revision whenever the grade is
            D or F, even on the rare case the critic didn't otherwise flag anything — belt and suspenders, capped by
            the same 2-revision limit.
          </span>
        </label>

        <button
          type="button"
          class="mt-5 rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <span v-if="saved" class="ml-3 text-sm text-flag-good">Saved.</span>
      </div>

      <div v-if="error" class="mt-4 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-3 text-sm text-flag-critical">
        {{ error }}
      </div>
    </template>
  </main>
</template>
