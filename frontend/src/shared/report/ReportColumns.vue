<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ReportSection from './ReportSection.vue'
import { REPORT_SECTIONS } from './reportSections'
import type { Report } from '../api/types'

defineProps<{ report: Report }>()

defineEmits<{ ask: [id: number]; 'why-trail': [id: number] }>()

const { t } = useI18n()
</script>

<template>
  <div>
    <p class="mb-3 text-center font-mono text-[11px] uppercase tracking-wide text-ink-faint">
      {{ t('reportColumns.pipelineCaption') }}
    </p>
    <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
      <ReportSection
        v-for="section in REPORT_SECTIONS"
        :key="section.key"
        :title="t(section.titleKey)"
        :output="report[section.key]"
        :askable="section.askable"
        :has-why-trail="section.hasWhyTrail"
        @ask="$emit('ask', report[section.key]!.id)"
        @why-trail="$emit('why-trail', report[section.key]!.id)"
      />
    </div>
  </div>
</template>
