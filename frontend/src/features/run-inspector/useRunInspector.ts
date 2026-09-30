import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import { api } from '../../shared/api/api'
import type { EventPayloads, RunTrace, TraceEvent } from '../../shared/api/types'

export interface TraceRow {
  event: TraceEvent
  depth: number
  hasChildren: boolean
  /** Position and width of the step's bar on the run's timeline, in percent. */
  left: number
  width: number
}

const POLL_MS = 3000

export function useRunInspector(runId: Ref<string>) {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const trace = ref<RunTrace | null>(null)

  const collapsed = reactive(new Set<number>())
  const expanded = reactive(new Set<number>())
  const payloads = reactive(new Map<number, EventPayloads | 'loading' | 'error'>())

  let timer: ReturnType<typeof setTimeout> | null = null

  async function load() {
    try {
      trace.value = await api.runTrace(runId.value)
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
    schedule()
  }

  // A run still in flight is re-read until it ends, so the tree fills in live.
  function schedule() {
    if (timer) clearTimeout(timer)
    timer = null
    if (trace.value?.run.status === 'running') timer = setTimeout(load, POLL_MS)
  }

  onMounted(load)
  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })
  watch(runId, () => {
    trace.value = null
    loading.value = true
    collapsed.clear()
    expanded.clear()
    payloads.clear()
    load()
  })

  const rows = computed<TraceRow[]>(() => {
    const events = trace.value?.events ?? []
    if (!events.length) return []
    const children = new Map<number | null, TraceEvent[]>()
    for (const e of events) {
      const list = children.get(e.parent_id) ?? []
      list.push(e)
      children.set(e.parent_id, list)
    }
    const t0 = Math.min(...events.map((e) => Date.parse(e.started_at)))
    const ends = events.map((e) => (e.ended_at ? Date.parse(e.ended_at) : Date.parse(e.started_at)))
    const total = Math.max(1, Math.max(...ends) - t0)
    const out: TraceRow[] = []
    const walk = (parent: number | null, depth: number) => {
      for (const e of children.get(parent) ?? []) {
        const start = Date.parse(e.started_at)
        const dur = e.duration_ms ?? 0
        out.push({
          event: e,
          depth,
          hasChildren: children.has(e.id),
          left: ((start - t0) / total) * 100,
          width: Math.max((dur / total) * 100, 0.4),
        })
        if (!collapsed.has(e.id)) walk(e.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  })

  function toggleChildren(id: number) {
    if (collapsed.has(id)) collapsed.delete(id)
    else collapsed.add(id)
  }

  async function toggleDetails(event: TraceEvent) {
    if (expanded.has(event.id)) {
      expanded.delete(event.id)
      return
    }
    expanded.add(event.id)
    if (event.payload_count > 0 && !payloads.has(event.id)) {
      payloads.set(event.id, 'loading')
      try {
        payloads.set(event.id, await api.eventPayloads(event.id))
      } catch {
        payloads.set(event.id, 'error')
      }
    }
  }

  return { loading, error, trace, rows, collapsed, expanded, payloads, toggleChildren, toggleDetails }
}
