"""Formats stored performance data into compact text for agent prompts.
Shared by the Ask feature now; the cron pipeline (later task) will reuse it
for the same reason — one place that turns DB rows into prompt context."""

import json
from datetime import date, timedelta

from app.db import get_connection


def build_performance_context(
    campaign_id: int | None = None,
    segment_id: int | None = None,
    end_date: date | None = None,
    days: int = 30,
) -> str:
    end_date = end_date or date.today()
    start_date = end_date - timedelta(days=days)

    with get_connection() as conn:
        if segment_id is not None:
            rows = conn.execute(
                """
                SELECT sp.date, c.name AS campaign, s.segment_type, s.segment_value,
                       sp.impressions, sp.clicks, sp.cost_micros, sp.conversions
                FROM segment_performance sp
                JOIN campaigns c ON c.id = sp.campaign_id
                JOIN segments s ON s.id = sp.segment_id
                WHERE sp.segment_id = %s AND sp.date BETWEEN %s AND %s
                ORDER BY sp.date
                """,
                (segment_id, start_date, end_date),
            ).fetchall()
        elif campaign_id is not None:
            rows = conn.execute(
                """
                SELECT cp.date, c.name AS campaign, cp.impressions, cp.clicks,
                       cp.cost_micros, cp.conversions
                FROM campaign_performance cp
                JOIN campaigns c ON c.id = cp.campaign_id
                WHERE cp.campaign_id = %s AND cp.date BETWEEN %s AND %s
                ORDER BY cp.date
                """,
                (campaign_id, start_date, end_date),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT cp.date, c.name AS campaign, cp.impressions, cp.clicks,
                       cp.cost_micros, cp.conversions
                FROM campaign_performance cp
                JOIN campaigns c ON c.id = cp.campaign_id
                WHERE cp.date BETWEEN %s AND %s
                ORDER BY cp.date, c.name
                """,
                (start_date, end_date),
            ).fetchall()

    return json.dumps([dict(r) for r in rows], default=str)
