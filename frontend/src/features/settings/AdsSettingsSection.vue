<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsField from './SettingsField.vue'

// Contract 3.6: who the dealer is, what ads may claim, and the switch that lets anything be created.
defineProps<{ adsWriteMode: string }>()
const dealerName = defineModel<string>('dealerName', { required: true })
const dealerWhatsapp = defineModel<string>('dealerWhatsapp', { required: true })
const dealerCity = defineModel<string>('dealerCity', { required: true })
const dealerArea = defineModel<string>('dealerArea', { required: true })
const dealerLandingUrl = defineModel<string>('dealerLandingUrl', { required: true })
const claimInstallments = defineModel<boolean>('claimInstallments', { required: true })
const claimTradeIn = defineModel<boolean>('claimTradeIn', { required: true })
const claimTestDrive = defineModel<boolean>('claimTestDrive', { required: true })
const claimInspection = defineModel<boolean>('claimInspection', { required: true })
const inspectionWording = defineModel<string>('inspectionWording', { required: true })
const adsWriteEnabled = defineModel<boolean>('adsWriteEnabled', { required: true })
const { t } = useI18n()
</script>

<template>
  <div class="mt-5 border-t border-border pt-5">
    <h2 class="mb-1 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('settings.ads.title') }}</h2>
    <p class="mb-3 text-xs text-ink-faint">{{ t('settings.ads.intro') }}</p>
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <SettingsField id="ads-name" v-model="dealerName" :label="t('settings.ads.dealerName')" :maxlength="40" />
      <SettingsField id="ads-wa" v-model="dealerWhatsapp" :label="t('settings.ads.whatsapp')" :help="t('settings.ads.whatsappHelp')" inputmode="tel" :maxlength="20" />
      <SettingsField id="ads-city" v-model="dealerCity" :label="t('settings.ads.city')" :maxlength="40" />
      <SettingsField id="ads-area" v-model="dealerArea" :label="t('settings.ads.area')" :maxlength="40" />
    </div>
    <SettingsField
      id="ads-url"
      v-model="dealerLandingUrl"
      class="mt-5"
      :label="t('settings.ads.landingUrl')"
      :help="t('settings.ads.landingUrlHelp')"
      type="url"
      placeholder="https://"
      width-class="max-w-md"
    />

    <fieldset class="mt-5">
      <legend class="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">{{ t('settings.ads.claimsTitle') }}</legend>
      <p class="mb-2 text-xs text-ink-faint">{{ t('settings.ads.claimsHelp') }}</p>
      <label class="mb-1 flex items-center gap-2 text-sm text-ink-soft"><input v-model="claimInstallments" type="checkbox" class="h-4 w-4 accent-rosso" /> {{ t('settings.ads.claims.installments') }}</label>
      <label class="mb-1 flex items-center gap-2 text-sm text-ink-soft"><input v-model="claimTradeIn" type="checkbox" class="h-4 w-4 accent-rosso" /> {{ t('settings.ads.claims.tradeIn') }}</label>
      <label class="mb-1 flex items-center gap-2 text-sm text-ink-soft"><input v-model="claimTestDrive" type="checkbox" class="h-4 w-4 accent-rosso" /> {{ t('settings.ads.claims.testDrive') }}</label>
      <label class="mb-1 flex items-center gap-2 text-sm text-ink-soft"><input v-model="claimInspection" type="checkbox" class="h-4 w-4 accent-rosso" /> {{ t('settings.ads.claims.inspection') }}</label>
      <SettingsField
        v-if="claimInspection"
        id="ads-wording"
        v-model="inspectionWording"
        class="mt-2 max-w-md"
        :label="t('settings.ads.inspectionWording')"
        :maxlength="60"
      />
    </fieldset>

    <div class="mt-5 border-t border-border pt-4">
      <label class="flex items-start gap-3">
        <input v-model="adsWriteEnabled" type="checkbox" class="mt-0.5 h-4 w-4 accent-rosso" />
        <span class="text-sm text-ink-soft">
          <span class="font-medium text-ink">{{ t('settings.ads.writeTitle') }}</span><br />
          {{ t('settings.ads.writeDesc') }}
        </span>
      </label>
      <p class="mt-1 text-xs text-ink-faint">{{ t('settings.ads.mode', { mode: adsWriteMode === 'simulated' ? t('settings.ads.modeSimulated') : adsWriteMode }) }}</p>
    </div>
  </div>
</template>
