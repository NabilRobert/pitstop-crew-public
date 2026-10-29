// /health must report the database's state, so an uptime monitor sees a
// database outage. The ping is stubbed: these tests need no database.

import { describe, it, expect, vi } from 'vitest'
import { checkHealth } from './health.js'

describe('checkHealth', () => {
  it('is ok when the database answers', async () => {
    const result = await checkHealth(async () => [{ '?column?': 1 }])
    expect(result).toEqual({ httpStatus: 200, body: { status: 'ok' } })
  })

  it('is unhealthy with 503 when the database query fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkHealth(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:6432')
    })
    expect(result).toEqual({ httpStatus: 503, body: { status: 'unhealthy', database: 'unreachable' } })
  })

  it('is unhealthy with 503 when the database does not answer in time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const neverAnswers = () => new Promise<never>(() => {})
    const result = await checkHealth(neverAnswers, 20)
    expect(result.httpStatus).toBe(503)
  })

  it('does not put the database error in the response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await checkHealth(async () => {
      throw new Error('password authentication failed for user "pitstop" at db.internal')
    })
    expect(JSON.stringify(result.body)).not.toMatch(/password|pitstop|db\.internal/)
  })
})
