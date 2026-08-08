"""Damon — data agent. Not an LLM (see agents/data.md). Demo-mode path only
for now; live Google Ads API fetching lands in a later task."""

from datetime import date, timedelta

from app.db import get_connection
from app.demo import profile, time_machine
from app.demo.generator import generate_day


def sync_day(target_date: date, seed: int = 0, data_source: str = "demo") -> dict:
    if data_source != "demo":
        raise NotImplementedError("Live mode not yet implemented")
    overrides = time_machine.get_overrides()
    day_data = generate_day(target_date, seed=seed, overrides=overrides)
    _upsert_day(day_data)
    return day_data


def sync_trailing_window(end_date: date, days: int = 7, seed: int = 0, data_source: str = "demo") -> list[dict]:
    """Re-fetches the trailing window, not just `end_date` — see PROJECT.md
    → Automation: Google Ads conversions can be attributed days after the
    click, so re-upserting recent history keeps it accurate."""
    return [
        sync_day(end_date - timedelta(days=i), seed=seed, data_source=data_source)
        for i in range(days)
    ]


def _upsert_day(day_data: dict) -> None:
    date_str = day_data["date"].isoformat()
    with get_connection() as conn:
        campaign_ids: dict[str, int] = {}
        segment_ids: dict[tuple[str, str], int] = {}

        def campaign_id_for(key: str) -> int:
            if key not in campaign_ids:
                campaign_ids[key] = _get_or_create_campaign(conn, key)
            return campaign_ids[key]

        def segment_id_for(seg_type: str, seg_value: str) -> int:
            k = (seg_type, seg_value)
            if k not in segment_ids:
                segment_ids[k] = _get_or_create_segment(conn, seg_type, seg_value)
            return segment_ids[k]

        for c in day_data["campaigns"]:
            conn.execute(
                """
                INSERT INTO campaign_performance
                    (campaign_id, date, impressions, clicks, cost_micros, conversions)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(campaign_id, date) DO UPDATE SET
                    impressions = excluded.impressions,
                    clicks = excluded.clicks,
                    cost_micros = excluded.cost_micros,
                    conversions = excluded.conversions
                """,
                (
                    campaign_id_for(c["campaign_key"]), date_str,
                    c["impressions"], c["clicks"], c["cost_micros"], c["conversions"],
                ),
            )

        for s in day_data["segments"]:
            conn.execute(
                """
                INSERT INTO segment_performance
                    (campaign_id, segment_id, date, impressions, clicks, cost_micros, conversions)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(campaign_id, segment_id, date) DO UPDATE SET
                    impressions = excluded.impressions,
                    clicks = excluded.clicks,
                    cost_micros = excluded.cost_micros,
                    conversions = excluded.conversions
                """,
                (
                    campaign_id_for(s["campaign_key"]), segment_id_for(s["segment_type"], s["segment_value"]),
                    date_str, s["impressions"], s["clicks"], s["cost_micros"], s["conversions"],
                ),
            )


def _get_or_create_campaign(conn, campaign_key: str) -> int:
    name = next(c["name"] for c in profile.CAMPAIGNS if c["key"] == campaign_key)
    row = conn.execute(
        "SELECT id FROM campaigns WHERE name = ? AND data_source = 'demo'", (name,)
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO campaigns (name, data_source, status) VALUES (?, 'demo', 'enabled')", (name,)
    )
    return cur.lastrowid


def _get_or_create_segment(conn, segment_type: str, segment_value: str) -> int:
    row = conn.execute(
        "SELECT id FROM segments WHERE segment_type = ? AND segment_value = ?",
        (segment_type, segment_value),
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO segments (segment_type, segment_value) VALUES (?, ?)",
        (segment_type, segment_value),
    )
    return cur.lastrowid
