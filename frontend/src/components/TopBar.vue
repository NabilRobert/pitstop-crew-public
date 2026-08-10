<script setup>
import { inject } from 'vue'
import { useRoute } from 'vue-router'

const dataSource = inject('dataSource')
const route = useRoute()

const navLinks = [
  { to: '/', label: 'Dashboard' },
  { to: '/reports', label: 'Reports' },
  { to: '/system-health', label: 'System Health' },
  { to: '/learning', label: 'Learning' },
  { to: '/settings', label: 'Settings' },
]

// Manual prefix match instead of router-link's active-class: "/" as a
// link path would otherwise match every route as a prefix.
function isActive(linkPath) {
  return linkPath === '/' ? route.path === '/' : route.path.startsWith(linkPath)
}
</script>

<template>
  <header class="border-b border-border bg-surface/80 backdrop-blur">
    <div class="h-[3px] w-full bg-gradient-to-r from-verde via-bianco to-rosso" />
    <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div class="flex items-baseline gap-3">
        <router-link to="/" class="font-display text-2xl font-black italic tracking-tight text-ink">
          PIT<span class="text-rosso">STOP</span>
        </router-link>
        <span class="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint sm:inline">
          Google Ads AI Performance Dashboard
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
          {{ link.label }}
        </router-link>
        <router-link
          v-if="dataSource === 'demo'"
          to="/time-machine"
          class="font-mono text-[11px] font-bold uppercase tracking-wide transition-colors hover:text-ink"
          :class="isActive('/time-machine') ? 'text-rosso' : 'text-ink-soft'"
        >
          Time Machine
        </router-link>
      </nav>

      <div class="flex items-center gap-3">
        <span
          v-if="dataSource === 'demo'"
          class="flex items-center gap-1.5 rounded-full border border-flag-caution/40 bg-flag-caution-soft px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-flag-caution"
          title="Showing synthetic demo data, not a live Google Ads account"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-flag-caution" />
          Demo Mode
        </span>
        <span
          v-else
          class="flex items-center gap-1.5 rounded-full border border-flag-good/40 bg-flag-good-soft px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-flag-good"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-flag-good" />
          Live Data
        </span>
      </div>
    </div>
  </header>
</template>
