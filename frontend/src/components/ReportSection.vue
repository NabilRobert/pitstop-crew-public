<script setup>
import StatusPill from './StatusPill.vue'
import GradeBadge from './GradeBadge.vue'
import { renderReportContent } from '../lib/markdown'

defineProps({
  title: { type: String, required: true },
  output: { type: Object, default: null }, // AiOutput | null
  askable: { type: Boolean, default: false },
  hasWhyTrail: { type: Boolean, default: false },
})

defineEmits(['ask', 'why-trail'])
</script>

<template>
  <div class="flex h-full flex-col rounded-lg border border-border bg-surface">
    <div class="flex items-center justify-between border-b border-border px-5 py-4">
      <span class="font-display text-lg font-bold text-ink">{{ title }}</span>
      <div class="flex items-center gap-2">
        <GradeBadge :grade="output?.critique?.grade" :rationale="output?.critique?.grade_rationale" />
        <StatusPill v-if="output" :status="output.status" />
      </div>
    </div>

    <div v-if="!output" class="flex flex-1 items-center justify-center px-5 py-10 text-center text-ink-faint">
      No output for this report.
    </div>

    <template v-else>
      <div
        class="agent-prose flex-1 px-5 py-5"
        v-html="renderReportContent(output.content, output.critique?.issues)"
      />
      <div v-if="askable || hasWhyTrail" class="flex gap-4 border-t border-border px-5 py-3">
        <button
          v-if="hasWhyTrail"
          type="button"
          class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink"
          @click="$emit('why-trail')"
        >
          Why this?
        </button>
        <button
          v-if="askable"
          type="button"
          class="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint hover:text-ink"
          @click="$emit('ask')"
        >
          Ask about this
        </button>
      </div>
    </template>
  </div>
</template>
