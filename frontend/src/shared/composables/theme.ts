import { ref, watch } from 'vue'

// The list is the single source of truth: the type, the stored-value check
// and the TopBar switch all derive from it, so adding a theme means adding
// one entry here (plus its CSS block, chart palette and i18n labels).
export const THEMES = ['ferrari', 'blueprint', 'atom-eve'] as const
export type ThemeName = (typeof THEMES)[number]

// Shared singleton, same localStorage-backed pattern as consoleState.js's
// consoleOpen and i18n/index.js's locale. 'ferrari' is the original brand
// palette and the default; 'blueprint' is the black/white/blue/gray
// alternative proposed via https://www.color-hex.com/color-palette/86164;
// 'atom-eve' is a light theme built from cyan/yellow/pink/light pink/black.
// See style.css for what each theme actually overrides. Status-flag colors
// (good/caution/critical) are deliberately NOT part of this switch: they
// encode meaning (approved vs flagged, grade severity), not brand, so they
// stay green/yellow/red in every theme rather than losing that at-a-glance
// signal (the light themes only darken their shades for contrast).
const THEME_KEY = 'pitstop-theme'

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && (THEMES as readonly string[]).includes(value)
}

function readStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return isThemeName(stored) ? stored : 'ferrari'
  } catch {
    return 'ferrari'
  }
}

export const theme = ref<ThemeName>(readStoredTheme())

watch(
  theme,
  (value) => {
    try {
      localStorage.setItem(THEME_KEY, value)
    } catch {
      // storage blocked (private mode etc.) — the theme still applies for this session
    }
    document.documentElement.dataset.theme = value
  },
  { immediate: true }
)

export function setTheme(value: ThemeName) {
  theme.value = value
}
