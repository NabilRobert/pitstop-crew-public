import { computed, inject, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { setLocale, getLocale, type Locale } from '../i18n/index.js'
import { api } from '../shared/api/api'
import { logout } from '../shared/composables/auth'

export function useTopBar() {
  const dataSource = inject<Ref<string>>('dataSource')
  const route = useRoute()

  // Manual prefix match instead of router-link's active-class: "/" as a
  // link path would otherwise match every route as a prefix.
  function isActive(linkPath: string): boolean {
    return linkPath === '/' ? route.path === '/' : route.path.startsWith(linkPath)
  }

  const currentLocale = computed(() => getLocale())

  function switchLocale(locale: Locale) {
    if (locale === currentLocale.value) return
    setLocale(locale)
    // Fire-and-forget: keep scheduled/manual report generation in sync with the
    // UI language, but don't block the (already-instant) UI switch on the network.
    api.updateSettings({ report_language: locale }).catch((e) => {
      console.error('Failed to sync report_language setting:', e)
    })
  }

  return { dataSource, isActive, currentLocale, switchLocale, logout }
}
