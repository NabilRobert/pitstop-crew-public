<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import StatusPill from '../components/StatusPill.vue'
import GradeBadge from './GradeBadge.vue'
import { renderReportContent } from '../utils/markdown'
import type { AiOutputWithCritique } from '../api/types'
import { isDemo } from '../composables/auth'

withDefaults(
  defineProps<{
    title: string
    output?: AiOutputWithCritique | null
    askable?: boolean
    hasWhyTrail?: boolean
  }>(),
  { output: null, askable: false, hasWhyTrail: false }
)

defineEmits<{ ask: []; 'why-trail': [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex h-full max-h-[560px] flex-col rounded-lg border border-border bg-surface">
    <div class="flex items-center justify-between border-b border-border px-5 py-4">
      <span class="font-display text-lg font-bold text-ink">{{ title }}</span>
      <div class="flex items-center gap-2">
        <GradeBadge :grade="output?.critique?.grade" :rationale="output?.critique?.grade_rationale" />
        <StatusPill
          v-if="output"
          :status="output.status"
          :notes="output.status === 'approved' && (output.critique?.issues?.length ?? 0) > 0"
        />
      </div>
    </div>

    <div v-if="!output" class="flex flex-1 items-center justify-center px-5 py-10 text-center text-ink-faint">
      {{ t('reportSection.noOutput') }}
    </div>

    <template v-else>
      <div
        class="agent-prose flex-1 overflow-y-auto px-5 py-5"
        v-html="renderReportContent(output.content, output.critique?.issues ?? [])"
      />
      <div v-if="(askable && !isDemo) || hasWhyTrail" class="flex gap-4 border-t border-border px-5 py-3">
        <button
          v-if="hasWhyTrail"
          type="button"
          class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink"
          @click="$emit('why-trail')"
        >
          {{ t('reportSection.whyThis') }}
        </button>
        <button
          v-if="askable && !isDemo"
          type="button"
          class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink"
          @click="$emit('ask')"
        >
          {{ t('reportSection.askAboutThis') }}
        </button>
      </div>
    </template>
  </div>
</template>
