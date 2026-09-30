// Cron entrypoint: `*/15 * * * * node dist/scripts/runDaily.js` (see
// backend/deploy/crontab.txt). Runs every 15 minutes but only actually
// fires the pipeline once it's past the configured run time (see
// backend/src/platform/settings.ts) AND it hasn't already succeeded today — so the
// crontab line itself no longer encodes the run time, the Settings page
// does. On Mondays, also runs the weekly rollup + weekly feedback job
// once past the weekly run time. Emails the report on success, or a
// failure alert on any exception — per PROJECT.md, failures are
// surfaced, never silently skipped.
//
// Everything here is evaluated in WIB (see ../src/platform/timezone.ts), not
// the VPS's own OS timezone — the Settings page's run-time fields, "today"'s
// date, and the Monday check all mean Indonesia time regardless of where
// the server actually lives.

import { runDaily, runWeekly, type RunResult } from '../src/pipeline/orchestrator.js'
import {
  formatReportEmail,
  formatFailureAlert,
  formatWeeklyFeedbackEmail,
  formatDeadMansSwitchAlert,
  formatSpendCeilingAlert,
} from '../src/reporting/reports.js'
import { runWeeklyFeedback } from '../src/pipeline/weeklyFeedback.js'
import { deliverReport as deliver } from '../src/platform/emailDelivery.js'
import { pruneTracePayloads } from '../src/platform/trace.js'
import { getSettings } from '../src/platform/settings.js'
import {
  getLastSuccessfulRun,
  reconcileOrphanedRuns,
  PipelineRunInProgressError,
  SpendCeilingExceededError,
  type RunType,
} from '../src/pipeline/pipelineRuns.js'
import { getAlertState, setAlertState } from '../src/platform/alertState.js'
import { wibDate, wibTime, isWibMonday } from '../src/platform/timezone.js'
import { DATA_SOURCE } from '../src/platform/config.js'
import { ensureFutureOverrides } from '../src/data/demo/timeMachine.js'

// Matches the frontend's STALE_HOURS exactly (useSystemHealth.ts) so the
// email alert and the visible System Health "stale" status trip at the
// same point. Reused for the backup dead-man's-switch too — backups run
// once daily, so the same ~30h buffer comfortably covers one missed day
// without being so tight it false-positives on ordinary timing jitter.
const STALE_HOURS = 30

/** Fires exactly one email per outage: trips once when a pipeline goes
 * stale, stays silent on every subsequent tick while still stale (so a
 * 15-minute cron doesn't spam), and re-arms once a successful run lands.
 * See platform/alertState.ts for the dedupe flag this reads/writes. */
async function checkDeadMansSwitch(runType: RunType, alertKey: string): Promise<void> {
  const last = await getLastSuccessfulRun(runType)
  const hoursSince = last?.finished_at ? (Date.now() - new Date(last.finished_at).getTime()) / 3_600_000 : Infinity

  if (hoursSince > STALE_HOURS) {
    const alreadyAlerted = await getAlertState(alertKey)
    if (alreadyAlerted !== 'true') {
      const { subject, body } = formatDeadMansSwitchAlert(runType, STALE_HOURS, last?.finished_at ?? null)
      await deliver(runType, subject, body)
      await setAlertState(alertKey, 'true')
    }
    // still stale, already alerted this outage — stay silent, don't spam
  } else {
    await setAlertState(alertKey, 'false') // re-arm for the next outage
  }
}

/** trackRun tags the errors it re-throws with the run they belong to. */
function failedRunId(err: unknown): number | undefined {
  return err && typeof err === 'object' && 'pipelineRunId' in err ? (err as { pipelineRunId: number }).pipelineRunId : undefined
}

/** Sends the spend-cap-skipped email at most once per calendar month per
 * runType — without this, every 15-minute tick after daily_run_time hits
 * the same cap again (a cap hit never counts as "already ran today", so
 * alreadyRanToday() stays false and the cron keeps retrying), which would
 * be 70-90 emails a day until the cap is raised or the month rolls over.
 * Unlike checkDeadMansSwitch's true/false dedupe flag, this stores the
 * month itself (todayWib.slice(0, 7), e.g. "2026-09") — re-arming for next
 * month happens for free, since next month's string just won't match. */
async function alertSpendCeilingOnce(runType: 'daily' | 'weekly', err: SpendCeilingExceededError, todayWib: string): Promise<void> {
  const alertKey = `spend_cap_alert_sent_${runType}`
  const thisMonth = todayWib.slice(0, 7)
  console.log(`${runType[0].toUpperCase()}${runType.slice(1)} run skipped — ${err.message}`)
  if ((await getAlertState(alertKey)) === thisMonth) return // already emailed this month
  const { subject, body } = formatSpendCeilingAlert(runType, err.capUsd, err.monthToDateUsd)
  await deliver(runType, subject, body)
  await setAlertState(alertKey, thisMonth)
}

async function alreadyRanToday(runType: RunType, todayWib: string): Promise<boolean> {
  const last = await getLastSuccessfulRun(runType)
  if (!last?.finished_at) return false
  return wibDate(new Date(last.finished_at)) === todayWib
}

async function main() {
  // This cron script and the long-lived API server are separate processes —
  // an orphan left by either one (a crash mid-run) needs cleaning up by
  // whichever process boots next, not just by the API server on its own
  // (rare) restart. See src/api/main.ts for the same call.
  const reconciled = await reconcileOrphanedRuns()
  if (reconciled > 0) console.log(`Reconciled ${reconciled} orphaned pipeline run(s) before this run`)

  // Independent of the auto-reports toggle below — this just keeps the
  // Time Machine's override buffer topped up, unrelated to report
  // generation, so it runs on every tick regardless of that setting.
  if (DATA_SOURCE === 'demo') {
    const added = await ensureFutureOverrides(wibDate())
    if (added > 0) console.log(`Time Machine: auto-extended overrides ${added} day(s) into the future`)
  }

  // Also independent of the toggle: drops trace prompt/response text older than
  // 30 days (the trace_events rows themselves stay). Must never fail the tick.
  try {
    const pruned = await pruneTracePayloads()
    if (pruned > 0) console.log(`Trace: pruned ${pruned} payload(s) older than 30 days`)
  } catch (err) {
    console.error('Trace payload pruning failed:', err instanceof Error ? err.message : err)
  }

  const settings = await getSettings()

  if (settings.auto_reports_enabled === 'false') {
    console.log('Automatic reports are disabled — skipping')
    return
  }

  // Deliberately after the auto_reports_enabled early-return above — a
  // deliberately-paused pipeline is expected staleness, not an outage to
  // alert on.
  await checkDeadMansSwitch('daily', 'dead_man_switch_alert_sent')
  await checkDeadMansSwitch('backup', 'backup_stale_alert_sent')

  const now = wibTime()
  const today = wibDate()
  const isMonday = isWibMonday()

  if (now < settings.daily_run_time) {
    console.log(`Daily run not due yet (now=${now}, due=${settings.daily_run_time})`)
  } else if (await alreadyRanToday('daily', today)) {
    console.log(`Daily run already succeeded today (${today}) — skipping`)
  } else {
    let dailyResult: RunResult
    try {
      dailyResult = await runDaily(today)
      const { subject, body } = await formatReportEmail(dailyResult, today, 'daily')
      await deliver('daily', subject, body, dailyResult.runId)
      console.log(`Daily run complete for ${today}`)
    } catch (err) {
      // startRun() inside runDaily() (no existingRunId passed here — this
      // is the cron path, unlike the manual POST /pipeline/run trigger,
      // which resolves its own runId first and passes it through) can
      // lose the idx_pipeline_runs_one_running race against a concurrent
      // manual trigger. That's not a real failure — nothing broke, this
      // tick just backs off — so it shouldn't fire a failure alert.
      if (err instanceof PipelineRunInProgressError) {
        console.log(
          'Daily run skipped — another run was already in progress (likely a manual "Generate report now" trigger racing this cron tick)'
        )
      } else if (err instanceof SpendCeilingExceededError) {
        // Unlike the race above, this is worth a named, visible event — the
        // safety mechanism firing is exactly what should be noticed, not
        // silently swallowed (a silently-stopped pipeline defeats half the
        // point of having the cap). Deduped to once per month — see
        // alertSpendCeilingOnce — since a cap hit never counts as "already
        // ran today", so every 15-minute tick past daily_run_time would
        // otherwise hit the cap and email again.
        await alertSpendCeilingOnce('daily', err, today)
      } else {
        const message = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err)
        const { subject, body } = formatFailureAlert('daily', message)
        await deliver('daily', subject, body, failedRunId(err))
        throw err
      }
    }
  }

  if (!isMonday) return

  if (now < settings.weekly_run_time) {
    console.log(`Weekly run not due yet (now=${now}, due=${settings.weekly_run_time})`)
    return
  }
  if (await alreadyRanToday('weekly', today)) {
    console.log(`Weekly run already succeeded today (${today}) — skipping`)
    return
  }

  try {
    const weeklyResult = await runWeekly(today)
    const { subject, body } = await formatReportEmail(weeklyResult, today, 'weekly')
    await deliver('weekly', subject, body, weeklyResult.runId)
    console.log(`Weekly run complete for ${today}`)
  } catch (err) {
    // Same false-alarm case as the daily block above.
    if (err instanceof PipelineRunInProgressError) {
      console.log(
        'Weekly run skipped — another run was already in progress (likely a manual "Generate report now" trigger racing this cron tick)'
      )
    } else if (err instanceof SpendCeilingExceededError) {
      await alertSpendCeilingOnce('weekly', err, today)
      // weekly_feedback below runs through the same startRun() choke point
      // and would hit this same cap immediately — nothing else catches
      // that throw, so without this the tick would end in an unhandled
      // rejection. Skipping it here for this tick is correct: there's
      // nothing new to learn from a week where the report itself didn't run.
      return
    } else {
      const message = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err)
      const { subject, body } = formatFailureAlert('weekly', message)
      await deliver('weekly', subject, body, failedRunId(err))
      throw err
    }
  }

  const suggestion = await runWeeklyFeedback(today)
  if (suggestion) {
    const { subject, body } = formatWeeklyFeedbackEmail(suggestion)
    await deliver('weekly_feedback', subject, body)
  } else {
    console.log('No recurring critic patterns this week — nothing to suggest.')
  }
}

main()
