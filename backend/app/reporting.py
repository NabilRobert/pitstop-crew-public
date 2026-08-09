"""Structured data queries backing the frontend dashboard — distinct from
context.py, which formats the same data as prompt text for agents."""

from datetime import date, timedelta

from app import outputs
from app.db import get_connection


def list_campaigns() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, status, data_source FROM campaigns ORDER BY name"
        ).fetchall()
        return [dict(r) for r in rows]


def get_performance_series(days: int = 30, end_date: date | None = None) -> list[dict]:
    end_date = end_date or date.today()
    start_date = end_date - timedelta(days=days)
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT cp.date, c.id AS campaign_id, c.name AS campaign,
                   cp.impressions, cp.clicks, cp.cost_micros, cp.conversions
            FROM campaign_performance cp
            JOIN campaigns c ON c.id = cp.campaign_id
            WHERE cp.date BETWEEN %s AND %s
            ORDER BY cp.date, c.name
            """,
            (start_date, end_date),
        ).fetchall()
        return [dict(r) for r in rows]


def get_latest_report(period: str) -> dict:
    """The most recent finalized analysis/recommendation/summary trio for a
    period — backs "today's report" on the dashboard without the frontend
    needing to already know specific ai_outputs ids."""
    return {
        "analysis": outputs.get_latest_by_agent("analysis", period),
        "recommendation": outputs.get_latest_by_agent("recommendation", period),
        "summary": outputs.get_latest_by_agent("summary", period),
    }
