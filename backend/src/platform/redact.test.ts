// Unit tests for redact.ts — the only thing standing between a leaked
// secret and the demo console / a stored run error. Promotes the backend
// session's own ad hoc manual test cases from this session (a fake key, a
// connection string, a stack trace, a real password) into permanent,
// regression-proof cases.
//
// secretLiterals() memoizes process.env into a module-level cache on its
// first call, so the fake env vars below are set at module top level —
// before any test body runs redactSecrets() for the first time — rather
// than per-test. Vitest isolates each test file's module graph by default,
// so this doesn't leak into other test files.

import { describe, it, expect } from 'vitest'
import { redactSecrets, safeEventText } from './redact.js'

// Deliberately not shaped like a real key prefix (no "sk-") — an earlier
// version of this fixture used one and got partially masked somewhere in
// transit between two Claude sessions relaying this file by paste, which
// silently made its assertion vacuous (checking for a substring the masked
// fixture never contained). A plain word-based value has no such format to
// trip over.
process.env.TEST_API_KEY = 'testFixtureValueNotARealSecret12345'
process.env.TEST_DB_STRING = 'postgres://user:hunter2@db.example.internal:6432/app'
// Short (below the generic 8-char minimum), and deliberately not a substring
// of any other fixture value in this file — literal redaction runs before
// the pattern-based passes, so a fixture that collides with another (e.g. a
// short password that happens to prefix a fake token below) would mangle it
// before the pattern under test even gets a chance to run.
process.env.TEST_PASSWORD = 'zqx9'
// Same shape as the keyword optimizer's INVENTORY_DB_STRING (a *_STRING key),
// set the same way the real one is: from .env, before the first redaction.
process.env.INVENTORY_DB_STRING = 'postgresql://inv_ro:inventoryPw77@inventory.dealer.example:5432/stock'

describe('redactSecrets — pattern-based (no env dependency)', () => {
  it('redacts a Bearer token — the token itself must be gone, whatever the surrounding text ends up as', () => {
    // Not asserting the exact output shape here: the generic key=value
    // pattern (further down PATTERNS) also matches "Authorization: Bearer"
    // after the Bearer-specific pattern has already run, so the word
    // "Bearer" ends up redacted too (harmless double redaction, not a leak —
    // the actual secret is gone either way). The invariant that matters is
    // that the token itself never survives.
    const out = redactSecrets('Authorization: Bearer abcdefgh12345678')
    expect(out).not.toContain('abcdefgh12345678')
    expect(out).toContain('[redacted]')
  })

  it('redacts a bare Postgres connection string', () => {
    const out = redactSecrets('connect failed: postgres://alice:s3cr3t@10.0.0.5:5432/pitstop')
    expect(out).not.toContain('s3cr3t')
    expect(out).not.toContain('10.0.0.5')
    expect(out).toContain('[redacted')
  })

  it('redacts a key=value style secret regardless of exact key name', () => {
    const out = redactSecrets('config: password=SuperSecret123 loaded')
    expect(out).toBe('config: password=[redacted] loaded')
  })

  it('leaves ordinary text with no secrets unchanged', () => {
    const line = 'Anna: analyzing performance data for the last 30 days'
    expect(redactSecrets(line)).toBe(line)
  })
})

describe('redactSecrets — literal env-var values', () => {
  it('redacts the exact value of a *_KEY env var wherever it appears', () => {
    const out = redactSecrets(`upstream 500, key was ${process.env.TEST_API_KEY}`)
    expect(out).not.toContain('NotARealSecret')
    expect(out).toContain('[redacted]')
  })

  it('redacts a short password value (below the generic 8-char minimum)', () => {
    const out = redactSecrets(`login failed for password ${process.env.TEST_PASSWORD}`)
    expect(out).not.toContain('zqx9')
  })

  it('redacts a connection string env var by its literal value and its hostname', () => {
    const out = redactSecrets(`db error: ${process.env.TEST_DB_STRING}`)
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('db.example.internal')
  })

  it('redacts INVENTORY_DB_STRING (password and host) even when quoted without its scheme', () => {
    const out = redactSecrets('inventory connect to inventory.dealer.example failed (pw inventoryPw77)')
    expect(out).not.toContain('inventory.dealer.example')
    expect(out).not.toContain('inventoryPw77')
  })
})

describe('safeEventText', () => {
  it('keeps only the first line — errors are emitted as "message\\n\\nstack"', () => {
    const message = 'analysis returned an empty draft\n\nError: boom\n    at Object.<anonymous> (/app/dist/x.js:1:1)'
    const out = safeEventText(message)
    expect(out).toBe('analysis returned an empty draft')
    expect(out).not.toContain('at Object')
  })

  it('redacts secrets even on the kept first line', () => {
    const out = safeEventText(`upstream 500 for Bearer abcdefgh12345678\n\nstack line`)
    expect(out).toContain('[redacted]')
    expect(out).not.toContain('abcdefgh12345678')
  })

  it('truncates a very long line and marks it truncated', () => {
    const out = safeEventText('x'.repeat(500))
    expect(out.length).toBeLessThan(310)
    expect(out.endsWith('…')).toBe(true)
  })

  it('passes a short, clean message through unchanged', () => {
    expect(safeEventText('Ciri: analysis approved — grade A')).toBe('Ciri: analysis approved — grade A')
  })
})
