"""Per-run logging over pipeline_runs — backs the system health page and
the dead-man's-switch heartbeat check (PROJECT.md → Automation)."""

from contextlib import contextmanager
from datetime import datetime, timezone

from app.db import get_connection

VALID_RUN_TYPES = ("daily", "weekly", "weekly_feedback")


def start_run(run_type: str) -> int:
    if run_type not in VALID_RUN_TYPES:
        raise ValueError(f"run_type must be one of {VALID_RUN_TYPES}, got {run_type!r}")
    now = datetime.now(timezone.utc)
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO pipeline_runs (run_type, started_at, status) VALUES (%s, %s, 'success') RETURNING id",
            (run_type, now),
        )
        return cur.fetchone()["id"]


def finish_run(
    run_id: int,
    status: str = "success",
    cost_usd_micros: int | None = None,
    error_message: str | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE pipeline_runs
            SET finished_at = %s, status = %s, cost_usd_micros = %s, error_message = %s
            WHERE id = %s
            """,
            (now, status, cost_usd_micros, error_message, run_id),
        )


@contextmanager
def track_run(run_type: str):
    """Usage:
        with track_run('daily') as run:
            ... do the pipeline work ...
            run.cost_usd_micros = 12_000
    On success, marks 'success'. On any exception, marks 'failure' with the
    exception message and re-raises — this function never swallows errors,
    it only makes sure they get logged before propagating (per PROJECT.md's
    failure-alerting principle: surfaced, never silently skipped)."""

    class _RunHandle:
        cost_usd_micros: int | None = None

    run_id = start_run(run_type)
    handle = _RunHandle()
    try:
        yield handle
    except Exception as exc:
        finish_run(run_id, status="failure", error_message=str(exc))
        raise
    else:
        finish_run(run_id, status="success", cost_usd_micros=handle.cost_usd_micros)


def get_last_successful_run(run_type: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT * FROM pipeline_runs
            WHERE run_type = %s AND status = 'success'
            ORDER BY finished_at DESC LIMIT 1
            """,
            (run_type,),
        ).fetchone()
        return dict(row) if row else None


def get_recent_runs(run_type: str | None = None, limit: int = 20) -> list[dict]:
    with get_connection() as conn:
        if run_type:
            rows = conn.execute(
                "SELECT * FROM pipeline_runs WHERE run_type = %s ORDER BY started_at DESC LIMIT %s",
                (run_type, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT %s", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]
