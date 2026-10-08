// Pure checks for the settings the owner types, each matching the backend's validator for the same key.
// Kept apart from useSettings so they can be read, and tested, without any of the page's state.

/** Dealer profile checks, matching the backend's (contract 3.6). */
export const isDealerName = (v: string) => v.trim().length > 0 && v.trim().length <= 40
export const isShortText = (v: string, max = 40) => v.trim().length <= max
/** Digits, spaces, '-' and '+', at most 20 characters; may be empty (a placeholder number in the demo). */
export const isPhone = (v: string) => /^[0-9 +\-]{0,20}$/.test(v)
/** Empty (no landing page yet), or an http(s) URL. */
export function isLandingUrl(v: string): boolean {
  const t = v.trim()
  if (t === '') return true
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

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
