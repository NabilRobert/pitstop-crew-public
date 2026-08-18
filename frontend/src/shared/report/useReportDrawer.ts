import { ref } from 'vue'

export interface ActiveDrawer {
  type: 'why-trail' | 'ask'
  outputId: number
}

// Shared by any page that opens a ReportDrawer for Why-Trail/Ask content —
// avoids duplicating the same few lines of state on every page that needs it.
export function useReportDrawer() {
  const activeDrawer = ref<ActiveDrawer | null>(null)

  function openDrawer(type: ActiveDrawer['type'], outputId: number) {
    activeDrawer.value = { type, outputId }
  }

  function closeDrawer() {
    activeDrawer.value = null
  }

  return { activeDrawer, openDrawer, closeDrawer }
}
