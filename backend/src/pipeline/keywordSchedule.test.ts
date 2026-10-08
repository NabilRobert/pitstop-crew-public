// Contract 3.5 — Kai's automatic daily run: when it is due, its independence
// from the reports, the wait for the daily report, the cron block's error
// paths, and the deduped alerts. No DB, no clock, no model.

import { describe, it, expect, vi } from 'vitest'
import { decideKeywordRun, runBothBlocks, runKeywordBlock, waitBound, type KeywordBlockDeps, type KeywordScheduleState } from './keywordSchedule.js'
import { alertSpendCeilingOnce, checkDeadMansSwitch, type AlertDeps } from './cronAlerts.js'
import { PipelineRunInProgressError, SpendCeilingExceededError } from './pipelineRuns.js'
import type { KeywordOptimizerResult } from './keywordOptimizer.js'

const state = (over: Partial<KeywordScheduleState> = {}): KeywordScheduleState => ({
  enabled: true,
  runTime: '06:00',
  now: '06:00',
  ranToday: false,
  autoReportsEnabled: false,
  dailySucceededToday: false,
  ...over,
})

describe('decideKeywordRun', () => {
  it('is not due before its time, and due from its time on', () => {
    expect(decideKeywordRun(state({ now: '05:45' }))).toMatchObject({ action: 'skip', reason: 'not_due' })
    expect(decideKeywordRun(state({ now: '06:00' }))).toMatchObject({ action: 'run', note: null })
    expect(decideKeywordRun(state({ now: '14:15' }))).toMatchObject({ action: 'run', note: null })
    expect(decideKeywordRun(state({ runTime: '20:30', now: '20:15' }))).toMatchObject({ action: 'skip', reason: 'not_due' })
  })

  it('runs once a day: a completed run today means skip', () => {
    expect(decideKeywordRun(state({ now: '09:00', ranToday: true }))).toMatchObject({ action: 'skip', reason: 'already_ran' })
  })

  it('does nothing when switched off, whatever the time or the reports', () => {
    for (const autoReportsEnabled of [true, false]) {
      expect(decideKeywordRun(state({ enabled: false, now: '09:00', autoReportsEnabled }))).toMatchObject({ action: 'skip', reason: 'disabled' })
    }
  })

  it('runs with the reports switched off (independence: reports off does not stop Kai)', () => {
    expect(decideKeywordRun(state({ autoReportsEnabled: false, dailySucceededToday: false }))).toMatchObject({ action: 'run', note: null })
  })

  it('waits for today’s daily report when the reports are on and it has not succeeded yet', () => {
    const d = decideKeywordRun(state({ autoReportsEnabled: true, now: '06:00' }))
    expect(d).toMatchObject({ action: 'wait', until: '09:00' })
    expect(decideKeywordRun(state({ autoReportsEnabled: true, now: '08:45' }))).toMatchObject({ action: 'wait' })
    expect(decideKeywordRun(state({ autoReportsEnabled: true, now: '07:15', dailySucceededToday: true }))).toMatchObject({ action: 'run', note: null })
  })

  it('stops waiting 3 hours past its own time and says it used the data that existed', () => {
    const d = decideKeywordRun(state({ autoReportsEnabled: true, now: '09:00' }))
    expect(d).toMatchObject({ action: 'run' })
    expect(d.action === 'run' && d.note).toBe('the daily report had not succeeded by 09:00 WIB, so this run used the data that existed')
  })

  it('never waits past the day’s last cron tick', () => {
    expect(waitBound('06:00')).toBe('09:00')
    expect(waitBound('21:30')).toBe('23:45')
    expect(waitBound('23:00')).toBe('23:45')
    expect(decideKeywordRun(state({ runTime: '22:00', autoReportsEnabled: true, now: '23:45' }))).toMatchObject({ action: 'run' })
  })
})

describe('runBothBlocks (independence in both directions)', () => {
  it('runs the keyword block after a reports failure, and re-throws the reports error', async () => {
    const keyword = vi.fn(async () => {})
    await expect(runBothBlocks(async () => { throw new Error('daily failed') }, keyword)).rejects.toThrow('daily failed')
    expect(keyword).toHaveBeenCalledOnce()
  })

  it('a keyword failure never undoes the reports, and still fails the tick', async () => {
    const order: string[] = []
    await expect(
      runBothBlocks(async () => { order.push('reports') }, async () => { order.push('keyword'); throw new Error('kai failed') })
    ).rejects.toThrow('kai failed')
    expect(order).toEqual(['reports', 'keyword'])
  })

  it('when both fail, throws the first and logs the second', async () => {
    const logged: string[] = []
    await expect(
      runBothBlocks(async () => { throw new Error('a') }, async () => { throw new Error('b') }, (l) => logged.push(l))
    ).rejects.toThrow('a')
    expect(logged).toEqual(['The keyword optimizer block failed too: b'])
  })
})

const result: KeywordOptimizerResult = { runId: 151, reportDate: '2026-10-06', candidates: 0, inserted: 0, superseded: 0, kai: 'unchanged' }

function deps(over: Partial<KeywordBlockDeps> = {}) {
  const calls = { run: [] as { note?: string }[], cap: 0, failure: 0, deadMan: 0 }
  const d: KeywordBlockDeps = {
    now: '06:15',
    today: '2026-10-08',
    settings: { keyword_optimizer_enabled: 'true', keyword_optimizer_run_time: '06:00', auto_reports_enabled: 'false' },
    ranToday: async () => false,
    dailySucceededToday: async () => false,
    checkDeadMansSwitch: async () => { calls.deadMan += 1 },
    run: async (opts) => { calls.run.push(opts); return result },
    alertSpendCeilingOnce: async () => { calls.cap += 1 },
    alertFailure: async () => { calls.failure += 1 },
    log: () => {},
    ...over,
  }
  return { d, calls }
}

describe('runKeywordBlock', () => {
  it('runs when due, and checks its dead-man’s switch', async () => {
    const { d, calls } = deps()
    await expect(runKeywordBlock(d)).resolves.toMatchObject({ action: 'run' })
    expect(calls.run).toEqual([{}])
    expect(calls.deadMan).toBe(1)
  })

  it('switched off: no run and no dead-man’s switch (a paused Kai is not an outage)', async () => {
    const { d, calls } = deps({ settings: { keyword_optimizer_enabled: 'false', keyword_optimizer_run_time: '06:00', auto_reports_enabled: 'true' } })
    await expect(runKeywordBlock(d)).resolves.toMatchObject({ reason: 'disabled' })
    expect(calls).toMatchObject({ run: [], deadMan: 0 })
  })

  it('already ran today: no second run', async () => {
    const { d, calls } = deps({ ranToday: async () => true })
    await expect(runKeywordBlock(d)).resolves.toMatchObject({ reason: 'already_ran' })
    expect(calls.run).toEqual([])
  })

  it('passes the "used the data that existed" note once the wait is over', async () => {
    const { d, calls } = deps({ now: '09:15', settings: { keyword_optimizer_enabled: 'true', keyword_optimizer_run_time: '06:00', auto_reports_enabled: 'true' } })
    await runKeywordBlock(d)
    expect(calls.run).toEqual([{ note: 'the daily report had not succeeded by 09:00 WIB, so this run used the data that existed' }])
  })

  it('backs off quietly when another run is in progress', async () => {
    const { d, calls } = deps({ run: async () => { throw new PipelineRunInProgressError() } })
    await expect(runKeywordBlock(d)).resolves.toMatchObject({ action: 'run' })
    expect(calls).toMatchObject({ cap: 0, failure: 0 })
  })

  it('takes the spend-cap path: the once-a-month notice, no failure alert, no throw', async () => {
    const { d, calls } = deps({ run: async () => { throw new SpendCeilingExceededError(20, 20.5) } })
    await expect(runKeywordBlock(d)).resolves.toMatchObject({ action: 'run' })
    expect(calls).toMatchObject({ cap: 1, failure: 0 })
  })

  it('alerts and re-throws any other failure', async () => {
    const { d, calls } = deps({ run: async () => { throw new Error('boom') } })
    await expect(runKeywordBlock(d)).rejects.toThrow('boom')
    expect(calls).toMatchObject({ cap: 0, failure: 1 })
  })
})

function memoryAlerts() {
  const state = new Map<string, string>()
  const sent: { runType: string; subject: string }[] = []
  const d: AlertDeps = {
    getAlertState: async (k) => state.get(k) ?? null,
    setAlertState: async (k, v) => { state.set(k, v) },
    deliver: async (runType, subject) => { sent.push({ runType, subject }) },
    log: () => {},
  }
  return { d, state, sent }
}

describe('the keyword optimizer’s spend-cap notice', () => {
  it('emails once a month under its own key, apart from the reports’ notices', async () => {
    const { d, state, sent } = memoryAlerts()
    state.set('spend_cap_alert_sent_daily', '2026-10') // the daily report already told the owner this month
    const err = new SpendCeilingExceededError(20, 21)
    await alertSpendCeilingOnce('keyword_optimizer', err, '2026-10-08', d)
    await alertSpendCeilingOnce('keyword_optimizer', err, '2026-10-08', d) // the next tick
    await alertSpendCeilingOnce('keyword_optimizer', err, '2026-10-30', d)
    expect(sent).toEqual([{ runType: 'keyword_optimizer', subject: 'Pitstop — keyword_optimizer run skipped (monthly spend cap reached)' }])
    expect(state.get('spend_cap_alert_sent_keyword_optimizer')).toBe('2026-10')
    await alertSpendCeilingOnce('keyword_optimizer', err, '2026-11-01', d) // a new month re-arms
    expect(sent).toHaveLength(2)
  })
})

describe('the keyword optimizer’s dead-man’s switch', () => {
  const now = Date.parse('2026-10-08T00:00:00Z')
  const hoursAgo = (h: number) => ({ finished_at: new Date(now - h * 3_600_000).toISOString() })

  it('trips once after 30 hours without a completed run, stays quiet, and re-arms after one', async () => {
    const { d, state, sent } = memoryAlerts()
    const check = (last: { finished_at: string } | null) =>
      checkDeadMansSwitch('keyword_optimizer', 'keyword_optimizer_stale_alert_sent', async () => last, d, now)
    await check(hoursAgo(29))
    expect(sent).toHaveLength(0)
    await check(hoursAgo(31))
    await check(hoursAgo(31.25)) // the next tick
    expect(sent).toEqual([{ runType: 'keyword_optimizer', subject: "[ALERT] Pitstop — keyword_optimizer pipeline hasn't run in over 30h" }])
    await check(hoursAgo(1)) // a run landed
    expect(state.get('keyword_optimizer_stale_alert_sent')).toBe('false')
    await check(null) // never ran
    expect(sent).toHaveLength(2)
  })
})
