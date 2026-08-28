// Internal alert-dedupe bookkeeping — backed by the same app_settings
// table platform/settings.ts uses, but deliberately bypassing that module:
// settings.ts's SETTING_KEYS/DEFAULTS/VALIDATORS is the user-facing
// Settings page's fixed schema, and alert-dedupe flags (e.g. "have we
// already emailed about this outage") aren't something that should show
// up there. Plain, untyped key/value — any key is valid.

import { query, queryOne } from '../data/db.js'

export async function getAlertState(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [key])
  return row?.value ?? null
}

export async function setAlertState(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value]
  )
}
