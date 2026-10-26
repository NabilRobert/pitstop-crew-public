<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { InventorySummary } from '../../shared/api/types'
import SettingsField from './SettingsField.vue'

// The keyword optimizer: its automatic daily run, the thresholds it decides with, and the inventory status.
defineProps<{
  /** False until the server sends the run time (an older backend has no automatic run). */
  runTimeSupported: boolean
  /** Read-only status; the inventory connection string is never shown, edited or fetched here. */
  inventory: InventorySummary | null
}>()
const enabled = defineModel<boolean>('enabled', { required: true })
const runTime = defineModel<string>('runTime', { required: true })
const testBudgetShare = defineModel<string>('testBudgetShare', { required: true })
const minConfidenceP = defineModel<string>('minConfidenceP', { required: true })
const allowedSpendShare = defineModel<string>('allowedSpendShare', { required: true })
const leadToSaleRate = defineModel<string>('leadToSaleRate', { required: true })
const { t } = useI18n()
</script>

<template>
  <div class="mt-5 border-t border-border pt-5">
    <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('settings.keywordOptimizer.title') }}</h2>
    <label class="flex items-start gap-3">
      <input v-model="enabled" type="checkbox" class="mt-0.5 h-4 w-4 accent-rosso" />
      <span class="text-sm text-ink-soft">
        <span class="font-medium text-ink">{{ t('settings.keywordOptimizer.enabledTitle') }}</span><br />
        {{ t('settings.keywordOptimizer.enabledDesc') }}
      </span>
    </label>

    <SettingsField
      v-if="runTimeSupported"
      id="ko-run-time"
      v-model="runTime"
      class="mt-4 max-w-xs"
      :label="t('settings.keywordOptimizer.runTime')"
      :help="t('settings.keywordOptimizer.runTimeHelp')"
      type="time"
    />

    <div class="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
      <SettingsField id="ko-test-share" v-model="testBudgetShare" :label="t('settings.keywordOptimizer.testBudgetShare')" :help="t('settings.keywordOptimizer.testBudgetShareHelp')" inputmode="decimal" placeholder="0.2" />
      <SettingsField id="ko-min-p" v-model="minConfidenceP" :label="t('settings.keywordOptimizer.minConfidenceP')" :help="t('settings.keywordOptimizer.minConfidencePHelp')" inputmode="decimal" placeholder="0.05" />
      <SettingsField id="ko-spend-share" v-model="allowedSpendShare" :label="t('settings.keywordOptimizer.allowedSpendShare')" :help="t('settings.keywordOptimizer.allowedSpendShareHelp')" inputmode="decimal" placeholder="0.2" />
      <SettingsField id="ko-lead-rate" v-model="leadToSaleRate" :label="t('settings.keywordOptimizer.leadToSaleRate')" :help="t('settings.keywordOptimizer.leadToSaleRateHelp')" inputmode="decimal" placeholder="0.02" />
    </div>

    <!-- Status only. The inventory connection string lives in the server's .env and is never shown or edited here. -->
    <p v-if="inventory" class="mt-4 text-sm text-ink-soft">
      {{ t('settings.keywordOptimizer.inventoryStatus', { source: t(`keywordOptimizer.inventory.source.${inventory.source}`) }) }}
      <span v-if="inventory.error" class="text-flag-caution"> · {{ inventory.error }}</span>
    </p>
    <p class="mt-1 text-xs text-ink-faint">{{ t('settings.keywordOptimizer.inventoryNote') }}</p>
  </div>
</template>
