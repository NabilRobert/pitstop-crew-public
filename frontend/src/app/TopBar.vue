<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { theme, setTheme, THEMES, type ThemeName } from '../shared/composables/theme.js'
import { useTopBar } from './useTopBar.js'

const { t } = useI18n()

// i18n keys per theme — one entry per name in THEMES (the Record type makes a
// missing entry a compile error when a theme is added).
const THEME_LABELS: Record<ThemeName, { title: string; short: string }> = {
  ferrari: { title: 'topBar.themeFerrari', short: 'topBar.themeFerrariShort' },
  blueprint: { title: 'topBar.themeBlueprint', short: 'topBar.themeBlueprintShort' },
  'atom-eve': { title: 'topBar.themeAtomEve', short: 'topBar.themeAtomEveShort' },
}
const { dataSource, isActive, currentLocale, switchLocale, logout, isDemo, visibleNavLinks } = useTopBar()

// The nav is one horizontally scrollable row (it no longer wraps labels onto two lines),
// so on a narrow screen the active link can sit off-screen: scroll it into view on navigation.
const route = useRoute()
const navEl = ref<HTMLElement | null>(null)
async function revealActiveLink() {
  await nextTick()
  const active = navEl.value?.querySelector<HTMLElement>('[aria-current="page"]')
  if (!active || !navEl.value) return
  const box = navEl.value.getBoundingClientRect()
  const item = active.getBoundingClientRect()
  if (item.left < box.left) navEl.value.scrollLeft += item.left - box.left - 12
  else if (item.right > box.right) navEl.value.scrollLeft += item.right - box.right + 12
}
onMounted(revealActiveLink)
watch(() => route.path, revealActiveLink)
</script>

<template>
  <header class="border-b border-border bg-surface/80 backdrop-blur">
    <div class="top-stripe h-[3px] w-full bg-gradient-to-r from-verde via-stripe-mid to-rosso" />
    <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
      <div class="flex items-center gap-3">
        <router-link to="/" class="block">
          <img src="/logo.png" alt="Pitstop" class="h-10 w-10 rounded-full" />
        </router-link>
        <span class="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint sm:inline">
          {{ t('topBar.tagline') }}
        </span>
      </div>


      <div class="flex flex-wrap items-center gap-3">
        <div
          class="flex items-center overflow-hidden rounded-full border border-border"
          role="group"
          :aria-label="t('topBar.switchLanguage')"
        >
          <button
            type="button"
            class="px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
            :class="currentLocale === 'en' ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            @click="switchLocale('en')"
          >
            EN
          </button>
          <button
            type="button"
            class="px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
            :class="currentLocale === 'id' ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            @click="switchLocale('id')"
          >
            ID
          </button>
        </div>
        <div
          class="flex items-center overflow-hidden rounded-full border border-border"
          role="group"
          :aria-label="t('topBar.switchTheme')"
        >
          <button
            v-for="name in THEMES"
            :key="name"
            type="button"
            class="px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
            :class="theme === name ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            :title="t(THEME_LABELS[name].title)"
            :aria-pressed="theme === name"
            @click="setTheme(name)"
          >
            {{ t(THEME_LABELS[name].short) }}
          </button>
        </div>
        <span
          v-if="isDemo"
          class="rounded-full border border-border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft"
          :title="t('topBar.readOnlyTooltip')"
        >
          {{ t('topBar.readOnly') }}
        </span>
        <span
          v-if="dataSource === 'demo'"
          class="flex items-center gap-1.5 rounded-full border border-flag-caution/40 bg-flag-caution-soft px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-flag-caution"
          :title="t('topBar.demoModeTooltip')"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-flag-caution" />
          {{ t('topBar.demoMode') }}
        </span>
        <span
          v-else
          class="flex items-center gap-1.5 rounded-full border border-flag-good/40 bg-flag-good-soft px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-flag-good"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-flag-good" />
          {{ t('topBar.liveData') }}
        </span>
        <button
          type="button"
          class="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:text-ink"
          @click="logout"
        >
          {{ t('topBar.logout') }}
        </button>
      </div>
      <nav
        ref="navEl"
        class="nav-scroll -mx-1 flex w-full items-center gap-5 overflow-x-auto px-1 pb-1"
        :aria-label="t('topBar.navLabel')"
      >
        <router-link
          v-for="link in visibleNavLinks"
          :key="link.to"
          :to="link.to"
          class="shrink-0 whitespace-nowrap font-mono text-[11px] font-bold uppercase tracking-wide transition-colors hover:text-ink"
          :class="isActive(link.to) ? 'text-accent-ink' : 'text-ink-soft'"
          :aria-current="isActive(link.to) ? 'page' : undefined"
        >
          {{ t(link.labelKey) }}
        </router-link>
        <router-link
          v-if="dataSource === 'demo' && !isDemo"
          to="/time-machine"
          class="shrink-0 whitespace-nowrap font-mono text-[11px] font-bold uppercase tracking-wide transition-colors hover:text-ink"
          :class="isActive('/time-machine') ? 'text-accent-ink' : 'text-ink-soft'"
          :aria-current="isActive('/time-machine') ? 'page' : undefined"
        >
          {{ t('nav.timeMachine') }}
        </router-link>
      </nav>
    </div>
  </header>
</template>
