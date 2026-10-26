<script setup lang="ts">
import { onMounted } from 'vue'
import TopBar from './TopBar.vue'
import ConsolePanel from './ConsolePanel.vue'
import LoginPage from './LoginPage.vue'
import { consoleOpen } from '../shared/composables/consoleState'
import { useDataSource } from './useDataSource'
import { token, isAuthenticated, clearToken, setRole } from '../shared/composables/auth'
import { api } from '../shared/api/api'

useDataSource()

onMounted(async () => {
  if (token.value) {
    try {
      const { role } = await api.verifyAuth()
      setRole(role)
    } catch {
      clearToken()
    }
  }
})
</script>

<template>
  <LoginPage v-if="!isAuthenticated" />
  <div v-else class="min-h-screen" :class="consoleOpen ? 'pb-56' : 'pb-10'">
    <TopBar />
    <router-view />
    <ConsolePanel />
  </div>
</template>
