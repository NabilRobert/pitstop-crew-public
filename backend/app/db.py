"""Postgres connection layer (Sumopod/Sumobase-hosted). Replaced local
SQLite — same get_connection() context-manager interface, dict-like rows,
so callers didn't need to change.

The connection string uses port 6432 — PgBouncer's standard port, not
Postgres's native 5432 — meaning this DB sits behind a connection pooler.
psycopg's server-side prepared statements don't work correctly under
PgBouncer's transaction pooling (a prepared statement cached on one
physical connection may not exist when the pooler hands out a different
one), hence prepare_threshold=None below to disable them."""

from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from app.config import DATABASE_URL


@contextmanager
def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("PITSTOP_DB_STRING not set — add it to .env")
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row, prepare_threshold=None)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
