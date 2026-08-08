"""Markov chain for demo-mode daily state — see PROJECT.md → Generation algorithm.

4 states, biased toward persistence so streaks/momentum emerge naturally.
Not exported directly; use resolve_state_sequence() to walk the chain.
"""

import hashlib
import random
from datetime import date, timedelta

STATES = ["good", "bad", "standstill", "volatile"]


def stable_seed(*parts) -> int:
    """Deterministic seed from arbitrary parts — random.Random(tuple) isn't
    supported, and Python's built-in hash() is randomized per-process for
    strings, so neither is safe for reproducibility across runs."""
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()
    return int(digest[:16], 16)

# rows = "from" state, cols = "to" state, in STATES order. Diagonal-heavy = persistence.
TRANSITIONS = {
    "good":       {"good": 0.50, "bad": 0.15, "standstill": 0.25, "volatile": 0.10},
    "bad":        {"good": 0.15, "bad": 0.50, "standstill": 0.25, "volatile": 0.10},
    "standstill": {"good": 0.20, "bad": 0.20, "standstill": 0.50, "volatile": 0.10},
    "volatile":   {"good": 0.20, "bad": 0.20, "standstill": 0.20, "volatile": 0.40},
}


def _day_rng(seed: int, day: date) -> random.Random:
    """Independent, deterministic RNG per (seed, day) — order-independent,
    so resolving any single day never depends on how many days came before it
    having been rendered the same way."""
    return random.Random(stable_seed(seed, day.isoformat()))


def next_state(prev_state: str, seed: int, day: date) -> str:
    rng = _day_rng(seed, day)
    row = TRANSITIONS[prev_state]
    r = rng.random()
    cumulative = 0.0
    for state in STATES:
        cumulative += row[state]
        if r <= cumulative:
            return state
    return STATES[-1]  # floating-point fallback


def resolve_state_sequence(start_date: date, end_date: date, seed: int, overrides: dict) -> dict:
    """Walk the chain from start_date to end_date inclusive, honoring any
    forced states in `overrides` (date -> state). Cheap — pure arithmetic,
    no I/O — this is what makes Time Machine fast-forwarding "free".

    Returns {date: state} for every day in the range.
    """
    states = {}
    current = "standstill"  # arbitrary, deterministic starting point
    day = start_date
    while day <= end_date:
        if day in overrides:
            current = overrides[day]
        else:
            current = next_state(current, seed, day)
        states[day] = current
        day += timedelta(days=1)
    return states
