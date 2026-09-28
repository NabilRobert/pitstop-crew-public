// Emil — Email delivery agent, not an LLM, cross-cutting like Damon and
// Orca. Resend primary, Gmail SMTP fallback — see PROJECT.md → Automation:
// "either works fine at single-user volume." This module only knows how
// to send an email; reports.ts decides what to send.

import nodemailer from 'nodemailer'
import { GMAIL_APP_PASSWORD, GMAIL_USER, RESEND_API_KEY, RESEND_FROM_EMAIL } from './config.js'
import { getSettings } from './settings.js'
import { span, withRunTrace } from './trace.js'

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  if (RESEND_API_KEY) {
    await sendViaResend(to, subject, body)
  } else if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    await sendViaGmail(to, subject, body)
  } else {
    throw new Error(
      'No email provider configured — set RESEND_API_KEY, or GMAIL_USER + GMAIL_APP_PASSWORD, in .env'
    )
  }
}

/** The single delivery path for both the scheduled cron pipeline
 * (runDaily.ts) and manually-triggered runs (POST /pipeline/run in
 * main.ts) — reads the recipient from settings.ts (Settings page →
 * "Report recipient email") so both paths pick up the same override.
 * Prints instead of sending when no recipient is configured, matching
 * this project's existing "surfaced, never silently skipped" principle
 * for anything report-related. */
export async function deliverReport(runType: string, subject: string, body: string, runId?: number | null): Promise<void> {
  // With a runId the send is recorded on that run's trace (never the
  // recipient's address, only that one was configured).
  return withRunTrace(runId, () =>
    span(
      'email',
      `Send ${runType} email`,
      async (s) => {
        const settings = await getSettings()
        const recipient = settings.report_recipient_email
        if (!recipient) {
          console.log(`[${runType}] No report recipient configured — skipping email, printing instead:`)
          console.log(subject)
          console.log(body)
          s.set({ status: 'skipped', summary: 'no report recipient configured — printed to the log instead' })
          return
        }
        await sendEmail(recipient, subject, body)
        s.set({ summary: `sent (${body.length} chars)` })
      },
      { run_type: runType, subject }
    )
  )
}

async function sendViaResend(to: string, subject: string, body: string): Promise<void> {
  const { Resend } = await import('resend')
  const resend = new Resend(RESEND_API_KEY)
  await resend.emails.send({ from: RESEND_FROM_EMAIL, to: [to], subject, text: body })
}

async function sendViaGmail(to: string, subject: string, body: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  })
  await transporter.sendMail({ from: GMAIL_USER, to, subject, text: body })
}
