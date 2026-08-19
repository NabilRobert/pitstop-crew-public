// Single pre-set account, in-memory session tokens. No user table, no
// password hashing — see PROJECT.md / the auth plan for why: the trust
// boundary here is .env, same as every other secret in this app, and an
// in-memory Set means every backend restart forces a fresh login for free.
import crypto from 'node:crypto'
import { AUTH_USERNAME, AUTH_PASSWORD } from './config.js'

const validTokens = new Set<string>()

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

export function login(username: string, password: string, ip: string): string {
  if (isLockedOut(ip)) {
    throw new Error('Too many failed attempts. Try again in 15 minutes.')
  }
  if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
    recordFailure(ip)
    throw new Error('Invalid username or password.')
  }
  clearFailures(ip)
  const token = crypto.randomBytes(32).toString('hex')
  validTokens.add(token)
  return token
}

export function isValidToken(token: string | undefined | null): boolean {
  return !!token && validTokens.has(token)
}

export function logout(token: string | undefined | null): void {
  if (token) validTokens.delete(token)
}
