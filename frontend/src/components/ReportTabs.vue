<script setup>
import { ref } from 'vue'
import ReportSection from './ReportSection.vue'
import { REPORT_SECTIONS } from '../lib/reportSections'

const props = defineProps({
  report: { type: Object, required: true }, // { analysis, recommendation, summary }
  defaultTab: { type: String, default: 'analysis' },
})

defineEmits(['ask', 'why-trail'])

const activeKey = ref(props.defaultTab)
const active = () => REPORT_SECTIONS.find((s) => s.key === activeKey.value)
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
        {{ section.title }}
      </button>
    </div>

    <ReportSection
      :title="active().title"
      :output="report[activeKey]"
      :askable="active().askable"
      :has-why-trail="active().hasWhyTrail"
      @ask="$emit('ask', report[activeKey].id)"
      @why-trail="$emit('why-trail', report[activeKey].id)"
    />
  </div>
</template>
