import { computed, inject, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { setLocale, getLocale, type Locale } from '../i18n/index.js'
import { api } from '../shared/api/api'
import { isDemoHidden, navLinks } from './navLinks.js'
import { logout, isDemo } from '../shared/composables/auth'

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
    if (isDemo.value) return // read-only account: can't write the setting
    // Fire-and-forget: keep scheduled/manual report generation in sync with the
    // UI language, but don't block the (already-instant) UI switch on the network.
    api.updateSettings({ report_language: locale }).catch((e) => {
      console.error('Failed to sync report_language setting:', e)
    })
  }

  const visibleNavLinks = computed(() =>
    isDemo.value ? navLinks.filter((l) => !isDemoHidden(l.to)) : navLinks
  )

  return { dataSource, isActive, currentLocale, switchLocale, logout, isDemo, visibleNavLinks }
}
