<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bar } from 'vue-chartjs'
import { useCampaignBarChart } from './useCampaignBarChart'
import type { CampaignRow } from './useDashboard'

const { t } = useI18n()

const props = defineProps<{ rows: CampaignRow[] }>()

const { sorted, chartData, chartOptions } = useCampaignBarChart(toRef(props, 'rows'))
</script>

<template>
  <div class="rounded-lg border border-border bg-surface p-5">
    <h2 class="mb-4 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
      {{ t('campaignBarChart.title') }}
    </h2>
    <div class="h-64">
      <Bar v-if="sorted.length" :data="chartData" :options="chartOptions" />
      <div v-else class="flex h-full items-center justify-center text-ink-faint">{{ t('common.noDataYet') }}</div>
    </div>
  </div>
</template>
