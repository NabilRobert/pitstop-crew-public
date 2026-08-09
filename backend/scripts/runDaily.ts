// Cron entrypoint: `0 6 * * * node dist/scripts/runDaily.js` (see
// PROJECT.md → Automation: plain crontab, 6am). Runs the daily pipeline,
// and on Mondays also the weekly rollup + weekly feedback job. Emails the
// report on success, or a failure alert on any exception — per
// PROJECT.md, failures are surfaced, never silently skipped.

import { runDaily, runWeekly, type RunResult } from '../src/orchestrator.js'
import { formatReportEmail, formatFailureAlert, formatWeeklyFeedbackEmail } from '../src/reports.js'
import { runWeeklyFeedback } from '../src/weeklyFeedback.js'
import { REPORT_RECIPIENT_EMAIL } from '../src/config.js'
import { sendEmail } from '../src/emailDelivery.js'

async function deliver(runType: string, subject: string, body: string): Promise<void> {
  if (!REPORT_RECIPIENT_EMAIL) {
    console.log(`[${runType}] REPORT_RECIPIENT_EMAIL not set — skipping email, printing instead:`)
    console.log(subject)
    console.log(body)
    return
  }
  await sendEmail(REPORT_RECIPIENT_EMAIL, subject, body)
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const isMonday = new Date(today + 'T00:00:00Z').getUTCDay() === 1

  let dailyResult: RunResult
  try {
    dailyResult = await runDaily(today)
    const { subject, body } = await formatReportEmail(dailyResult, today, 'daily')
    await deliver('daily', subject, body)
    console.log(`Daily run complete for ${today}`)
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err)
    const { subject, body } = formatFailureAlert('daily', message)
    await deliver('daily', subject, body)
    throw err
  }

  if (isMonday) {
    try {
      const weeklyResult = await runWeekly(today)
      const { subject, body } = await formatReportEmail(weeklyResult, today, 'weekly')
      await deliver('weekly', subject, body)
      console.log(`Weekly run complete for ${today}`)
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err)
      const { subject, body } = formatFailureAlert('weekly', message)
      await deliver('weekly', subject, body)
      throw err
    }

    const suggestion = await runWeeklyFeedback(today)
    if (suggestion) {
      const { subject, body } = formatWeeklyFeedbackEmail(suggestion)
      await deliver('weekly_feedback', subject, body)
    } else {
      console.log('No recurring critic patterns this week — nothing to suggest.')
    }
  }
}

main()
