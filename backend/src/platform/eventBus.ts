// Minimal in-process pub/sub backing the live console panel — realizes
// PROJECT.md's never-built "Visible agent pipeline trace" Standout
// Feature as a real-time log instead of a step-by-step wizard UI. In-
// memory and single-process is sufficient: this app already has no
// multi-instance/horizontal-scaling concern anywhere else (plain
// crontab over a scheduler, no Redis anywhere).

export interface ConsoleEvent {
  seq: number // monotonic, assigned at emit time, never resets — backs SSE's id:/Last-Event-ID resume
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
  runId?: number
}

const BUFFER_SIZE = 200
const buffer: ConsoleEvent[] = []
const subscribers = new Set<(event: ConsoleEvent) => void>()
let nextSeq = 1

export function emitEvent(message: string, level: ConsoleEvent['level'] = 'info', runId?: number): void {
  const event: ConsoleEvent = { seq: nextSeq++, timestamp: new Date().toISOString(), level, message, runId }
  buffer.push(event)
  if (buffer.length > BUFFER_SIZE) buffer.shift()
  for (const subscriber of subscribers) subscriber(event)
}

export function getRecentEvents(): ConsoleEvent[] {
  return [...buffer]
}

export function subscribe(callback: (event: ConsoleEvent) => void): () => void {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}
