<script setup>
import TopBar from './TopBar.vue'
import ConsolePanel from './ConsolePanel.vue'
import { consoleOpen } from '../shared/composables/consoleState'
import { useDataSource } from './useDataSource'

useDataSource()
</script>

<template>
  <div class="min-h-screen" :class="consoleOpen ? 'pb-56' : 'pb-10'">
    <TopBar />
    <router-view />
    <ConsolePanel />
  </div>
</template>
