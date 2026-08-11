<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { BASE_URL } from '../shared/api/api'
import { consoleOpen as open } from '../shared/composables/consoleState'

const { t } = useI18n()

const events = ref([])
const logEl = ref(null)

const LEVEL_COLOR = { info: 'text-ink-soft', warn: 'text-flag-caution', error: 'text-flag-critical' }

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false })
}

let source = null

onMounted(() => {
  // Connect once, regardless of open/closed, so events aren't missed
  // while the panel is collapsed — only the rendered list is gated on `open`.
  source = new EventSource(`${BASE_URL}/console/stream`)
  source.onmessage = (e) => {
    events.value.push(JSON.parse(e.data))
    if (events.value.length > 200) events.value.shift()
    nextTick(() => {
      if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
    })
  }
})

onUnmounted(() => source?.close())
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
    <button
      type="button"
      class="flex w-full items-center justify-between px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink"
      @click="open = !open"
    >
      <span class="flex items-center gap-2">
        <span class="h-1.5 w-1.5 rounded-full bg-flag-good" />
        {{ t('consolePanel.title') }}
      </span>
      <span>{{ open ? '▾' : '▸' }}</span>
    </button>
    <div v-if="open" ref="logEl" class="h-56 overflow-y-auto border-t border-border px-4 py-2 font-mono text-[11px]">
      <div v-if="!events.length" class="py-4 text-center text-ink-faint">{{ t('consolePanel.noActivity') }}</div>
      <div v-for="(e, i) in events" :key="i" class="py-0.5">
        <span class="text-ink-faint">{{ formatTime(e.timestamp) }}</span>
        <span :class="LEVEL_COLOR[e.level] ?? 'text-ink-soft'"> {{ e.message }}</span>
      </div>
    </div>
  </div>
</template>
