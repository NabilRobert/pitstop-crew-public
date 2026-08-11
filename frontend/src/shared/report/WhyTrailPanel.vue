<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api/api'
import { formatDate } from '../utils/format'
import { renderMarkdown } from '../utils/markdown'
import StatusPill from '../components/StatusPill.vue'

const props = defineProps({
  outputId: { type: Number, required: true },
})

const { t } = useI18n()
const loading = ref(true)
const error = ref(null)
const trail = ref([])

onMounted(async () => {
  try {
    trail.value = await api.whyTrail(props.outputId)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div v-if="loading" class="text-sm text-ink-faint">{{ t('whyTrailPanel.loading') }}</div>
    <div v-else-if="error" class="text-sm text-flag-critical">{{ t('whyTrailPanel.couldNotLoad', { error }) }}</div>
    <div v-else-if="!trail.length" class="text-sm text-ink-faint">{{ t('whyTrailPanel.noHistory') }}</div>

    <div v-else class="space-y-4">
      <div v-for="(step, i) in trail" :key="step.id" class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {{ i === 0 ? t('whyTrailPanel.originalDraft') : t('whyTrailPanel.revision', { n: i }) }}
          </span>
          <StatusPill :status="step.status" />
          <span class="font-mono text-[11px] text-ink-faint">{{ formatDate(step.created_at) }}</span>
        </div>
        <div class="agent-prose rounded-md bg-surface-raised px-3 py-2 text-sm" v-html="renderMarkdown(step.content)" />

        <div v-if="step.critique" class="ml-3 space-y-1 border-l-2 border-flag-caution/40 pl-3">
          <span class="font-mono text-[11px] font-bold uppercase tracking-wide text-flag-caution">
            {{ t('whyTrailPanel.ciriFlagged') }}
          </span>
          <div class="agent-prose rounded-md bg-surface-raised px-3 py-2 text-sm" v-html="renderMarkdown(step.critique.content)" />
        </div>
      </div>
    </div>
  </div>
</template>
