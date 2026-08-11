<script setup>
import { ref, onMounted, provide } from 'vue'
import TopBar from './TopBar.vue'
import ConsolePanel from './ConsolePanel.vue'
import { api } from '../shared/api/api'
import { consoleOpen } from '../shared/composables/consoleState'

const dataSource = ref('demo')
provide('dataSource', dataSource)

onMounted(async () => {
  try {
    const config = await api.config()
    dataSource.value = config.data_source
  } catch {
    // backend unreachable — DashboardPage surfaces its own error state
  }
})
</script>

<template>
  <div class="min-h-screen" :class="consoleOpen ? 'pb-56' : 'pb-10'">
    <TopBar />
    <router-view />
    <ConsolePanel />
  </div>
</template>
