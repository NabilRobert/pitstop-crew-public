<script setup lang="ts">
import { computed } from 'vue'
import type { Suggestion } from '../../shared/api/types'
import ReviewLaunchPanel from './ReviewLaunchPanel.vue'
import { closeLaunch, launchTargetId } from './useLaunchPanel'
import { useAdsSettings } from './useAdsSettings'

// Mounted once per page that can launch. Shows the Review and create panel for whichever suggestion was opened with
// openLaunch(); the page passes the loaded suggestions and reloads them when something was created.
const props = defineProps<{ suggestions: Suggestion[]; canEdit: boolean }>()
const emit = defineEmits<{ (e: 'done'): void }>()
const settings = useAdsSettings()
const target = computed(() => props.suggestions.find((s) => s.id === launchTargetId.value) ?? null)
</script>

<template>
  <ReviewLaunchPanel
    v-if="target"
    :suggestion="target"
    :all="suggestions"
    :can-edit="canEdit"
    :write-enabled="settings.enabled.value"
    @close="closeLaunch"
    @done="emit('done')"
  />
</template>
