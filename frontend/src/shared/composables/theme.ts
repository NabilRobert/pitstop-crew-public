import { ref, watch } from 'vue'

export type ThemeName = 'ferrari' | 'blueprint'

// Shared singleton, same localStorage-backed pattern as consoleState.js's
// consoleOpen and i18n/index.js's locale. 'ferrari' is the original brand
// palette; 'blueprint' is the black/white/blue/gray alternative proposed
// via https://www.color-hex.com/color-palette/86164 — see style.css for
// what each theme actually overrides. Status-flag colors (good/caution/
// critical) are deliberately NOT part of this switch: they encode meaning
// (approved vs flagged, grade severity), not brand, so they stay green/
// yellow/red in both themes rather than losing that at-a-glance signal.
const THEME_KEY = 'pitstop-theme'
const stored = localStorage.getItem(THEME_KEY)
export const theme = ref<ThemeName>(stored === 'blueprint' ? 'blueprint' : 'ferrari')

watch(
  theme,
  (value) => {
    localStorage.setItem(THEME_KEY, value)
    document.documentElement.dataset.theme = value
  },
  { immediate: true }
)

export function setTheme(value: ThemeName) {
  theme.value = value
}
