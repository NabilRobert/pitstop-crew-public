<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { LaunchListItem } from '../../shared/api/types'
import { keywordOptimizerApi } from './keywordOptimizerApi'
import LaunchesLogView from './LaunchesLogView.vue'

// Loads the audit log and shows it. A server without it (older deploy) or a failed call shows no section at all.
const items = ref<LaunchListItem[] | null>(null)
onMounted(async () => {
  try {
    items.value = await keywordOptimizerApi.launches(20)
  } catch {
    items.value = null
  }
})
</script>

<template>
  <LaunchesLogView v-if="items !== null" :items="items" />
</template>
