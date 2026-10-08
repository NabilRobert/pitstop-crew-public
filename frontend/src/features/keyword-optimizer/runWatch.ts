import { onBeforeUnmount } from 'vue'
import type { SuggestionsResponse } from '../../shared/api/types'

// Keeping a page current without a reload. A run that starts by itself at the owner's set time, or one started from
// the page, should show up on its own: look quickly while a run is going, slowly otherwise, never in a hidden tab.
export const FAST_POLL_MS = 5_000
export const SLOW_POLL_MS = 60_000

/** A short fingerprint of what the page shows: the latest run and every suggestion with its status. Two responses
 * with the same fingerprint need no redraw. */
export function suggestionsSignature(d: SuggestionsResponse | null): string {
  if (!d) return ''
  const run = d.run ? `${d.run.id}|${d.run.status}|${d.run.finished_at ?? '-'}` : '-'
  return `${run}|${d.total}|${d.items.map((s) => `${s.id}:${s.status}`).join(',')}`
}

/** Runs `check` over and over until the component unmounts. `fast()` says whether to look quickly right now.
 * Call `start()` once the first load has finished. */
export function usePoller(check: () => Promise<void>, fast: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  function schedule() {
    if (stopped) return
    timer = setTimeout(async () => {
      if (typeof document === 'undefined' || !document.hidden) await check()
      schedule()
    }, fast() ? FAST_POLL_MS : SLOW_POLL_MS)
  }

  onBeforeUnmount(() => {
    stopped = true
    if (timer) clearTimeout(timer)
  })

  return { start: schedule }
}
