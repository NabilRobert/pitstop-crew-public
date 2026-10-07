import { ref, onMounted } from 'vue'
import { api } from '../../shared/api/api'
import { keywordOptimizerApi } from '../keyword-optimizer/keywordOptimizerApi'
import type { InventorySummary, Settings } from '../../shared/api/types'

/** HH:MM, 24-hour, like the backend's isValidTime. */
export function isValidRunTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** Whole rupiah typed as a string: digits only (surrounding spaces ignored), a safe integer, above 0. Matches the backend. */
export function isWholeRupiah(value: string): boolean {
  const v = value.trim()
  return /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) > 0
}

/** A 0-1 share/rate typed as a string. `exclusiveZero` rejects 0 itself (a p-value of 0 means nothing). */
export function isUnitInterval(value: string, exclusiveZero = false): boolean {
  if (value.trim() === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n <= 1 && (exclusiveZero ? n > 0 : n >= 0)
}

export function useSettings() {
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const saved = ref(false)
  /** i18n key of a client-side validation problem to show instead of calling the API. */
  const problemKey = ref<string | null>(null)

  const dailyRunTime = ref('06:00')
  const weeklyRunTime = ref('06:00')
  const reportRecipientEmail = ref('')
  const reportLanguage = ref('en')
  const autoReportsEnabled = ref(true)
  // String, not number — empty string means "disabled", same "empty = off"
  // convention as reportRecipientEmail, so it must round-trip through the
  // input as-is rather than being coerced to 0.
  const monthlyCostCapUsd = ref('')

  // Overhaul v3 keyword optimizer settings. `keywordSettingsSupported` is false when the backend
  // predates them (GET /settings simply does not include the keys, and PUT /settings silently
  // ignores unknown keys), so the section is hidden rather than showing fields that save nothing.
  const keywordSettingsSupported = ref(false)
  const keywordOptimizerEnabled = ref(true)
  // Contract 3.5: when the optimizer runs by itself. Hidden until the server sends it.
  const keywordRunTimeSupported = ref(false)
  const keywordRunTime = ref('06:00')
  const keywordTestBudgetShare = ref('')
  const keywordMinConfidenceP = ref('')
  const inventoryAllowedSpendShare = ref('')
  const inventoryLeadToSaleRate = ref('')
  // Contract 3.4: the daily budget bounds for proposed campaigns, in whole rupiah. Hidden until the backend sends them.
  const campaignBudgetSupported = ref(false)
  const campaignBudgetFloor = ref('')
  const campaignBudgetCeiling = ref('')
  // Read-only status; the inventory connection string is never shown, edited or fetched here.
  const inventory = ref<InventorySummary | null>(null)

  function applyKeywordSettings(settings: Settings) {
    campaignBudgetSupported.value = settings.campaign_daily_budget_floor_idr !== undefined
    if (campaignBudgetSupported.value) {
      campaignBudgetFloor.value = settings.campaign_daily_budget_floor_idr ?? ''
      campaignBudgetCeiling.value = settings.campaign_daily_budget_ceiling_idr ?? ''
    }
    keywordSettingsSupported.value = settings.keyword_optimizer_enabled !== undefined
    if (!keywordSettingsSupported.value) return
    keywordOptimizerEnabled.value = settings.keyword_optimizer_enabled === 'true'
    keywordRunTimeSupported.value = settings.keyword_optimizer_run_time !== undefined
    if (keywordRunTimeSupported.value) keywordRunTime.value = settings.keyword_optimizer_run_time ?? '06:00'
    keywordTestBudgetShare.value = settings.keyword_test_budget_share ?? ''
    keywordMinConfidenceP.value = settings.keyword_min_confidence_p ?? ''
    inventoryAllowedSpendShare.value = settings.inventory_allowed_spend_share ?? ''
    inventoryLeadToSaleRate.value = settings.inventory_lead_to_sale_rate ?? ''
  }

  /** Returns an i18n key for the first invalid keyword setting, or null. */
  function keywordSettingsProblem(): string | null {
    if (campaignBudgetSupported.value) {
      if (!isWholeRupiah(campaignBudgetFloor.value)) return 'settings.keywordOptimizer.invalid.budgetFloor'
      if (!isWholeRupiah(campaignBudgetCeiling.value)) return 'settings.keywordOptimizer.invalid.budgetCeiling'
    }
    if (!keywordSettingsSupported.value) return null
    if (keywordRunTimeSupported.value && !isValidRunTime(keywordRunTime.value)) return 'settings.keywordOptimizer.invalid.runTime'
    if (!isUnitInterval(keywordTestBudgetShare.value)) return 'settings.keywordOptimizer.invalid.testBudgetShare'
    if (!isUnitInterval(keywordMinConfidenceP.value, true)) return 'settings.keywordOptimizer.invalid.minConfidenceP'
    if (!isUnitInterval(inventoryAllowedSpendShare.value)) return 'settings.keywordOptimizer.invalid.allowedSpendShare'
    if (!isUnitInterval(inventoryLeadToSaleRate.value)) return 'settings.keywordOptimizer.invalid.leadToSaleRate'
    return null
  }

  onMounted(async () => {
    try {
      const settings = await api.settings()
      dailyRunTime.value = settings.daily_run_time
      weeklyRunTime.value = settings.weekly_run_time
      reportRecipientEmail.value = settings.report_recipient_email
      reportLanguage.value = settings.report_language
      autoReportsEnabled.value = settings.auto_reports_enabled === 'true'
      monthlyCostCapUsd.value = settings.monthly_cost_cap_usd
      applyKeywordSettings(settings)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
    // Best-effort and independent of the settings above: a down inventory source must not block saving.
    try {
      inventory.value = await keywordOptimizerApi.inventory()
    } catch {
      inventory.value = null
    }
  })

  async function save() {
    saving.value = true
    error.value = null
    saved.value = false
    const problem = keywordSettingsProblem()
    if (problem) {
      problemKey.value = problem
      saving.value = false
      return
    }
    problemKey.value = null
    try {
      const settings = await api.updateSettings({
        daily_run_time: dailyRunTime.value,
        weekly_run_time: weeklyRunTime.value,
        report_recipient_email: reportRecipientEmail.value.trim(),
        report_language: reportLanguage.value,
        auto_reports_enabled: String(autoReportsEnabled.value),
        monthly_cost_cap_usd: monthlyCostCapUsd.value.trim(),
        ...(campaignBudgetSupported.value
          ? {
              campaign_daily_budget_floor_idr: campaignBudgetFloor.value.trim(),
              campaign_daily_budget_ceiling_idr: campaignBudgetCeiling.value.trim(),
            }
          : {}),
        ...(keywordSettingsSupported.value
          ? {
              keyword_optimizer_enabled: String(keywordOptimizerEnabled.value),
              ...(keywordRunTimeSupported.value ? { keyword_optimizer_run_time: keywordRunTime.value } : {}),
              keyword_test_budget_share: keywordTestBudgetShare.value.trim(),
              keyword_min_confidence_p: keywordMinConfidenceP.value.trim(),
              inventory_allowed_spend_share: inventoryAllowedSpendShare.value.trim(),
              inventory_lead_to_sale_rate: inventoryLeadToSaleRate.value.trim(),
            }
          : {}),
      })
      dailyRunTime.value = settings.daily_run_time
      weeklyRunTime.value = settings.weekly_run_time
      reportRecipientEmail.value = settings.report_recipient_email
      reportLanguage.value = settings.report_language
      autoReportsEnabled.value = settings.auto_reports_enabled === 'true'
      monthlyCostCapUsd.value = settings.monthly_cost_cap_usd
      applyKeywordSettings(settings)
      saved.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      saving.value = false
    }
  }

  return {
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
  }
}
