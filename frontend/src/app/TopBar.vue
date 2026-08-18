<script setup>
import { useI18n } from 'vue-i18n'
import { theme, setTheme } from '../shared/composables/theme.js'
import { navLinks } from './navLinks.js'
import { useTopBar } from './useTopBar.js'

const { t } = useI18n()
const { dataSource, isActive, currentLocale, switchLocale } = useTopBar()
</script>

<template>
  <header class="border-b border-border bg-surface/80 backdrop-blur">
    <div class="h-[3px] w-full bg-gradient-to-r from-verde via-bianco to-rosso" />
    <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div class="flex items-center gap-3">
        <router-link to="/" class="block">
          <img src="/logo.png" alt="Pitstop" class="h-10 w-10 rounded-full" />
        </router-link>
        <span class="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint sm:inline">
          {{ t('topBar.tagline') }}
        </span>
      </div>

      <nav class="flex items-center gap-5">
        <router-link
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="font-mono text-[11px] font-bold uppercase tracking-wide transition-colors hover:text-ink"
          :class="isActive(link.to) ? 'text-rosso' : 'text-ink-soft'"
        >
          {{ t(link.labelKey) }}
        </router-link>
        <router-link
          v-if="dataSource === 'demo'"
          to="/time-machine"
          class="font-mono text-[11px] font-bold uppercase tracking-wide transition-colors hover:text-ink"
          :class="isActive('/time-machine') ? 'text-rosso' : 'text-ink-soft'"
        >
          {{ t('nav.timeMachine') }}
        </router-link>
      </nav>

      <div class="flex items-center gap-3">
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
            type="button"
            class="px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
            :class="theme === 'ferrari' ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            :title="t('topBar.themeFerrari')"
            @click="setTheme('ferrari')"
          >
            {{ t('topBar.themeFerrariShort') }}
          </button>
          <button
            type="button"
            class="px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors"
            :class="theme === 'blueprint' ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
            :title="t('topBar.themeBlueprint')"
            @click="setTheme('blueprint')"
          >
            {{ t('topBar.themeBlueprintShort') }}
          </button>
        </div>
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
      </div>
    </div>
  </header>
</template>
