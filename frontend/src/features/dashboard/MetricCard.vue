<script setup lang="ts">
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  accent: { type: String, default: 'ink' }, // 'ink' | 'rosso' | 'verde' | 'giallo'
})
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <div class="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
      {{ label }}
    </div>
    <div
      class="mt-2 font-display text-3xl font-bold tabular-nums"
      :class="{
        'text-accent-ink': accent === 'rosso',
        'text-flag-good': accent === 'verde',
        'text-flag-caution': accent === 'giallo',
        'text-ink': accent === 'ink',
      }"
    >
      {{ value }}
    </div>
  </div>
</template>
