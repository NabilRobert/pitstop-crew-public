<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Suggestion } from '../../shared/api/types'
import { proposalsByStatus } from './boardModel'
import CampaignProposalLane from './CampaignProposalLane.vue'
import NoteDrawer from './NoteDrawer.vue'

// Both proposal lanes (proposed by the AI, planned by the owner) plus the detail panel, as one block, so the
// Keyword Optimizer page and the Campaigns page show proposals the same way. It owns no data.
const props = defineProps<{
  /** Every suggestion loaded, any status. */
  suggestions: Suggestion[]
  canEdit: boolean
  busyIds: Set<number>
}>()
const emit = defineEmits<{ (e: 'status', id: number, status: 'open' | 'applied' | 'dismissed' | 'planned'): void }>()

const proposed = computed(() => proposalsByStatus(props.suggestions, 'open'))
const planned = computed(() => proposalsByStatus(props.suggestions, 'planned'))
const openId = ref<number | null>(null)
// Re-read from the loaded list so the panel always shows the current status and closes if the row is gone.
const opened = computed(() => props.suggestions.find((s) => s.id === openId.value) ?? null)
</script>

<template>
  <div v-if="proposed.length || planned.length">
    <CampaignProposalLane
      v-if="proposed.length"
      mode="proposed"
      :items="proposed"
      :all="suggestions"
      :can-edit="canEdit"
      :busy-ids="busyIds"
      @open="(s) => (openId = s.id)"
      @status="(id, status) => emit('status', id, status)"
    />
    <CampaignProposalLane
      v-if="planned.length"
      mode="planned"
      :items="planned"
      :all="suggestions"
      :can-edit="canEdit"
      :busy-ids="busyIds"
      @open="(s) => (openId = s.id)"
      @status="(id, status) => emit('status', id, status)"
    />
    <NoteDrawer
      v-if="opened"
      :note="null"
      :suggestions="[opened]"
      :can-edit="canEdit"
      :busy-ids="busyIds"
      @close="openId = null"
      @status="(id, status) => emit('status', id, status)"
    />
  </div>
</template>
