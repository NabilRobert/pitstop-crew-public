"""Email transport — Resend primary, Gmail SMTP fallback. See PROJECT.md
→ Automation: "either works fine at single-user volume." This module only
knows how to send an email; report.py decides what to send."""

import smtplib
from email.mime.text import MIMEText

from app.config import (
    GMAIL_APP_PASSWORD,
    GMAIL_USER,
    RESEND_API_KEY,
    RESEND_FROM_EMAIL,
)


def send_email(to: str, subject: str, body: str) -> None:
    if RESEND_API_KEY:
        _send_via_resend(to, subject, body)
    elif GMAIL_USER and GMAIL_APP_PASSWORD:
        _send_via_gmail(to, subject, body)
    else:
        raise RuntimeError(
            "No email provider configured — set RESEND_API_KEY, or "
            "GMAIL_USER + GMAIL_APP_PASSWORD, in .env"
        )


def _send_via_resend(to: str, subject: str, body: str) -> None:
    import resend

    resend.api_key = RESEND_API_KEY
    resend.Emails.send({
        "from": RESEND_FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "text": body,
    })


def _send_via_gmail(to: str, subject: str, body: str) -> None:
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = GMAIL_USER
    msg["To"] = to

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.send_message(msg)
