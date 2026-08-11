import { createI18n } from 'vue-i18n'
import en from './en.js'
import id from './id.js'

// Shared singleton, same localStorage-backed pattern as consoleState.js's
// consoleOpen — the nav toggle and Settings dropdown both read/write this.
const LOCALE_KEY = 'pitstop-locale'
const storedLocale = localStorage.getItem(LOCALE_KEY)
const initialLocale = storedLocale === 'id' ? 'id' : 'en'

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: { en, id },
})

/** Switches the UI locale immediately and persists it. Does not touch the
 * backend report_language setting — callers that also need report
 * generation to follow (the nav toggle) write that through separately. */
export function setLocale(locale) {
  i18n.global.locale.value = locale
  localStorage.setItem(LOCALE_KEY, locale)
}

export function getLocale() {
  return i18n.global.locale.value
}
