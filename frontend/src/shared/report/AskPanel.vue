<script setup>
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '../utils/format'
import { renderMarkdown } from '../utils/markdown'
import { useAskPanel } from './useAskPanel'

const { t } = useI18n()

const props = defineProps({
  outputId: { type: Number, required: true },
})

const { history, question, loadingHistory, asking, error, submit } = useAskPanel(toRef(props, 'outputId'))
</script>

<template>
  <div>
    <div class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">{{ t('askPanel.title') }}</div>

    <div v-if="loadingHistory" class="mt-2 text-sm text-ink-faint">{{ t('askPanel.loadingHistory') }}</div>

    <template v-else>
      <div v-if="!history.length" class="mt-2 text-sm text-ink-faint">
        {{ t('askPanel.noHistory') }}
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
        :placeholder="t('askPanel.placeholder')"
        class="flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-rosso focus:outline-none"
        :disabled="asking"
      />
      <button
        type="submit"
        class="shrink-0 rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="asking || !question.trim()"
      >
        {{ asking ? t('askPanel.asking') : t('askPanel.submit') }}
      </button>
    </form>

    <div v-if="error" class="mt-2 text-sm text-flag-critical">{{ error }}</div>
  </div>
</template>
