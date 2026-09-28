// Two pre-set accounts, in-memory session tokens. No user table, no password
// hashing — see PROJECT.md / the auth plan for why: the trust boundary is .env,
// same as every other secret in this app, and an in-memory Map means every
// backend restart forces a fresh login for free.
//
//   owner — AUTH_USERNAME / AUTH_PASSWORD: full access.
//   demo  — DEMO_USERNAME / DEMO_PASSWORD (optional; the demo account does not
//           exist unless both are set): read-only, enforced in
//           api/authMiddleware.ts.
import crypto from 'node:crypto'
import { AUTH_USERNAME, AUTH_PASSWORD, DEMO_USERNAME, DEMO_PASSWORD } from './config.js'

export type Role = 'owner' | 'demo'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const sessions = new Map<string, { role: Role; expiresAt: number }>()

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
const failedAttempts = new Map<string, { count: number; resetAt: number }>()

function isLockedOut(ip: string): boolean {
  const entry = failedAttempts.get(ip)
  if (!entry) return false
  if (Date.now() > entry.resetAt) {
    failedAttempts.delete(ip)
    return false
  }
  return entry.count >= MAX_ATTEMPTS
}

function recordFailure(ip: string): void {
  const entry = failedAttempts.get(ip)
  if (!entry || Date.now() > entry.resetAt) {
    failedAttempts.set(ip, { count: 1, resetAt: Date.now() + LOCKOUT_MS })
  } else {
    entry.count += 1
  }
}

function clearFailures(ip: string): void {
  failedAttempts.delete(ip)
}

// Hash both sides first so timingSafeEqual gets equal-length buffers and the
// comparison time doesn't depend on where the strings differ or their length.
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb)
}

// Both halves are always computed, so a wrong username takes as long as a wrong
// password. An unset account never matches.
function matches(username: string, password: string, expectedUser?: string, expectedPass?: string): boolean {
  if (!expectedUser || !expectedPass) return false
  const userOk = safeEqual(username, expectedUser)
  const passOk = safeEqual(password, expectedPass)
  return userOk && passOk
}

function sweepExpired(): void {
  const now = Date.now()
  for (const [token, session] of sessions) if (now > session.expiresAt) sessions.delete(token)
}

export function login(username: string, password: string, ip: string): { token: string; role: Role } {
  if (isLockedOut(ip)) {
    throw new Error('Too many failed attempts. Try again in 15 minutes.')
  }
  const isOwner = matches(username, password, AUTH_USERNAME, AUTH_PASSWORD)
  const isDemo = matches(username, password, DEMO_USERNAME, DEMO_PASSWORD)
  const role: Role | null = isOwner ? 'owner' : isDemo ? 'demo' : null
  if (!role) {
    recordFailure(ip)
    throw new Error('Invalid username or password.')
  }
  clearFailures(ip)
  sweepExpired()
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { role, expiresAt: Date.now() + TOKEN_TTL_MS })
  return { token, role }
}

/** The role for a live token, or null if it is unknown or expired. */
export function getRole(token: string | undefined | null): Role | null {
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (Date.now() > session.expiresAt) {
    sessions.delete(token)
    return null
  }
  return session.role
}

export function isValidToken(token: string | undefined | null): boolean {
  return getRole(token) !== null
}

export function logout(token: string | undefined | null): void {
  if (token) sessions.delete(token)
}
