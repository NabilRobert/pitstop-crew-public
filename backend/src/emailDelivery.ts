// Email transport — Resend primary, Gmail SMTP fallback. See PROJECT.md
// → Automation: "either works fine at single-user volume." This module
// only knows how to send an email; reports.ts decides what to send.

import nodemailer from 'nodemailer'
import { GMAIL_APP_PASSWORD, GMAIL_USER, RESEND_API_KEY, RESEND_FROM_EMAIL } from './config.js'

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
