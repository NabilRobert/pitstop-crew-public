// Minimal in-process pub/sub backing the live console panel — realizes
// PROJECT.md's never-built "Visible agent pipeline trace" Standout
// Feature as a real-time log instead of a step-by-step wizard UI. In-
// memory and single-process is sufficient: this app already has no
// multi-instance/horizontal-scaling concern anywhere else (plain
// crontab over a scheduler, no Redis anywhere).

export interface ConsoleEvent {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

const BUFFER_SIZE = 200
const buffer: ConsoleEvent[] = []
const subscribers = new Set<(event: ConsoleEvent) => void>()

export function emitEvent(message: string, level: ConsoleEvent['level'] = 'info'): void {
  const event: ConsoleEvent = { timestamp: new Date().toISOString(), level, message }
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
