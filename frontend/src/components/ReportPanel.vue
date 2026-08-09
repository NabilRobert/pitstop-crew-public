<script setup>
import StatusPill from './StatusPill.vue'
import { formatDate } from '../lib/format'

defineProps({
  report: { type: Object, required: true }, // { analysis, recommendation, summary }
  period: { type: String, required: true },
})
</script>

<template>
  <div class="rounded-lg border border-border bg-surface">
    <div class="flex items-center justify-between border-b border-border px-5 py-4">
      <div class="flex items-center gap-2">
        <span class="font-display text-lg font-bold text-ink">Sammy's {{ period }} report</span>
        <span
          v-if="report.summary"
          class="font-mono text-[11px] text-ink-faint"
        >
          — {{ formatDate(report.summary.report_date) }}
        </span>
      </div>
      <StatusPill v-if="report.summary" :status="report.summary.status" />
    </div>

    <div v-if="!report.summary" class="px-5 py-10 text-center text-ink-faint">
      No {{ period }} report yet — the pipeline hasn't run for this period.
    </div>

    <template v-else>
      <div class="whitespace-pre-line px-5 py-5 leading-relaxed text-ink-soft">{{ report.summary.content }}</div>

      <details v-if="report.recommendation" class="border-t border-border">
        <summary
          class="flex cursor-pointer items-center justify-between px-5 py-3 font-display text-sm font-semibold text-ink hover:bg-surface-raised"
        >
          <span>Rico's recommendation</span>
          <StatusPill :status="report.recommendation.status" />
        </summary>
        <div class="whitespace-pre-line px-5 pb-5 leading-relaxed text-ink-soft">
          {{ report.recommendation.content }}
        </div>
      </details>

      <details v-if="report.analysis" class="border-t border-border">
        <summary
          class="flex cursor-pointer items-center justify-between px-5 py-3 font-display text-sm font-semibold text-ink hover:bg-surface-raised"
        >
          <span>Anna's analysis</span>
          <StatusPill :status="report.analysis.status" />
        </summary>
        <div class="whitespace-pre-line px-5 pb-5 leading-relaxed text-ink-soft">
          {{ report.analysis.content }}
        </div>
      </details>
    </template>
  </div>
</template>
