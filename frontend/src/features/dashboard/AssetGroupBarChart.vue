<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bar } from 'vue-chartjs'
import { useAssetGroupBarChart } from './useAssetGroupBarChart'
import type { AssetGroupRow } from './useCampaignDetail'

const { t } = useI18n()

const props = defineProps<{ rows: AssetGroupRow[] }>()

const { sorted, chartData, chartOptions } = useAssetGroupBarChart(toRef(props, 'rows'))
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <h2 class="mb-4 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
      {{ t('assetGroupChart.title') }}
    </h2>
    <div class="h-64">
      <Bar v-if="sorted.length" :data="chartData" :options="chartOptions" />
      <div v-else class="flex h-full items-center justify-center text-ink-faint">{{ t('assetGroupChart.noData') }}</div>
    </div>
  </div>
</template>
