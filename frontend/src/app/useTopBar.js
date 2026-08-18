import { computed, inject } from 'vue'
import { useRoute } from 'vue-router'
import { setLocale, getLocale } from '../i18n/index.js'
import { api } from '../shared/api/api'

export function useTopBar() {
  const dataSource = inject('dataSource')
  const route = useRoute()

  // Manual prefix match instead of router-link's active-class: "/" as a
  // link path would otherwise match every route as a prefix.
  function isActive(linkPath) {
    return linkPath === '/' ? route.path === '/' : route.path.startsWith(linkPath)
  }

  const currentLocale = computed(() => getLocale())

  function switchLocale(locale) {
    if (locale === currentLocale.value) return
    setLocale(locale)
    // Fire-and-forget: keep scheduled/manual report generation in sync with the
    // UI language, but don't block the (already-instant) UI switch on the network.
    api.updateSettings({ report_language: locale }).catch((e) => {
      console.error('Failed to sync report_language setting:', e)
    })
  }

  return { dataSource, isActive, currentLocale, switchLocale }
}
