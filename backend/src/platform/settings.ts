// App-wide key/value settings — pipeline run times, the critic's
// grade-forces-revision gate, the report email recipient, and the report
// generation language. See schema.sql's app_settings table, docs/PROJECT.md's
// Automation section, criticLoop.ts, emailDelivery.ts, and orchestrator.ts.

import { query } from '../data/db.js'
import { REPORT_RECIPIENT_EMAIL } from './config.js'

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidTime(value: string): boolean {
  return HHMM_RE.test(value)
}

function isValidBoolean(value: string): boolean {
  return value === 'true' || value === 'false'
}

// Empty string is valid — it means "no recipient configured," matching
// the pre-existing behavior of printing the report instead of emailing it.
function isValidEmail(value: string): boolean {
  return value === '' || EMAIL_RE.test(value)
}

// Exported: also used to validate the ad-hoc `language` param on the live
// Ask/Aska endpoints (reporting/ask.ts, reporting/assistant.ts), which is
// separate from the report_language setting this file otherwise governs.
export function isValidLanguage(value: string): boolean {
  return value === 'en' || value === 'id'
}

// Empty string means "no cap" (disabled) — same "empty = off" convention as
// report_recipient_email. A cap of exactly 0 is rejected rather than treated
// as "block everything": that's what disabling is for, and a 0 cap reads
// like a mistake more often than an intent.
export function isValidCostCap(value: string): boolean {
  if (value === '') return true
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

// A share or rate in [0, 1] — keyword_test_budget_share,
// inventory_allowed_spend_share, inventory_lead_to_sale_rate. Empty is not
// allowed: unlike the cost cap, there is no "off" meaning for these.
export function isValidShare(value: string): boolean {
  if (value.trim() === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= 1
}

// A whole-rupiah amount above zero — the campaign proposal budget floor and
// ceiling (contract 3.3).
export function isValidRupiah(value: string): boolean {
  if (!/^\d+$/.test(value.trim())) return false
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0
}

// Contract 3.6 — dealer facts that reach ad copy: one line of text, no
// control characters and no '!' (a headline may not carry one), between
// `min` and `max` characters once trimmed.
export function isValidAdText(min: number, max: number): (value: string) => boolean {
  return (value) => {
    const t = value.trim()
    // eslint-disable-next-line no-control-regex
    return t.length >= min && t.length <= max && !/[\u0000-\u001f\u007f!]/.test(value)
  }
}

// Empty (not used), or digits, spaces, '-' and '+', at most 20 characters —
// dealer_whatsapp (contract 3.6).
export function isValidPhone(value: string): boolean {
  return value.length <= 20 && /^[\d +-]*$/.test(value)
}

// Empty (not set), or an absolute http(s) URL — dealer_landing_url.
export function isValidLandingUrl(value: string): boolean {
  if (value === '') return true
  if (value.length > 2048 || /\s/.test(value)) return false
  try {
    const u = new URL(value)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname !== ''
  } catch {
    return false
  }
}

// Only the simulated writer exists in 3.6: 'live' is refused until a live
// writer is built (contract 3.6, phase 4).
export function isValidWriteMode(value: string): boolean {
  return value === 'simulated'
}

// A significance level in (0, 1] — keyword_min_confidence_p. 0 is rejected:
// the n_min formula takes ln(p), and p = 0 would mean "never call anything
// significant".
export function isValidPValue(value: string): boolean {
  return isValidShare(value) && Number(value) > 0
}

// report_recipient_email's default comes from the pre-existing env var
// (not a schema.sql seed row, since schema.sql can't see env vars) so
// anyone who already had REPORT_RECIPIENT_EMAIL set keeps working
// unchanged until they override it from the Settings page.
const DEFAULTS = {
  daily_run_time: '06:00',
  weekly_run_time: '06:00',
  grade_forces_revision: 'false',
  report_recipient_email: REPORT_RECIPIENT_EMAIL ?? '',
  report_language: 'en',
  auto_reports_enabled: 'true',
  // Defaults enabled, not off — measured real usage is roughly $4-7/month at
  // one run/day (see PROJECT.md's cost guardrails), so this is a wide safety
  // margin, not a tight limit. Protects against a scheduling bug or a stuck
  // loop triggering runs back-to-back, which nothing else in code prevents
  // (only a soft per-run bound: the max-2-revisions cap).
  monthly_cost_cap_usd: '20',
  // Keyword optimizer (docs/overhaul-v3-backend.md). STARTING DEFAULTS, tuned
  // against the scoring harness, not fixed rules.
  // Contract 3.5: the on/off switch for Kai's automatic daily run, which is
  // independent of auto_reports_enabled, and its time (HH:MM, WIB).
  keyword_optimizer_enabled: 'true',
  keyword_optimizer_run_time: '06:00',
  keyword_test_budget_share: '0.2',
  keyword_min_confidence_p: '0.05',
  inventory_allowed_spend_share: '0.2',
  inventory_lead_to_sale_rate: '0.02',
  // Contract 3.3 — bounds on a proposed campaign's daily budget, in whole
  // rupiah. STARTING DEFAULTS sized against the demo account (about Rp 90,000
  // a day across all campaigns).
  campaign_daily_budget_floor_idr: '20000',
  campaign_daily_budget_ceiling_idr: '100000',
  // Contract 3.6 — the dealer facts ad copy may use, which claims it may
  // make, and the launch kill switch (off by default) and writer mode.
  dealer_name: 'Pitstop Used Cars',
  dealer_city: 'Tangerang',
  dealer_area: 'Gading Serpong',
  dealer_whatsapp: '0812-5550-0123', // placeholder until the owner sets the real number
  dealer_landing_url: '',
  ads_claim_installments: 'true',
  ads_claim_trade_in: 'true',
  ads_claim_test_drive: 'true',
  ads_claim_inspection: 'true',
  ads_inspection_wording: 'Unit sudah melalui pemeriksaan',
  ads_write_enabled: 'false',
  ads_write_mode: 'simulated',
} as const

export type SettingKey = keyof typeof DEFAULTS

const VALIDATORS: Record<SettingKey, (value: string) => boolean> = {
  daily_run_time: isValidTime,
  weekly_run_time: isValidTime,
  grade_forces_revision: isValidBoolean,
  report_recipient_email: isValidEmail,
  report_language: isValidLanguage,
  auto_reports_enabled: isValidBoolean,
  monthly_cost_cap_usd: isValidCostCap,
  keyword_optimizer_enabled: isValidBoolean,
  keyword_optimizer_run_time: isValidTime,
  keyword_test_budget_share: isValidShare,
  keyword_min_confidence_p: isValidPValue,
  inventory_allowed_spend_share: isValidShare,
  inventory_lead_to_sale_rate: isValidShare,
  campaign_daily_budget_floor_idr: isValidRupiah,
  campaign_daily_budget_ceiling_idr: isValidRupiah,
  dealer_name: isValidAdText(1, 40),
  dealer_city: isValidAdText(0, 40),
  dealer_area: isValidAdText(0, 40),
  dealer_whatsapp: isValidPhone,
  dealer_landing_url: isValidLandingUrl,
  ads_claim_installments: isValidBoolean,
  ads_claim_trade_in: isValidBoolean,
  ads_claim_test_drive: isValidBoolean,
  ads_claim_inspection: isValidBoolean,
  ads_inspection_wording: isValidAdText(0, 60),
  ads_write_enabled: isValidBoolean,
  ads_write_mode: isValidWriteMode,
}

export const SETTING_KEYS = Object.keys(DEFAULTS) as SettingKey[]

/** The per-key check setSetting applies (PUT /settings answers 400 on false). */
export function isValidSettingValue(key: SettingKey, value: string): boolean {
  return VALIDATORS[key](value)
}

export function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as string[]).includes(key)
}

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await query<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings WHERE key = ANY($1)',
    [SETTING_KEYS]
  )
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Record<SettingKey, string>>
  // Fall back to the schema.sql/env-var defaults in case a row is somehow missing.
  return Object.fromEntries(SETTING_KEYS.map((k) => [k, map[k] ?? DEFAULTS[k]])) as Record<SettingKey, string>
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  const validate = VALIDATORS[key]
  if (!validate) throw new Error(`Unknown setting key: ${key}`)
  if (key === 'ads_write_mode' && value === 'live') {
    throw new Error("Invalid value for ads_write_mode: 'live' — only 'simulated' exists until a live writer is built")
  }
  if (!validate(value)) throw new Error(`Invalid value for ${key}: '${value}'`)
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value]
  )
}
