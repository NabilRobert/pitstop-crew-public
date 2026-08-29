<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '../../shared/utils/format'
import { renderMarkdown } from '../../shared/utils/markdown'
import VoiceOrb from '../../shared/components/VoiceOrb.vue'
import { useAska } from './useAska'

const { t } = useI18n()

const waveformContainer = ref<HTMLElement | null>(null)
const {
  visibleConversations,
  conversationSearch,
  conversationSort,
  activeConversationId,
  messages,
  displayMessages,
  loadingConversations,
  question,
  state,
  error,
  voiceFallbackMessageId,
  toggleRecording,
  submitTyped,
  stop,
  selectConversation,
  startNewConversation,
  renameConversation,
  deleteConversation,
} = useAska(waveformContainer)

function confirmDelete(conversationId: number, title: string | null) {
  const label = title || t('aska.untitledConversation')
  if (window.confirm(t('aska.confirmDelete', { title: label }))) {
    deleteConversation(conversationId)
  }
}

// Inline title editing — only one row editable at a time.
const editingId = ref<number | null>(null)
const editingTitle = ref('')
const editInputRefs = ref<Record<number, HTMLInputElement | null>>({})

async function startEditing(conversationId: number, currentTitle: string | null) {
  editingId.value = conversationId
  editingTitle.value = currentTitle ?? ''
  await nextTick()
  editInputRefs.value[conversationId]?.focus()
  editInputRefs.value[conversationId]?.select()
}

async function commitEditing() {
  if (editingId.value === null) return
  const id = editingId.value
  const title = editingTitle.value
  editingId.value = null
  await renameConversation(id, title)
}

function cancelEditing() {
  editingId.value = null
}

const stateLabelKey = {
  idle: 'aska.stateIdle',
  listening: 'aska.stateListening',
  thinking: 'aska.stateThinking',
  speaking: 'aska.stateSpeaking',
} as const
</script>

<template>
  <div class="flex">
    <!-- Ambient background glow while Aska is listening/thinking/speaking —
         built off --color-rosso via color-mix() rather than fixed hex, so
         it re-themes for free: warm red/yellow in Ferrari, blue in the
         Blueprint light theme, matching each theme's own accent. -->
    <div class="aska-glow" :class="{ 'is-active': state !== 'idle' }" />

    <!-- Sidebar — conversation list, Claude/ChatGPT-style, not stacked
         inline below the orb the way the first version had it. Sticky +
         full viewport height so it (and the compose controls in <main>)
         stay put while a long message history scrolls, instead of the
         whole page scrolling as one column. -->
    <aside class="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface px-3 py-4">
      <button
        type="button"
        class="mb-3 flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft hover:border-rosso hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="state !== 'idle'"
        @click="startNewConversation"
      >
        + {{ t('aska.newConversation') }}
      </button>

      <input
        v-if="!loadingConversations"
        v-model="conversationSearch"
        type="text"
        :placeholder="t('aska.searchConversations')"
        class="mb-2 w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-rosso focus:outline-none"
      />

      <select
        v-if="!loadingConversations"
        v-model="conversationSort"
        class="mb-3 w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-ink"
      >
        <option value="recent">{{ t('aska.sortRecent') }}</option>
        <option value="oldest">{{ t('aska.sortOldest') }}</option>
        <option value="title">{{ t('aska.sortTitle') }}</option>
      </select>

      <div v-if="loadingConversations" class="px-2 text-xs text-ink-faint">{{ t('common.loading') }}</div>

      <div v-else-if="!visibleConversations.length" class="px-2 text-xs text-ink-faint">
        {{ t('aska.noConversationsMatch') }}
      </div>

      <nav v-else class="flex-1 space-y-0.5 overflow-y-auto">
        <div v-for="c in visibleConversations" :key="c.id" class="group/item relative">
          <input
            v-if="editingId === c.id"
            :ref="(el) => { editInputRefs[c.id] = el as HTMLInputElement | null }"
            v-model="editingTitle"
            type="text"
            class="block w-full rounded-md border border-rosso bg-surface-raised px-2 py-2 text-sm text-ink focus:outline-none"
            @keydown.enter="commitEditing"
            @keydown.escape="cancelEditing"
            @blur="commitEditing"
          />
          <button
            v-else
            type="button"
            class="flex w-full items-center justify-between gap-1 rounded-md px-2 py-2 text-left text-sm transition-colors"
            :class="c.id === activeConversationId ? 'bg-surface-raised text-ink' : 'text-ink-soft hover:bg-surface-raised hover:text-ink'"
            @click="selectConversation(c.id)"
          >
            <span class="truncate">{{ c.title || t('aska.untitledConversation') }}</span>
            <span class="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/item:opacity-100">
              <span
                role="button"
                :aria-label="t('aska.renameConversation')"
                class="rounded p-1 text-ink-faint hover:text-ink"
                @click.stop="startEditing(c.id, c.title)"
              >
                ✎
              </span>
              <span
                role="button"
                :aria-label="t('aska.deleteConversation')"
                class="rounded p-1 text-ink-faint hover:text-rosso"
                @click.stop="confirmDelete(c.id, c.title)"
              >
                🗑
              </span>
            </span>
          </button>
        </div>
      </nav>
    </aside>

    <!-- Main panel — orb, waveform, input, and the active conversation's
         messages. The messages panel below is height-capped with its own
         scroll (see displayMessages, newest-first) so the latest answer is
         always the first thing visible there — no more hunting for it at
         the bottom of a growing, page-scrolled thread. -->
    <main class="flex flex-1 flex-col items-center px-6 py-10">
      <h1 class="mb-1 font-display text-2xl font-bold text-ink">{{ t('aska.title') }}</h1>
      <p class="mb-8 text-center text-sm text-ink-faint">{{ t('aska.subtitle') }}</p>

      <button
        type="button"
        class="group flex flex-col items-center gap-4 disabled:cursor-not-allowed"
        :disabled="state === 'thinking' || state === 'speaking'"
        @click="toggleRecording"
      >
        <VoiceOrb :state="state" />
        <span class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          {{ t(stateLabelKey[state]) }}
        </span>
      </button>

      <button
        v-if="state === 'listening' || state === 'speaking'"
        type="button"
        class="mt-4 rounded-full bg-rosso px-5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco hover:bg-rosso-dark"
        @click="stop"
      >
        {{ t('aska.stop') }}
      </button>

      <div
        ref="waveformContainer"
        class="mt-6 h-20 w-full"
        :class="state === 'listening' || state === 'speaking' ? 'opacity-100' : 'opacity-0'"
      />

      <form class="mt-6 flex w-full gap-2" @submit.prevent="submitTyped">
        <input
          v-model="question"
          type="text"
          :placeholder="t('aska.placeholder')"
          class="flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-rosso focus:outline-none"
          :disabled="state !== 'idle'"
        />
        <button
          type="submit"
          class="shrink-0 rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="state !== 'idle' || !question.trim()"
        >
          {{ t('aska.send') }}
        </button>
      </form>

      <div v-if="error" class="mt-4 w-full rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-4 py-3 text-sm text-flag-critical">
        {{ error }}
      </div>

      <div class="mt-10 w-full">
        <div v-if="!loadingConversations && !messages.length" class="text-sm text-ink-faint">{{ t('aska.noHistory') }}</div>

        <div v-else class="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          <div
            v-for="entry in displayMessages"
            :key="entry.id"
            class="space-y-1.5 rounded-lg border p-4 transition-colors"
            :class="entry.id === voiceFallbackMessageId ? 'border-rosso bg-surface-raised' : 'border-border bg-surface'"
          >
            <div class="flex items-baseline gap-2">
              <span class="font-medium text-ink">{{ entry.question }}</span>
              <span class="font-mono text-[10px] text-ink-faint">{{ formatDate(entry.created_at) }}</span>
            </div>
            <p v-if="entry.id === voiceFallbackMessageId" class="text-xs italic text-rosso">
              {{ t('aska.voiceUnavailable') }}
            </p>
            <div class="agent-prose text-sm" v-html="renderMarkdown(entry.answer)" />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.aska-glow {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(
    ellipse 900px 700px at 60% 25%,
    color-mix(in srgb, var(--color-rosso) 22%, transparent) 0%,
    transparent 70%
  );
  transition: opacity 0.6s ease;
}

.aska-glow.is-active {
  opacity: 1;
  animation: aska-glow-pulse 2.4s ease-in-out infinite;
}

@keyframes aska-glow-pulse {
  0%,
  100% {
    opacity: 0.65;
  }
  50% {
    opacity: 1;
  }
}
</style>
