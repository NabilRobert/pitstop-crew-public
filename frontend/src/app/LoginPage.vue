<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { login } from '../shared/composables/auth'

const { t } = useI18n()

const username = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

async function submit() {
  submitting.value = true
  error.value = null
  try {
    await login(username.value.trim(), password.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-sm items-center px-6">
    <form class="w-full rounded-lg border border-border bg-surface p-6" @submit.prevent="submit">
      <div class="mb-4 flex items-center gap-3">
        <img src="/logo.png" alt="Pitstop" class="h-10 w-10 rounded-full" />
        <div>
          <h1 class="font-display text-lg font-bold text-ink">{{ t('login.title') }}</h1>
          <p class="text-xs text-ink-faint">{{ t('login.description') }}</p>
        </div>
      </div>

      <div class="mb-4">
        <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          {{ t('login.username') }}
        </label>
        <input
          v-model="username"
          type="text"
          autocomplete="username"
          required
          class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-rosso focus:outline-none"
        />
      </div>

      <div class="mb-5">
        <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          {{ t('login.password') }}
        </label>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-rosso focus:outline-none"
        />
      </div>

      <button
        type="submit"
        class="w-full rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="submitting"
      >
        {{ submitting ? t('login.submitting') : t('login.submit') }}
      </button>

      <div v-if="error" class="mt-4 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-3 py-2 text-sm text-flag-critical">
        {{ error }}
      </div>
    </form>
  </main>
</template>
