"""Time Machine: pin a Markov state for a future date. See PROJECT.md →
"Time Machine" — jumping forward silently fast-forwards the chain through
skipped days (generator.generate_day already does this), this module just
persists the pin so it survives across runs and feeds every future call.
"""

from datetime import date

from app.db import get_connection
from app.demo.markov import STATES


def set_override(target_date: date, forced_state: str) -> None:
    if forced_state not in STATES:
        raise ValueError(f"forced_state must be one of {STATES}, got {forced_state!r}")
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO demo_state_overrides (date, forced_state) VALUES (?, ?) "
            "ON CONFLICT(date) DO UPDATE SET forced_state = excluded.forced_state, "
            "set_at = CURRENT_TIMESTAMP",
            (target_date.isoformat(), forced_state),
        )


def get_overrides() -> dict[date, str]:
    with get_connection() as conn:
        rows = conn.execute("SELECT date, forced_state FROM demo_state_overrides").fetchall()
    return {date.fromisoformat(r["date"]): r["forced_state"] for r in rows}


def clear_override(target_date: date) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM demo_state_overrides WHERE date = ?", (target_date.isoformat(),))
