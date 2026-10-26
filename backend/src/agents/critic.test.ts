// Unit tests for the pure, safety-critical decision functions in critic.ts.
// These decide whether an AI-generated report is trusted enough to show a
// user — verified so far only by "ran it once, read the output" (see
// PROJECT.md); this is the regression-proof version of that.

import { describe, it, expect } from 'vitest'
import { normalizeVerdict, decideApproval, findUnverifiedQuotes, type CriticVerdict, type CriticIssue } from './critic.js'

describe('normalizeVerdict', () => {
  it('defaults a missing severity to high (fail-safe: an unlabeled issue blocks approval)', () => {
    const v = normalizeVerdict({ has_issues: true, feedback: 'x', grade: 'B', grade_rationale: '', issues: [{ quote: 'q', reason: 'r' }] })
    expect(v.issues[0].severity).toBe('high')
  })

  it('coerces an invalid severity string to high', () => {
    const v = normalizeVerdict({ issues: [{ quote: 'q', reason: 'r', severity: 'critical' as never }] })
    expect(v.issues[0].severity).toBe('high')
  })

  it('keeps a valid low/medium severity as given', () => {
    const v = normalizeVerdict({ issues: [{ quote: 'a', reason: 'x', severity: 'low' }] })
    expect(v.issues[0].severity).toBe('low')
  })

  it('turns an invalid or missing grade into null (fail-safe: blocks approval)', () => {
    expect(normalizeVerdict({ grade: 'Z' as never }).grade).toBeNull()
    expect(normalizeVerdict({}).grade).toBeNull()
    expect(normalizeVerdict(null).grade).toBeNull()
  })

  it('keeps a valid grade letter', () => {
    expect(normalizeVerdict({ grade: 'A' }).grade).toBe('A')
  })

  it('defaults a non-array issues field to an empty array', () => {
    expect(normalizeVerdict({ issues: 'not an array' as never }).issues).toEqual([])
  })

  it('filters out malformed issue entries (missing quote or reason)', () => {
    const v = normalizeVerdict({
      issues: [
        { quote: 'ok', reason: 'ok' },
        { quote: 'no reason' } as never,
        { reason: 'no quote' } as never,
        null as never,
      ],
    })
    expect(v.issues).toHaveLength(1)
    expect(v.issues[0].quote).toBe('ok')
  })

  it('only sets unavailable when explicitly true, and drops a falsy one', () => {
    expect(normalizeVerdict({ unavailable: true }).unavailable).toBe(true)
    expect(normalizeVerdict({ unavailable: false }).unavailable).toBeUndefined()
    expect(normalizeVerdict({}).unavailable).toBeUndefined()
  })

  it('is idempotent — normalizing an already-normalized verdict changes nothing', () => {
    const once = normalizeVerdict({ grade: 'C', issues: [{ quote: 'q', reason: 'r', severity: 'medium' }] })
    expect(normalizeVerdict(once)).toEqual(once)
  })
})

function verdict(overrides: Partial<CriticVerdict>): CriticVerdict {
  return { has_issues: false, feedback: '', grade: 'A', grade_rationale: '', issues: [], ...overrides }
}

describe('decideApproval', () => {
  it('approves a clean grade A with no issues', () => {
    const d = decideApproval(verdict({ grade: 'A' }))
    expect(d.approved).toBe(true)
    expect(d.reason).toBe('grade A')
  })

  it('blocks grade D regardless of issues', () => {
    const d = decideApproval(verdict({ grade: 'D', issues: [] }))
    expect(d.approved).toBe(false)
    expect(d.reason).toContain('D')
  })

  it('blocks grade F regardless of issues', () => {
    expect(decideApproval(verdict({ grade: 'F' })).approved).toBe(false)
  })

  it('blocks on a single high-severity issue even with a good grade', () => {
    const d = decideApproval(verdict({ grade: 'B', issues: [{ quote: 'q', reason: 'r', severity: 'high' }] }))
    expect(d.approved).toBe(false)
    expect(d.reason).toContain('high-severity')
  })

  it('approves with notes when only medium/low issues are present, and names the counts', () => {
    const d = decideApproval(
      verdict({
        grade: 'B',
        issues: [
          { quote: 'a', reason: 'x', severity: 'medium' },
          { quote: 'b', reason: 'y', severity: 'medium' },
          { quote: 'c', reason: 'z', severity: 'low' },
        ],
      })
    )
    expect(d.approved).toBe(true)
    expect(d.reason).toContain('2 medium')
    expect(d.reason).toContain('1 low')
  })

  it('blocks when unavailable, with a distinct reason', () => {
    const d = decideApproval(verdict({ unavailable: true }))
    expect(d.approved).toBe(false)
    expect(d.reason).toBe('review unavailable')
  })

  it('blocks a null grade with a distinct reason', () => {
    const d = decideApproval(verdict({ grade: null }))
    expect(d.approved).toBe(false)
    expect(d.reason).toBe('no valid grade')
  })

  it('gradeForcesRevision does not change the D/F outcome (already blocked unconditionally)', () => {
    expect(decideApproval(verdict({ grade: 'D' }), true).approved).toBe(false)
    expect(decideApproval(verdict({ grade: 'D' }), false).approved).toBe(false)
  })
})

describe('findUnverifiedQuotes', () => {
  const content = 'Performance Max drove 52.04 conversions this window, the largest source by far.'

  it('does not flag a quote that appears verbatim in the content', () => {
    const issues: CriticIssue[] = [{ quote: '52.04 conversions', reason: 'x', severity: 'medium' }]
    expect(findUnverifiedQuotes(issues, content)).toEqual([])
  })

  it('flags a paraphrased quote that is not a verbatim substring', () => {
    const issues: CriticIssue[] = [{ quote: 'around fifty-two conversions', reason: 'x', severity: 'medium' }]
    expect(findUnverifiedQuotes(issues, content)).toHaveLength(1)
  })

  it('never flags an empty quote — the model choosing not to quote is a valid, intentional case', () => {
    const issues: CriticIssue[] = [{ quote: '', reason: 'x', severity: 'low' }]
    expect(findUnverifiedQuotes(issues, content)).toEqual([])
  })

  it('returns [] for an empty issues list', () => {
    expect(findUnverifiedQuotes([], content)).toEqual([])
  })

  it('flags only the non-matching issues out of a mixed set', () => {
    const issues: CriticIssue[] = [
      { quote: '52.04 conversions', reason: 'good', severity: 'low' },
      { quote: 'invented figure', reason: 'bad', severity: 'high' },
    ]
    const result = findUnverifiedQuotes(issues, content)
    expect(result).toHaveLength(1)
    expect(result[0].reason).toBe('bad')
  })
})
