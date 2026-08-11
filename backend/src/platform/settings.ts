// App-wide key/value settings — pipeline run times, the critic's
// grade-forces-revision gate, the report email recipient, and the report
// generation language. See schema.sql's app_settings table, PROJECT.md's
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

function isValidLanguage(value: string): boolean {
  return value === 'en' || value === 'id'
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
} as const

export type SettingKey = keyof typeof DEFAULTS

const VALIDATORS: Record<SettingKey, (value: string) => boolean> = {
  daily_run_time: isValidTime,
  weekly_run_time: isValidTime,
  grade_forces_revision: isValidBoolean,
  report_recipient_email: isValidEmail,
  report_language: isValidLanguage,
}

export const SETTING_KEYS = Object.keys(DEFAULTS) as SettingKey[]

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
  return {
    daily_run_time: map.daily_run_time ?? DEFAULTS.daily_run_time,
    weekly_run_time: map.weekly_run_time ?? DEFAULTS.weekly_run_time,
    grade_forces_revision: map.grade_forces_revision ?? DEFAULTS.grade_forces_revision,
    report_recipient_email: map.report_recipient_email ?? DEFAULTS.report_recipient_email,
    report_language: map.report_language ?? DEFAULTS.report_language,
  }
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  const validate = VALIDATORS[key]
  if (!validate) throw new Error(`Unknown setting key: ${key}`)
  if (!validate(value)) throw new Error(`Invalid value for ${key}: '${value}'`)
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value]
  )
}
