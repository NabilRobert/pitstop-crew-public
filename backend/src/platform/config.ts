// Central settings, loaded once from the repo-root .env file.

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'
import dotenv from 'dotenv'

// A fixed relative depth (e.g. "up two levels") breaks depending on
// whether this runs as source (src/config.ts, tsx) or compiled output
// (dist/src/config.js, node) — the extra dist/ nesting shifted the repo
// root by one level and silently loaded zero env vars in production.
// Walk up looking for schema.sql (a reliable, unique repo-root marker for
// this project) instead of guessing a depth.
function findRepoRoot(startDir: string): string {
  let dir = startDir
  while (!existsSync(path.join(dir, 'schema.sql'))) {
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`Could not locate repo root (schema.sql) above ${startDir}`)
    dir = parent
  }
  return dir
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = findRepoRoot(__dirname)
dotenv.config({ path: path.join(REPO_ROOT, '.env') })

// Postgres, hosted on Sumopod (Sumobase).
export const DATABASE_URL = process.env.PITSTOP_DB_STRING

// Google Ads credentials — keys match what's already in the repo's .env.
export const GADS_DEVELOPER_TOKEN = process.env['gads-api-token']
export const GADS_CLIENT_ID = process.env['client-id']
export const GADS_CLIENT_SECRET = process.env['client-secret']
export const GADS_REFRESH_TOKEN = process.env['gads-refresh-token']
export const GADS_LOGIN_CUSTOMER_ID = process.env['gads-login-customer-id'] // the MCC id
// The account actually being queried. Defaults to the MCC id, which is only
// correct if the MCC itself is the working account — set this separately in
// .env (gads-target-customer-id) if the real account is a distinct client
// under the MCC. Not yet confirmed which applies here.
export const GADS_TARGET_CUSTOMER_ID =
  process.env['gads-target-customer-id'] || GADS_LOGIN_CUSTOMER_ID

// AI layer — routed through Sumopod (OpenAI-compatible gateway), not OpenAI
// directly. Host confirmed as ai.sumopod.com; exact path not confirmed from
// official docs (sparse at time of writing) — SUMOPOD_BASE_URL is
// overridable in .env in case the default guess is wrong.
export const SUMOPOD_API_KEY = process.env['sumopod-api-key']
export const SUMOPOD_BASE_URL = process.env.SUMOPOD_BASE_URL || 'https://ai.sumopod.com/v1'

// Email — Resend primary, Gmail SMTP fallback (PROJECT.md → Automation).
export const RESEND_API_KEY = process.env.RESEND_API_KEY
export const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'reports@example.com'
export const REPORT_RECIPIENT_EMAIL = process.env.REPORT_RECIPIENT_EMAIL
export const GMAIL_USER = process.env.GMAIL_USER
export const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD

export const DATA_SOURCE = process.env.DATA_SOURCE || 'demo' // "demo" or "live"

// Frontend origin(s), for CORS. Comma-separated if more than one (e.g. the
// deployed frontend + localhost for local dev). Vite's default dev port is 5173.
export const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// API auth — one pre-set account (see platform/auth.ts). Plaintext like
// every other secret above; the trust boundary is .env, not this value.
export const AUTH_USERNAME = process.env.AUTH_USERNAME
export const AUTH_PASSWORD = process.env.AUTH_PASSWORD

// ElevenLabs — TTS/STT for the voice assistant (see platform/elevenlabs.ts).
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
