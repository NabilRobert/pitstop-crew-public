#!/usr/bin/env bash
# Crontab target — see PROJECT.md → Automation ("plain crontab, 6am") and
# deploy/README.md for the full setup. Wraps run_daily.py with logging,
# since cron discards stdout/stderr unless redirected.

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$BACKEND_DIR/logs"
LOG_FILE="$LOG_DIR/run_daily.log"

mkdir -p "$LOG_DIR"

{
    echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") — starting run_daily ==="
    cd "$BACKEND_DIR"
    "$BACKEND_DIR/.venv/bin/python3" scripts/run_daily.py
    echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") — run_daily finished ==="
} >> "$LOG_FILE" 2>&1
