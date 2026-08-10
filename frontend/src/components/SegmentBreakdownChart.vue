<script setup>
import { ref, computed, watch } from 'vue'
import { Bar } from 'vue-chartjs'
import { CHART_COLORS, baseChartOptions } from '../lib/chartTheme'

const props = defineProps({
  rows: { type: Array, required: true }, // {segment_type, segment_value, conversions, ...}
})

const types = computed(() => [...new Set(props.rows.map((r) => r.segment_type))].sort())
const activeType = ref(types.value[0] ?? null)
watch(types, (t) => {
  if (!t.includes(activeType.value)) activeType.value = t[0] ?? null
})

const rowsForType = computed(() =>
  props.rows.filter((r) => r.segment_type === activeType.value).sort((a, b) => b.conversions - a.conversions)
)

const chartData = computed(() => ({
  labels: rowsForType.value.map((r) => r.segment_value),
  datasets: [
    {
      data: rowsForType.value.map((r) => r.conversions),
      backgroundColor: CHART_COLORS.verde,
      borderRadius: 3,
    },
  ],
}))

const chartOptions = { ...baseChartOptions, indexAxis: 'y' }
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        Segment performance
      </h2>
      <div class="flex gap-1">
        <button
          v-for="t in types"
          :key="t"
          type="button"
          class="rounded px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide capitalize"
          :class="activeType === t ? 'bg-rosso text-bianco' : 'text-ink-faint hover:text-ink'"
          @click="activeType = t"
        >
          {{ t }}
        </button>
      </div>
    </div>
    <div class="h-64">
      <Bar v-if="rowsForType.length" :data="chartData" :options="chartOptions" />
      <div v-else class="flex h-full items-center justify-center text-ink-faint">No segment data yet.</div>
    </div>
  </div>
</template>
