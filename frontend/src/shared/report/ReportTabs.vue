<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ReportSection from './ReportSection.vue'
import { REPORT_SECTIONS, type ReportSectionDef } from './reportSections'
import type { Report } from '../api/types'

const props = withDefaults(
  defineProps<{
    report: Report
    defaultTab?: ReportSectionDef['key']
  }>(),
  { defaultTab: 'analysis' }
)

defineEmits<{ ask: [id: number]; 'why-trail': [id: number] }>()

const { t } = useI18n()
const activeKey = ref<ReportSectionDef['key']>(props.defaultTab)
const active = (): ReportSectionDef => REPORT_SECTIONS.find((s) => s.key === activeKey.value) ?? REPORT_SECTIONS[0]
</script>

<template>
  <div>
    <div class="mb-3 flex rounded-md border border-border bg-surface p-1">
      <button
        v-for="section in REPORT_SECTIONS"
        :key="section.key"
        type="button"
        class="flex-1 rounded px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide"
        :class="activeKey === section.key ? 'bg-rosso text-bianco' : 'text-ink-soft hover:text-ink'"
        @click="activeKey = section.key"
      >
        {{ t(section.titleKey) }}
      </button>
    </div>

    <ReportSection
      :title="t(active().titleKey)"
      :output="report[activeKey]"
      :askable="active().askable"
      :has-why-trail="active().hasWhyTrail"
      @ask="$emit('ask', report[activeKey]!.id)"
      @why-trail="$emit('why-trail', report[activeKey]!.id)"
    />
  </div>
</template>
