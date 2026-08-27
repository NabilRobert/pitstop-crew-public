<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '../utils/format'
import { renderMarkdown } from '../utils/markdown'
import { useAskPanel } from './useAskPanel'

const { t } = useI18n()

const props = defineProps({
  outputId: { type: Number, required: true },
})

const {
  history,
  question,
  loadingHistory,
  asking,
  error,
  voiceError,
  recording,
  transcribing,
  speaking,
  submit,
  toggleRecording,
  stopSpeaking,
} = useAskPanel(toRef(props, 'outputId'))
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

    <div v-if="asking" class="mt-3 flex items-center gap-2 text-sm text-ink-faint">
      <span class="flex gap-0.5">
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-rosso" />
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-rosso [animation-delay:150ms]" />
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-rosso [animation-delay:300ms]" />
      </span>
      {{ t('askPanel.generating') }}
    </div>

    <div v-if="speaking" class="mt-3 flex items-center gap-2 text-sm text-ink-faint">
      <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-flag-good" />
      {{ t('askPanel.speaking') }}
      <button type="button" class="font-mono text-[10px] uppercase tracking-wide text-ink-faint underline hover:text-ink" @click="stopSpeaking">
        {{ t('askPanel.stopSpeaking') }}
      </button>
    </div>

    <form class="mt-4 flex gap-2" @submit.prevent="submit">
      <button
        type="button"
        class="shrink-0 rounded-md border px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
        :class="recording ? 'border-flag-critical bg-flag-critical-soft text-flag-critical' : 'border-border text-ink-soft hover:text-ink'"
        :disabled="asking || transcribing"
        :title="recording ? t('askPanel.stopRecording') : t('askPanel.startRecording')"
        @click="toggleRecording"
      >
        {{ recording ? '⏹' : '🎙' }}
      </button>
      <input
        v-model="question"
        type="text"
        :placeholder="transcribing ? t('askPanel.transcribing') : t('askPanel.placeholder')"
        class="flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-rosso focus:outline-none"
        :disabled="asking || recording || transcribing"
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
    <div v-if="voiceError" class="mt-2 text-sm text-flag-critical">{{ voiceError }}</div>
  </div>
</template>
