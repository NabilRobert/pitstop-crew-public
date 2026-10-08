<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSettings } from './useSettings'

const { t } = useI18n()
const {
  loading,
  saving,
  error,
  saved,
  dailyRunTime,
  weeklyRunTime,
  reportRecipientEmail,
  reportLanguage,
  autoReportsEnabled,
  monthlyCostCapUsd,
  problemKey,
  keywordSettingsSupported,
  adsSupported,
  dealerName,
  dealerCity,
  dealerArea,
  dealerWhatsapp,
  dealerLandingUrl,
  claimInstallments,
  claimTradeIn,
  claimTestDrive,
  claimInspection,
  inspectionWording,
  adsWriteEnabled,
  adsWriteMode,
  campaignBudgetSupported,
  campaignBudgetFloor,
  campaignBudgetCeiling,
  keywordOptimizerEnabled,
  keywordRunTimeSupported,
  keywordRunTime,
  keywordTestBudgetShare,
  keywordMinConfidenceP,
  inventoryAllowedSpendShare,
  inventoryLeadToSaleRate,
  inventory,
  save,
} = useSettings()
</script>

<template>
  <main class="mx-auto max-w-2xl px-6 py-8">
    <h1 class="mb-2 font-display text-2xl font-bold text-ink">{{ t('settings.title') }}</h1>
    <p class="mb-6 text-sm text-ink-faint">
      {{ t('settings.description') }}
    </p>

    <div v-if="loading" class="py-12 text-center text-ink-faint">{{ t('common.loading') }}</div>

    <template v-else>
      <div class="rounded-lg border border-border bg-surface p-5">
        <label class="flex items-start gap-3">
          <input v-model="autoReportsEnabled" type="checkbox" class="mt-0.5 h-4 w-4 accent-rosso" />
          <span class="text-sm text-ink-soft">
            <span class="font-medium text-ink">{{ t('settings.autoReportsTitle') }}</span><br />
            {{ t('settings.autoReportsDesc') }}
          </span>
        </label>

        <div class="mt-5 grid grid-cols-1 gap-5 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              {{ t('settings.dailyRunTime') }}
            </label>
            <input
              v-model="dailyRunTime"
              type="time"
              class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-accent-ink focus:outline-none"
            />
          </div>
          <div>
            <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              {{ t('settings.weeklyRunTime') }} <span class="normal-case text-ink-faint">{{ t('settings.mondaysSuffix') }}</span>
            </label>
            <input
              v-model="weeklyRunTime"
              type="time"
              class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-accent-ink focus:outline-none"
            />
          </div>
        </div>

        <div class="mt-5 border-t border-border pt-5">
          <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            {{ t('settings.reportRecipientEmail') }}
          </label>
          <input
            v-model="reportRecipientEmail"
            type="email"
            placeholder="you@example.com"
            class="w-full max-w-sm rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
          />
          <p class="mt-1 text-xs text-ink-faint">
            {{ t('settings.emailHelp') }}
          </p>
        </div>

        <div class="mt-5 border-t border-border pt-5">
          <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            {{ t('settings.reportLanguage') }}
          </label>
          <select
            v-model="reportLanguage"
            class="w-full max-w-sm rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-accent-ink focus:outline-none"
          >
            <option value="en">{{ t('settings.reportLanguageEn') }}</option>
            <option value="id">{{ t('settings.reportLanguageId') }}</option>
          </select>
          <p class="mt-1 text-xs text-ink-faint">
            {{ t('settings.reportLanguageHelp') }}
          </p>
        </div>

        <div class="mt-5 border-t border-border pt-5">
          <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            {{ t('settings.monthlyCostCap') }}
          </label>
          <input
            v-model="monthlyCostCapUsd"
            type="text"
            inputmode="decimal"
            placeholder="20"
            class="w-full max-w-sm rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
          />
          <p class="mt-1 text-xs text-ink-faint">
            {{ t('settings.monthlyCostCapHelp') }}
          </p>
        </div>

        <div v-if="adsSupported" class="mt-5 border-t border-border pt-5">
          <h2 class="mb-1 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">{{ t('settings.ads.title') }}</h2>
          <p class="mb-3 text-xs text-ink-faint">{{ t('settings.ads.intro') }}</p>
          <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ads-name">{{ t('settings.ads.dealerName') }}</label>
              <input id="ads-name" v-model="dealerName" type="text" maxlength="40" class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none" />
            </div>
            <div>
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ads-wa">{{ t('settings.ads.whatsapp') }}</label>
              <input id="ads-wa" v-model="dealerWhatsapp" type="text" inputmode="tel" maxlength="20" class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none" />
              <p class="mt-1 text-xs text-ink-faint">{{ t('settings.ads.whatsappHelp') }}</p>
            </div>
            <div>
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ads-city">{{ t('settings.ads.city') }}</label>
              <input id="ads-city" v-model="dealerCity" type="text" maxlength="40" class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none" />
            </div>
            <div>
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ads-area">{{ t('settings.ads.area') }}</label>
              <input id="ads-area" v-model="dealerArea" type="text" maxlength="40" class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none" />
            </div>
          </div>
          <div class="mt-5">
            <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ads-url">{{ t('settings.ads.landingUrl') }}</label>
            <input id="ads-url" v-model="dealerLandingUrl" type="url" placeholder="https://" class="w-full max-w-md rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none" />
            <p class="mt-1 text-xs text-ink-faint">{{ t('settings.ads.landingUrlHelp') }}</p>
          </div>

          <fieldset class="mt-5">
            <legend class="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">{{ t('settings.ads.claimsTitle') }}</legend>
            <p class="mb-2 text-xs text-ink-faint">{{ t('settings.ads.claimsHelp') }}</p>
            <label class="mb-1 flex items-center gap-2 text-sm text-ink-soft"><input v-model="claimInstallments" type="checkbox" class="h-4 w-4 accent-rosso" /> {{ t('settings.ads.claims.installments') }}</label>
            <label class="mb-1 flex items-center gap-2 text-sm text-ink-soft"><input v-model="claimTradeIn" type="checkbox" class="h-4 w-4 accent-rosso" /> {{ t('settings.ads.claims.tradeIn') }}</label>
            <label class="mb-1 flex items-center gap-2 text-sm text-ink-soft"><input v-model="claimTestDrive" type="checkbox" class="h-4 w-4 accent-rosso" /> {{ t('settings.ads.claims.testDrive') }}</label>
            <label class="mb-1 flex items-center gap-2 text-sm text-ink-soft"><input v-model="claimInspection" type="checkbox" class="h-4 w-4 accent-rosso" /> {{ t('settings.ads.claims.inspection') }}</label>
            <div v-if="claimInspection" class="mt-2 max-w-md">
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ads-wording">{{ t('settings.ads.inspectionWording') }}</label>
              <input id="ads-wording" v-model="inspectionWording" type="text" maxlength="60" class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none" />
            </div>
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

        <div v-if="campaignBudgetSupported" class="mt-5 border-t border-border pt-5">
          <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
            {{ t('settings.campaignBudget.title') }}
          </h2>
          <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="cb-floor">
                {{ t('settings.campaignBudget.floor') }}
              </label>
              <input
                id="cb-floor"
                v-model="campaignBudgetFloor"
                type="text"
                inputmode="numeric"
                placeholder="20000"
                class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
              />
              <p class="mt-1 text-xs text-ink-faint">{{ t('settings.campaignBudget.floorHelp') }}</p>
            </div>
            <div>
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="cb-ceiling">
                {{ t('settings.campaignBudget.ceiling') }}
              </label>
              <input
                id="cb-ceiling"
                v-model="campaignBudgetCeiling"
                type="text"
                inputmode="numeric"
                placeholder="100000"
                class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
              />
              <p class="mt-1 text-xs text-ink-faint">{{ t('settings.campaignBudget.ceilingHelp') }}</p>
            </div>
          </div>
          <p class="mt-2 text-xs text-ink-faint">{{ t('settings.campaignBudget.note') }}</p>
        </div>

        <div v-if="keywordSettingsSupported" class="mt-5 border-t border-border pt-5">
          <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
            {{ t('settings.keywordOptimizer.title') }}
          </h2>
          <label class="flex items-start gap-3">
            <input v-model="keywordOptimizerEnabled" type="checkbox" class="mt-0.5 h-4 w-4 accent-rosso" />
            <span class="text-sm text-ink-soft">
              <span class="font-medium text-ink">{{ t('settings.keywordOptimizer.enabledTitle') }}</span><br />
              {{ t('settings.keywordOptimizer.enabledDesc') }}
            </span>
          </label>

          <div v-if="keywordRunTimeSupported" class="mt-4 max-w-xs">
            <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ko-run-time">
              {{ t('settings.keywordOptimizer.runTime') }}
            </label>
            <input
              id="ko-run-time"
              v-model="keywordRunTime"
              type="time"
              class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-accent-ink focus:outline-none"
            />
            <p class="mt-1 text-xs text-ink-faint">{{ t('settings.keywordOptimizer.runTimeHelp') }}</p>
          </div>

          <div class="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ko-test-share">
                {{ t('settings.keywordOptimizer.testBudgetShare') }}
              </label>
              <input
                id="ko-test-share"
                v-model="keywordTestBudgetShare"
                type="text"
                inputmode="decimal"
                placeholder="0.2"
                class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
              />
              <p class="mt-1 text-xs text-ink-faint">{{ t('settings.keywordOptimizer.testBudgetShareHelp') }}</p>
            </div>
            <div>
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ko-min-p">
                {{ t('settings.keywordOptimizer.minConfidenceP') }}
              </label>
              <input
                id="ko-min-p"
                v-model="keywordMinConfidenceP"
                type="text"
                inputmode="decimal"
                placeholder="0.05"
                class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
              />
              <p class="mt-1 text-xs text-ink-faint">{{ t('settings.keywordOptimizer.minConfidencePHelp') }}</p>
            </div>
            <div>
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ko-spend-share">
                {{ t('settings.keywordOptimizer.allowedSpendShare') }}
              </label>
              <input
                id="ko-spend-share"
                v-model="inventoryAllowedSpendShare"
                type="text"
                inputmode="decimal"
                placeholder="0.2"
                class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
              />
              <p class="mt-1 text-xs text-ink-faint">{{ t('settings.keywordOptimizer.allowedSpendShareHelp') }}</p>
            </div>
            <div>
              <label class="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint" for="ko-lead-rate">
                {{ t('settings.keywordOptimizer.leadToSaleRate') }}
              </label>
              <input
                id="ko-lead-rate"
                v-model="inventoryLeadToSaleRate"
                type="text"
                inputmode="decimal"
                placeholder="0.02"
                class="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
              />
              <p class="mt-1 text-xs text-ink-faint">{{ t('settings.keywordOptimizer.leadToSaleRateHelp') }}</p>
            </div>
          </div>

          <!-- Status only. The inventory connection string lives in the server's .env and is never shown or edited here. -->
          <p v-if="inventory" class="mt-4 text-sm text-ink-soft">
            {{ t('settings.keywordOptimizer.inventoryStatus', { source: t(`keywordOptimizer.inventory.source.${inventory.source}`) }) }}
            <span v-if="inventory.error" class="text-flag-caution"> · {{ inventory.error }}</span>
          </p>
          <p class="mt-1 text-xs text-ink-faint">{{ t('settings.keywordOptimizer.inventoryNote') }}</p>
        </div>

        <button
          type="button"
          class="mt-5 rounded-md bg-rosso px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-bianco disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? t('settings.saving') : t('settings.save') }}
        </button>
        <span v-if="saved" class="ml-3 text-sm text-flag-good">{{ t('settings.saved') }}</span>
      </div>

      <div v-if="problemKey" class="mt-4 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-3 text-sm text-flag-critical" role="alert">
        {{ t(problemKey) }}
      </div>
      <div v-if="error" class="mt-4 rounded-lg border border-flag-critical/40 bg-flag-critical-soft px-5 py-3 text-sm text-flag-critical">
        {{ error }}
      </div>
    </template>
  </main>
</template>
