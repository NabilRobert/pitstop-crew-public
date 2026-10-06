<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { keywordOptimizerApi } from './keywordOptimizerApi'

const props = defineProps<{ count: number }>()
const { t } = useI18n()

const busy = ref(false)
const message = ref<string | null>(null)
const failed = ref(false)

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function download(format: 'csv' | 'txt') {
  busy.value = true
  message.value = null
  failed.value = false
  try {
    const blob = await keywordOptimizerApi.exportNegatives(format)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `negative-keywords-${today()}.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    failed.value = true
    message.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function copy() {
  busy.value = true
  message.value = null
  failed.value = false
  try {
    const blob = await keywordOptimizerApi.exportNegatives('txt')
    await navigator.clipboard.writeText(await blob.text())
    message.value = t('keywordOptimizer.export.copied')
  } catch (e) {
    failed.value = true
    message.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mb-6 rounded-lg border border-border bg-surface p-5">
    <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('keywordOptimizer.export.title') }}</h2>
    <p class="mt-2 text-sm text-ink-soft">{{ t('keywordOptimizer.export.body', { n: props.count }) }}</p>
    <div class="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-md bg-rosso px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco hover:bg-rosso-dark disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="busy || props.count === 0"
        @click="download('csv')"
      >
        {{ t('keywordOptimizer.export.csv') }}
      </button>
      <button
        type="button"
        class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="busy || props.count === 0"
        @click="download('txt')"
      >
        {{ t('keywordOptimizer.export.txt') }}
      </button>
      <button
        type="button"
        class="rounded-md border border-border-strong px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="busy || props.count === 0"
        @click="copy"
      >
        {{ t('keywordOptimizer.export.copy') }}
      </button>
    </div>
    <p v-if="message" class="mt-2 text-sm" :class="failed ? 'text-flag-critical' : 'text-flag-good'" role="status">{{ message }}</p>
  </section>
</template>
