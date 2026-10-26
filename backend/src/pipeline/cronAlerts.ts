// The cron's deduped alert emails (scripts/runDaily.ts): the dead-man's
// switch and the monthly spend-cap notice. Moved out of the script so they
// can be tested with stubbed state and delivery (keywordSchedule.test.ts);
// the behaviour is unchanged.

import { getAlertState, setAlertState } from '../platform/alertState.js'
import { deliverReport } from '../platform/emailDelivery.js'
import { formatDeadMansSwitchAlert, formatSpendCeilingAlert } from '../reporting/reports.js'
import type { SpendCeilingExceededError } from './pipelineRuns.js'

// Matches the frontend's STALE_HOURS exactly (useSystemHealth.ts) so the
// email alert and the visible System Health "stale" status trip at the
// same point. Reused for the backup and keyword optimizer switches too —
// both run once daily, so the same ~30h buffer covers one missed day
// without being so tight it false-positives on ordinary timing jitter.
export const STALE_HOURS = 30

export interface AlertDeps {
  getAlertState: (key: string) => Promise<string | null>
  setAlertState: (key: string, value: string) => Promise<void>
  deliver: (runType: string, subject: string, body: string) => Promise<unknown>
  log: (line: string) => void
}

const realDeps: AlertDeps = {
  getAlertState,
  setAlertState,
  deliver: (runType, subject, body) => deliverReport(runType, subject, body),
  log: (line) => console.log(line),
}

/** Fires exactly one email per outage: trips once when a pipeline goes
 * stale, stays silent on every subsequent tick while still stale (so a
 * 15-minute cron doesn't spam), and re-arms once a successful run lands.
 * `lastRun` says what counts as a successful run for this pipeline. */
export async function checkDeadMansSwitch(
  runType: string,
  alertKey: string,
  lastRun: () => Promise<{ finished_at?: string | Date | null } | null>,
  deps: AlertDeps = realDeps,
  nowMs: number = Date.now()
): Promise<void> {
  const last = await lastRun()
  const finishedAt = last?.finished_at ? new Date(last.finished_at) : null
  const hoursSince = finishedAt ? (nowMs - finishedAt.getTime()) / 3_600_000 : Infinity

  if (hoursSince > STALE_HOURS) {
    if ((await deps.getAlertState(alertKey)) !== 'true') {
      const { subject, body } = formatDeadMansSwitchAlert(runType, STALE_HOURS, finishedAt ? finishedAt.toISOString() : null)
      await deps.deliver(runType, subject, body)
      await deps.setAlertState(alertKey, 'true')
    }
    // still stale, already alerted this outage — stay silent, don't spam
  } else {
    await deps.setAlertState(alertKey, 'false') // re-arm for the next outage
  }
}

/** Sends the spend-cap-skipped email at most once per calendar month per
 * runType — without this, every 15-minute tick after the run time hits
 * the same cap again (a cap hit never counts as "already ran today", so
 * the cron keeps retrying), which would be 70-90 emails a day until the
 * cap is raised or the month rolls over. Stores the month itself
 * (todayWib.slice(0, 7), e.g. "2026-09") — re-arming for next month
 * happens for free, since next month's string just won't match. */
export async function alertSpendCeilingOnce(
  runType: 'daily' | 'weekly' | 'keyword_optimizer',
  err: SpendCeilingExceededError,
  todayWib: string,
  deps: AlertDeps = realDeps
): Promise<void> {
  const alertKey = `spend_cap_alert_sent_${runType}`
  const thisMonth = todayWib.slice(0, 7)
  deps.log(`${runType[0].toUpperCase()}${runType.slice(1)} run skipped — ${err.message}`)
  if ((await deps.getAlertState(alertKey)) === thisMonth) return // already emailed this month
  const { subject, body } = formatSpendCeilingAlert(runType, err.capUsd, err.monthToDateUsd)
  await deps.deliver(runType, subject, body)
  await deps.setAlertState(alertKey, thisMonth)
}
