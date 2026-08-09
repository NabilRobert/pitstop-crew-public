<script setup>
import { ref, onMounted } from 'vue'
import TopBar from './components/TopBar.vue'
import { api } from './lib/api'

const dataSource = ref('demo')

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
  <div class="min-h-screen">
    <TopBar :data-source="dataSource" />
    <router-view />
  </div>
</template>
