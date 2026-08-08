"""Formats ai_outputs/pipeline_runs data into (subject, body) email
content. Content only — email_delivery.py handles actually sending it."""

from datetime import date

from app import outputs


def format_report_email(result: dict, target_date: date, period: str) -> tuple[str, str]:
    analysis = outputs.get_output(result["analysis_id"])
    recommendation = outputs.get_output(result["recommendation_id"])
    summary = outputs.get_output(result["summary_id"])

    subject = f"Google Ads {period.capitalize()} Report — {target_date.isoformat()}"
    body = (
        f"SUMMARY\n{summary['content']}\n\n"
        f"RECOMMENDATION\n{recommendation['content']}\n\n"
        f"ANALYSIS\n{analysis['content']}"
    )
    return subject, body


def format_failure_alert(run_type: str, error_message: str) -> tuple[str, str]:
    subject = f"[ALERT] Google Ads Dashboard — {run_type} run failed"
    body = (
        f"The {run_type} pipeline run failed and did not complete.\n\n"
        f"Error:\n{error_message}\n\n"
        f"This needs attention — no report was generated for this run."
    )
    return subject, body


def format_weekly_feedback_email(suggestion: str) -> tuple[str, str]:
    subject = "Google Ads Dashboard — Weekly Prompt Suggestion"
    body = (
        "The critic found a recurring pattern this week. Suggested prompt "
        "patch below — review and apply manually if it looks right. This "
        "is never auto-applied.\n\n"
        f"{suggestion}"
    )
    return subject, body
