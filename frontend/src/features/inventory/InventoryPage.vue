<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import InventoryPanel from '../keyword-optimizer/InventoryPanel.vue'

const { t } = useI18n()
</script>

<template>
  <main class="mx-auto max-w-6xl px-6 py-8">
    <p class="mb-2 max-w-3xl text-sm text-ink-soft">{{ t('inventoryPage.subtitle') }}</p>
    <!-- The page IS the inventory, so its heading is the page title; the block can still be hidden. -->
    <InventoryPanel heading="h1" collapse-key="pitstop-inventory-page" />
  </main>
</template>
