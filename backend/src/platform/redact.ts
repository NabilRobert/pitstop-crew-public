// Scrubs secrets from free text before it leaves the process or is stored:
// the demo view of the live console, the demo view of run errors, and (later)
// stored prompt/response payloads. Pattern-based plus the literal values of
// this process's own secret env vars, so a key that ends up in an error
// message is caught even if it matches no known format.

const REDACTED = '[redacted]'

const SECRET_ENV_KEY = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|_STRING|DSN)$/i
const PASSWORD_ENV_KEY = /(SECRET|PASSWORD|PASSWD)$/i
// Short values are skipped so ordinary words aren't blanked out — except
// passwords, which are worth catching even when short (a weak one is exactly
// the one likely to show up in an error message).
const MIN_SECRET_LENGTH = 8
const MIN_PASSWORD_LENGTH = 4

let cachedLiterals: string[] | null = null

function secretLiterals(): string[] {
  if (cachedLiterals) return cachedLiterals
  const out = new Set<string>()
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue
    const min = PASSWORD_ENV_KEY.test(key) ? MIN_PASSWORD_LENGTH : MIN_SECRET_LENGTH
    if (SECRET_ENV_KEY.test(key) && value.length >= min) out.add(value)
    // A connection string leaks through its host as well as its password.
    if (/_STRING$|_URL$|DSN$/i.test(key)) {
      try {
        const host = new URL(value).hostname
        if (host.length >= MIN_SECRET_LENGTH) out.add(host)
      } catch {
        // not a URL
      }
    }
  }
  // Longest first so a value containing another is replaced whole.
  cachedLiterals = [...out].sort((a, b) => b.length - a.length)
  return cachedLiterals
}

const PATTERNS: [RegExp, string][] = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>]*@[^\s'"<>]*/gi, '[redacted-url]'],
  [/\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s'"<>]+/gi, '[redacted-url]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  [/\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\b(?:re|ghp|gho|ghs|xox[a-z])[-_][A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, REDACTED],
  [/\b[A-Fa-f0-9]{32,}\b/g, REDACTED],
  [
    /((?:api[_-]?key|secret|token|password|passwd|pwd|authorization|client[_-]?secret)["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
    `$1${REDACTED}`,
  ],
  [/\b\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}\b/g, '[redacted-host]'],
]

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function redactSecrets(text: string): string {
  let out = text
  for (const literal of secretLiterals()) out = out.replace(new RegExp(escapeRegExp(literal), 'g'), REDACTED)
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement)
  return out
}

const MAX_EVENT_TEXT = 300

/** One line of plain event text: no stack traces (only the first line is
 * kept — errors are emitted as "message\n\nstack"), no secrets. */
export function safeEventText(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0] ?? ''
  const text = redactSecrets(firstLine).trim()
  return text.length > MAX_EVENT_TEXT ? `${text.slice(0, MAX_EVENT_TEXT)}…` : text
}
