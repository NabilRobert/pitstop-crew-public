<script setup>
defineProps({
  dataSource: { type: String, default: 'demo' },
})
</script>

<template>
  <header class="border-b border-border bg-surface/80 backdrop-blur">
    <div class="h-[3px] w-full bg-gradient-to-r from-verde via-bianco to-rosso" />
    <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
      <div class="flex items-baseline gap-3">
        <span class="font-display text-2xl font-black italic tracking-tight text-ink">
          PIT<span class="text-rosso">STOP</span>
        </span>
        <span class="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint sm:inline">
          Google Ads AI Performance Dashboard
        </span>
      </div>

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
