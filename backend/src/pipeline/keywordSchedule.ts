// Contract 3.5 / docs/overhaul-v3-backend.md section 11.8 — Kai's automatic
// daily run. The rules are a pure decision; the cron block around it takes
// its I/O as dependencies, so both are tested without a clock, a DB or a
// model (keywordSchedule.test.ts). scripts/runDaily.ts wires the real ones.
//
// Independent of auto_reports_enabled in both directions: the reports'
// switch neither stops nor starts Kai, and keyword_optimizer_enabled neither
// stops nor starts the reports. The one link: when the daily report is
// switched on and hasn't succeeded yet today, Kai waits for it (it syncs the
// data Kai reads), for at most DAILY_WAIT_BOUND_MINUTES past Kai's own time.

import { PipelineRunInProgressError, SpendCeilingExceededError } from './pipelineRuns.js'
import type { KeywordOptimizerResult } from './keywordOptimizer.js'

export const DAILY_WAIT_BOUND_MINUTES = 180
// The cron fires every 15 minutes; 23:45 WIB is the last tick of the day.
const LAST_TICK = '23:45'

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** How long Kai waits for the daily report: its own time plus 3 hours,
 * never past the day's last cron tick. */
export function waitBound(runTime: string): string {
  const bound = fromMinutes(Math.min(toMinutes(runTime) + DAILY_WAIT_BOUND_MINUTES, 24 * 60 - 1))
  return bound < LAST_TICK ? bound : LAST_TICK
}

export interface KeywordScheduleState {
  enabled: boolean // keyword_optimizer_enabled
  runTime: string // keyword_optimizer_run_time, HH:MM WIB
  now: string // HH:MM WIB
  ranToday: boolean // a keyword run completed today (WIB): success, or partial (Kai unreachable)
  autoReportsEnabled: boolean // auto_reports_enabled
  dailySucceededToday: boolean
}

export type KeywordDecision =
  | { action: 'skip'; reason: 'disabled' | 'not_due' | 'already_ran'; message: string }
  | { action: 'wait'; until: string; message: string }
  | { action: 'run'; note: string | null; message: string }

export function decideKeywordRun(s: KeywordScheduleState): KeywordDecision {
  if (!s.enabled) return { action: 'skip', reason: 'disabled', message: 'Keyword optimizer is switched off — skipping' }
  if (s.now < s.runTime) return { action: 'skip', reason: 'not_due', message: `Keyword optimizer not due yet (now=${s.now}, due=${s.runTime})` }
  if (s.ranToday) return { action: 'skip', reason: 'already_ran', message: 'Keyword optimizer already ran today — skipping' }
  if (s.autoReportsEnabled && !s.dailySucceededToday) {
    const until = waitBound(s.runTime)
    if (s.now < until) {
      return { action: 'wait', until, message: `Keyword optimizer waits for today's daily report (fresh data), at most until ${until}` }
    }
    const note = `the daily report had not succeeded by ${until} WIB, so this run used the data that existed`
    return { action: 'run', note, message: `Keyword optimizer: ${note}` }
  }
  return { action: 'run', note: null, message: 'Keyword optimizer due — running' }
}

/** Runs the reports block, then the keyword block, each whatever the other
 * did: a failure in one never skips the other. The first error is re-thrown
 * afterwards (a second is logged), so the cron tick still ends in failure. */
export async function runBothBlocks(
  reports: () => Promise<void>,
  keyword: () => Promise<void>,
  logError: (line: string) => void = (line) => console.error(line)
): Promise<void> {
  let first: unknown = null
  for (const [name, block] of [['reports', reports], ['keyword optimizer', keyword]] as const) {
    try {
      await block()
    } catch (err) {
      if (first === null) first = err
      else logError(`The ${name} block failed too: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (first !== null) throw first
}

export interface KeywordBlockDeps {
  now: string
  today: string
  settings: { keyword_optimizer_enabled: string; keyword_optimizer_run_time: string; auto_reports_enabled: string }
  ranToday: () => Promise<boolean>
  dailySucceededToday: () => Promise<boolean>
  checkDeadMansSwitch: () => Promise<void>
  run: (opts: { note?: string }) => Promise<KeywordOptimizerResult>
  alertSpendCeilingOnce: (err: SpendCeilingExceededError, today: string) => Promise<void>
  alertFailure: (err: unknown) => Promise<void>
  log: (line: string) => void
}

/** One cron tick's keyword block. A run already in progress is a quiet
 * backoff (next tick retries); the spend cap emails once a month under its
 * own alert key; any other failure emails an alert and is re-thrown. */
export async function runKeywordBlock(d: KeywordBlockDeps): Promise<KeywordDecision> {
  const enabled = d.settings.keyword_optimizer_enabled === 'true'
  // A switched-off Kai is expected staleness, not an outage.
  if (enabled) await d.checkDeadMansSwitch()
  const decision = decideKeywordRun({
    enabled,
    runTime: d.settings.keyword_optimizer_run_time,
    now: d.now,
    ranToday: enabled && d.now >= d.settings.keyword_optimizer_run_time ? await d.ranToday() : false,
    autoReportsEnabled: d.settings.auto_reports_enabled === 'true',
    dailySucceededToday: await d.dailySucceededToday(),
  })
  d.log(decision.message)
  if (decision.action !== 'run') return decision
  try {
    const r = await d.run(decision.note ? { note: decision.note } : {})
    d.log(`Keyword optimizer run #${r.runId} complete: ${r.inserted} new, ${r.superseded} superseded, Kai ${r.kai}`)
  } catch (err) {
    if (err instanceof PipelineRunInProgressError) {
      d.log('Keyword optimizer skipped — another run was already in progress; retrying next tick')
    } else if (err instanceof SpendCeilingExceededError) {
      await d.alertSpendCeilingOnce(err, d.today)
    } else {
      await d.alertFailure(err)
      throw err
    }
  }
  return decision
}
