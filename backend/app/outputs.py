"""CRUD helpers over ai_outputs."""

from datetime import date

from app.db import get_connection


def insert_output(
    agent_type: str,
    content: str,
    status: str = "draft",
    campaign_id: int | None = None,
    segment_id: int | None = None,
    critiques_id: int | None = None,
    revises_id: int | None = None,
    report_date: date | None = None,
) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO ai_outputs
                (agent_type, content, status, campaign_id, segment_id, critiques_id, revises_id, report_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                agent_type, content, status, campaign_id, segment_id, critiques_id, revises_id,
                report_date.isoformat() if report_date else None,
            ),
        )
        return cur.fetchone()["id"]


def update_status(output_id: int, status: str) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE ai_outputs SET status = %s WHERE id = %s", (status, output_id))


def get_output(output_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM ai_outputs WHERE id = %s", (output_id,)).fetchone()
        return dict(row) if row else None


def get_why_trail(output_id: int) -> list[dict]:
    """Walk backward through revises_id/critiques_id to reconstruct the full
    chain for a given output — backs the "why trail" Standout Feature."""
    with get_connection() as conn:
        trail = []
        current_id = output_id
        while current_id is not None:
            row = conn.execute("SELECT * FROM ai_outputs WHERE id = %s", (current_id,)).fetchone()
            if row is None:
                break
            row = dict(row)
            critique = conn.execute(
                "SELECT * FROM ai_outputs WHERE critiques_id = %s", (current_id,)
            ).fetchone()
            if critique:
                row["critique"] = dict(critique)
            trail.append(row)
            current_id = row["revises_id"]
        return list(reversed(trail))
