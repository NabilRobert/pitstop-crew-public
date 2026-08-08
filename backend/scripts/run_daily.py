"""Cron entrypoint: `0 6 * * * /path/to/.venv/bin/python3 run_daily.py`
(see PROJECT.md → Automation: plain crontab, 6am). Runs the daily pipeline,
and on Mondays also the weekly rollup + weekly feedback job. Emails the
report on success, or a failure alert on any exception — per PROJECT.md,
failures are surfaced, never silently skipped."""

import sys
import traceback
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import orchestrator, reports, weekly_feedback  # noqa: E402
from app.config import REPORT_RECIPIENT_EMAIL  # noqa: E402
from app.email_delivery import send_email  # noqa: E402


def _deliver(run_type: str, target_date: date, subject: str, body: str) -> None:
    if not REPORT_RECIPIENT_EMAIL:
        print(f"[{run_type}] REPORT_RECIPIENT_EMAIL not set — skipping email, printing instead:")
        print(subject)
        print(body)
        return
    send_email(REPORT_RECIPIENT_EMAIL, subject, body)


def main():
    today = date.today()

    try:
        result = orchestrator.run_daily(today)
        subject, body = reports.format_report_email(result, today, "daily")
        _deliver("daily", today, subject, body)
        print(f"Daily run complete for {today}")
    except Exception as exc:
        subject, body = reports.format_failure_alert("daily", f"{exc}\n\n{traceback.format_exc()}")
        _deliver("daily", today, subject, body)
        raise

    if today.weekday() == 0:  # Monday — weekly cadence
        try:
            weekly_result = orchestrator.run_weekly(today)
            subject, body = reports.format_report_email(weekly_result, today, "weekly")
            _deliver("weekly", today, subject, body)
            print(f"Weekly run complete for {today}")
        except Exception as exc:
            subject, body = reports.format_failure_alert("weekly", f"{exc}\n\n{traceback.format_exc()}")
            _deliver("weekly", today, subject, body)
            raise

        suggestion = weekly_feedback.run(today)
        if suggestion:
            subject, body = reports.format_weekly_feedback_email(suggestion)
            _deliver("weekly_feedback", today, subject, body)
        else:
            print("No recurring critic patterns this week — nothing to suggest.")


if __name__ == "__main__":
    main()
