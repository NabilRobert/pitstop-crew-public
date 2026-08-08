"""Damon — data agent. Not an LLM (see agents/data.md).

Demo-mode path is fully built and tested. Live-mode covers basic campaign
performance only (PROJECT.md step 6's exact scope: "start with basic
campaign performance, last 30 days") — untested against a real account,
since Basic Access is still pending and the account has no live campaigns
yet. Device/geography/demographic live segment fetching is a deliberate
follow-up once the basic query is verified, not guessed at here."""

from datetime import date, timedelta

from app.config import GADS_TARGET_CUSTOMER_ID
from app.db import get_connection
from app.demo import profile, time_machine
from app.demo.generator import generate_day


def sync_day(target_date: date, seed: int = 0, data_source: str = "demo") -> dict:
    if data_source != "demo":
        raise ValueError("sync_day is demo-only — use sync_live_window for live mode")
    overrides = time_machine.get_overrides()
    day_data = generate_day(target_date, seed=seed, overrides=overrides)
    _upsert_day(day_data)
    return day_data


def sync_trailing_window(end_date: date, days: int = 7, seed: int = 0, data_source: str = "demo") -> list[dict]:
    """Re-fetches the trailing window, not just `end_date` — see PROJECT.md
    → Automation: Google Ads conversions can be attributed days after the
    click, so re-upserting recent history keeps it accurate."""
    if data_source == "live":
        start_date = end_date - timedelta(days=days - 1)
        rows_upserted = sync_live_window(start_date, end_date)
        return [{"date": end_date, "rows_upserted": rows_upserted}]
    return [
        sync_day(end_date - timedelta(days=i), seed=seed, data_source=data_source)
        for i in range(days)
    ]


def sync_live_window(start_date: date, end_date: date) -> int:
    """Basic campaign performance only — see module docstring. Returns the
    number of campaign-day rows upserted."""
    from app.google_ads_client import get_client  # deferred: avoid requiring
    # the google-ads package / credentials for demo-only usage

    client = get_client()
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT campaign.id, campaign.name, campaign.status, segments.date,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM campaign
        WHERE segments.date BETWEEN '{start_date.isoformat()}' AND '{end_date.isoformat()}'
    """
    response = ga_service.search(customer_id=GADS_TARGET_CUSTOMER_ID, query=query)

    rows_upserted = 0
    with get_connection() as conn:
        for row in response:
            campaign_id = _get_or_create_live_campaign(
                conn, row.campaign.id, row.campaign.name, row.campaign.status.name
            )
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
                    campaign_id, row.segments.date, row.metrics.impressions,
                    row.metrics.clicks, row.metrics.cost_micros, row.metrics.conversions,
                ),
            )
            rows_upserted += 1
    return rows_upserted


def _get_or_create_live_campaign(conn, google_campaign_id, name: str, status: str) -> int:
    row = conn.execute(
        "SELECT id FROM campaigns WHERE google_campaign_id = ?", (str(google_campaign_id),)
    ).fetchone()
    if row:
        conn.execute(
            "UPDATE campaigns SET name = ?, status = ? WHERE id = ?", (name, status, row["id"])
        )
        return row["id"]
    cur = conn.execute(
        "INSERT INTO campaigns (google_campaign_id, name, status, data_source) VALUES (?, ?, ?, 'live')",
        (str(google_campaign_id), name, status),
    )
    return cur.lastrowid


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
