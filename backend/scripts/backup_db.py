"""Daily DB backup — closes the "no confirmed backup plan" Known Gap in
PROJECT.md. Sumopod/Sumobase's own backup policy for this Postgres
instance isn't documented anywhere findable, so this doesn't rely on it.

Runs pg_dump in custom format (compressed, pg_restore-compatible) and
keeps a rolling window of recent backups locally. Requires the
`postgresql-client` package on the host (for pg_dump) — not a Python
dependency, a system one.
"""

import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import DATABASE_URL, REPO_ROOT  # noqa: E402

BACKUP_DIR = REPO_ROOT / "backend" / "backups"
RETENTION_DAYS = 14


def main():
    if not DATABASE_URL:
        raise SystemExit("PITSTOP_DB_STRING not set — add it to .env")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    dump_path = BACKUP_DIR / f"backup_{timestamp}.dump"

    subprocess.run(
        ["pg_dump", DATABASE_URL, "-Fc", "-f", str(dump_path)],
        check=True,
    )
    print(f"Backed up to {dump_path}")

    _prune_old_backups()


def _prune_old_backups():
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    for f in BACKUP_DIR.glob("backup_*.dump"):
        if datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc) < cutoff:
            f.unlink()
            print(f"Pruned old backup: {f.name}")


if __name__ == "__main__":
    main()
