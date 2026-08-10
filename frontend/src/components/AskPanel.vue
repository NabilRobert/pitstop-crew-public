<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import { renderMarkdown } from '../lib/markdown'

const props = defineProps({
  outputId: { type: Number, required: true },
})

const history = ref([])
const question = ref('')
const loadingHistory = ref(true)
const asking = ref(false)
const error = ref(null)

onMounted(async () => {
  try {
    history.value = await api.askHistory(props.outputId)
  } catch (e) {
    error.value = e.message
  } finally {
    loadingHistory.value = false
  }
})

async function submit() {
  const q = question.value.trim()
  if (!q || asking.value) return
  asking.value = true
  error.value = null
  try {
    const result = await api.ask(props.outputId, q)
    history.value = result.history
    question.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    asking.value = false
  }
}
</script>

<template>
  <div>
    <div class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">Ask about this report</div>

    <div v-if="loadingHistory" class="mt-2 text-sm text-ink-faint">Loading history…</div>

    <template v-else>
      <div v-if="!history.length" class="mt-2 text-sm text-ink-faint">
        No questions yet — ask something about this report.
      </div>

      <div v-else class="mt-3 space-y-4">
        <div v-for="entry in history" :key="entry.id" class="space-y-1.5">
          <div class="flex items-baseline gap-2">
            <span class="font-medium text-ink">{{ entry.question }}</span>
            <span class="font-mono text-[10px] text-ink-faint">{{ formatDate(entry.created_at) }}</span>
          </div>
          <div class="agent-prose rounded-md bg-surface-raised px-3 py-2 text-sm" v-html="renderMarkdown(entry.answer)" />
        </div>
      </div>
    </template>

    <form class="mt-4 flex gap-2" @submit.prevent="submit">
      <input
        v-model="question"
        type="text"
        placeholder="e.g. why is the SUV segment outperforming?"
        class="flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-rosso focus:outline-none"
        :disabled="asking"
      />
      <button
        type="submit"
        class="shrink-0 rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="asking || !question.trim()"
      >
        {{ asking ? 'Asking…' : 'Ask' }}
      </button>
    </form>

    <div v-if="error" class="mt-2 text-sm text-flag-critical">{{ error }}</div>
  </div>
</template>
