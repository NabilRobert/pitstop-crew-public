import { ref, onMounted, onUnmounted, nextTick, type Ref } from 'vue'
import { BASE_URL } from '../shared/api/api'
import type { ConsoleEvent } from '../shared/api/types'

export const LEVEL_COLOR: Record<string, string> = {
  info: 'text-ink-soft',
  warn: 'text-flag-caution',
  error: 'text-flag-critical',
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false })
}

export function useConsolePanel(logElRef: Ref<HTMLElement | null>) {
  const events = ref<ConsoleEvent[]>([])

  let source: EventSource | null = null

  onMounted(() => {
    // Connect once, regardless of open/closed, so events aren't missed
    // while the panel is collapsed — only the rendered list is gated on `open`.
    source = new EventSource(`${BASE_URL}/console/stream`)
    source.onmessage = (e) => {
      events.value.push(JSON.parse(e.data))
      if (events.value.length > 200) events.value.shift()
      nextTick(() => {
        if (logElRef.value) logElRef.value.scrollTop = logElRef.value.scrollHeight
      })
    }
  })

  onUnmounted(() => source?.close())

  return { events }
}
