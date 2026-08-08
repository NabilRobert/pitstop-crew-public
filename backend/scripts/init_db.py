"""Creates backend/data.db from the repo-root schema.sql. Safe to re-run — uses CREATE TABLE, no DROP."""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import DB_PATH, REPO_ROOT  # noqa: E402

SCHEMA_PATH = REPO_ROOT / "schema.sql"


def main():
    schema_sql = SCHEMA_PATH.read_text()
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(schema_sql)
        conn.commit()
    finally:
        conn.close()
    print(f"Initialized {DB_PATH}")


if __name__ == "__main__":
    main()
