<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsField from './SettingsField.vue'

// Contract 3.4: the daily budget bounds for proposed campaigns, in whole rupiah.
const floor = defineModel<string>('floor', { required: true })
const ceiling = defineModel<string>('ceiling', { required: true })
const { t } = useI18n()
</script>

<template>
  <div class="mt-5 border-t border-border pt-5">
    <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('settings.campaignBudget.title') }}</h2>
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <SettingsField id="cb-floor" v-model="floor" :label="t('settings.campaignBudget.floor')" :help="t('settings.campaignBudget.floorHelp')" inputmode="numeric" placeholder="20000" />
      <SettingsField id="cb-ceiling" v-model="ceiling" :label="t('settings.campaignBudget.ceiling')" :help="t('settings.campaignBudget.ceilingHelp')" inputmode="numeric" placeholder="100000" />
    </div>
    <p class="mt-2 text-xs text-ink-faint">{{ t('settings.campaignBudget.note') }}</p>
  </div>
</template>
