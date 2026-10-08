<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import InventoryView from './InventoryView.vue'
import { useInventorySummary } from './useInventorySummary'

// Loads the inventory summary and shows it. `collapseKey` makes it hideable (remembered per browser);
// `link` adds a pointer to the full Inventory page for places where this is a summary of it.
defineProps<{ collapseKey?: string; link?: boolean; heading?: 'h1' | 'h2' }>()
const { t } = useI18n()
const { inventory, loading, error } = useInventorySummary()
</script>

<template>
  <section class="mt-10">
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <component :is="heading ?? 'h2'" class="font-display font-bold text-ink" :class="heading === 'h1' ? 'text-2xl' : 'text-sm uppercase tracking-wide text-ink-faint'">
        {{ t('keywordOptimizer.inventory.title') }}
      </component>
      <router-link v-if="link" to="/inventory" class="font-mono text-[11px] font-bold uppercase tracking-wide text-link underline">
        {{ t('keywordOptimizer.inventory.openPage') }}
      </router-link>
    </div>
    <slot name="intro" />

    <div v-if="loading" class="py-6 text-ink-faint">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="rounded-lg border border-border bg-surface px-5 py-4 text-sm text-ink-soft">
      {{ t('keywordOptimizer.inventory.loadFailed', { error }) }}
    </div>
    <InventoryView v-else-if="inventory" :inventory="inventory" :collapse-key="collapseKey" />
  </section>
</template>
