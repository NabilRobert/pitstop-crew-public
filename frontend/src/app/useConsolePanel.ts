import { ref, onMounted, onUnmounted, nextTick, type Ref } from 'vue'
import { BASE_URL } from '../shared/api/api'
import { token } from '../shared/composables/auth'
import type { ConsoleEvent } from '../shared/api/types'

export const LEVEL_COLOR: Record<string, string> = {
  info: 'text-ink-soft',
  warn: 'text-flag-caution',
  error: 'text-flag-critical',
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false })
}

// emitEvent's own message strings aren't consistently formatted (some start
// "Name: rest", some "Name rest" with no colon, some have no agent at all —
// see backend/src/pipeline/orchestrator.ts and agents/criticLoop.ts). This
// pulls the leading agent out of whichever shape it's in, for display, rather
// than changing every call site's message text.
const AGENT_DISPLAY: Record<string, string> = {
  Damon: 'Damon',
  Anna: 'Anna',
  Rico: 'Rico',
  Sammy: 'Sammy',
  Ciri: 'Ciri',
  Emil: 'Emil',
  // The backend uses the raw agent_type in a few messages instead of the
  // friendly name (e.g. "analysis returned an empty draft…").
  analysis: 'Anna',
  recommendation: 'Rico',
  summary: 'Sammy',
}
const AGENT_NAMES = Object.keys(AGENT_DISPLAY).join('|')
const WITH_COLON = new RegExp(`^(${AGENT_NAMES}): (.*)$`, 's')
const WITHOUT_COLON = new RegExp(`^(${AGENT_NAMES}) (.*)$`, 's')

export interface ParsedConsoleMessage {
  /** null for events with no agent (run start/end, top-level failures) — the
   * console then shows just the message, same as before this split. */
  agent: string | null
  text: string
}

export function parseConsoleMessage(message: string): ParsedConsoleMessage {
  const withColon = message.match(WITH_COLON)
  if (withColon) return { agent: AGENT_DISPLAY[withColon[1]], text: withColon[2] }
  const withoutColon = message.match(WITHOUT_COLON)
  if (withoutColon) return { agent: AGENT_DISPLAY[withoutColon[1]], text: withoutColon[2] }
  return { agent: null, text: message }
}

export function useConsolePanel(logElRef: Ref<HTMLElement | null>) {
  const events = ref<ConsoleEvent[]>([])

  let source: EventSource | null = null

  onMounted(() => {
    // Connect once, regardless of open/closed, so events aren't missed
    // while the panel is collapsed — only the rendered list is gated on `open`.
    source = new EventSource(`${BASE_URL}/console/stream?token=${token.value}`)
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
