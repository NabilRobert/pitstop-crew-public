"""Creates the schema on the hosted Postgres DB from the repo-root
schema.sql. Safe to re-run — every statement is IF NOT EXISTS."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402

from app.config import DATABASE_URL, REPO_ROOT  # noqa: E402

SCHEMA_PATH = REPO_ROOT / "schema.sql"


def main():
    if not DATABASE_URL:
        raise SystemExit("PITSTOP_DB_STRING not set — add it to .env")
    schema_sql = SCHEMA_PATH.read_text()
    with psycopg.connect(DATABASE_URL, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(schema_sql)
        conn.commit()
    print("Initialized schema on hosted Postgres DB")


if __name__ == "__main__":
    main()
