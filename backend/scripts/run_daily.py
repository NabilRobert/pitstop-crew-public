"""Cron entrypoint: `0 6 * * * /path/to/.venv/bin/python3 run_daily.py`
(see PROJECT.md → Automation: plain crontab, 6am). Runs the daily pipeline,
and on Mondays also the weekly rollup + weekly feedback job."""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import orchestrator, weekly_feedback  # noqa: E402


def main():
    today = date.today()
    orchestrator.run_daily(today)
    print(f"Daily run complete for {today}")

    if today.weekday() == 0:  # Monday — weekly cadence
        orchestrator.run_weekly(today)
        print(f"Weekly run complete for {today}")

        suggestion = weekly_feedback.run(today)
        if suggestion:
            print(f"Weekly feedback suggestion:\n{suggestion}")
        else:
            print("No recurring critic patterns this week — nothing to suggest.")


if __name__ == "__main__":
    main()
