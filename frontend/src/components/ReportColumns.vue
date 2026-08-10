<script setup>
import ReportSection from './ReportSection.vue'
import { REPORT_SECTIONS } from '../lib/reportSections'

defineProps({
  report: { type: Object, required: true }, // { analysis, recommendation, summary }
})

defineEmits(['ask', 'why-trail'])
</script>

<template>
  <div>
    <p class="mb-3 text-center font-mono text-[11px] uppercase tracking-wide text-ink-faint">
      Anna's analysis → informed Rico's recommendation → digested by Sammy
    </p>
    <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
      <ReportSection
        v-for="section in REPORT_SECTIONS"
        :key="section.key"
        :title="section.title"
        :output="report[section.key]"
        :askable="section.askable"
        :has-why-trail="section.hasWhyTrail"
        @ask="$emit('ask', report[section.key].id)"
        @why-trail="$emit('why-trail', report[section.key].id)"
      />
    </div>
  </div>
</template>
