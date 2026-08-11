import { ref } from 'vue'

// Shared by any page that opens a ReportDrawer for Why-Trail/Ask content —
// avoids duplicating the same few lines of state on every page that needs it.
export function useReportDrawer() {
  const activeDrawer = ref(null) // { type: 'why-trail' | 'ask', outputId: number } | null

  function openDrawer(type, outputId) {
    activeDrawer.value = { type, outputId }
  }

  function closeDrawer() {
    activeDrawer.value = null
  }

  return { activeDrawer, openDrawer, closeDrawer }
}
