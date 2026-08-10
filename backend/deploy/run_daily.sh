#!/usr/bin/env bash
# Crontab target — fires every 15 min, runDaily.js itself decides whether
# it's actually due (see backend/src/settings.ts and crontab.txt). See
# deploy/README.md for the full setup. Wraps the compiled runDaily.js with
# logging, since cron discards stdout/stderr unless redirected. Runs the
# built output (dist/), not tsx-on-the-fly, for production robustness —
# `npm run build` must have been run first (see README.md).

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$BACKEND_DIR/logs"
LOG_FILE="$LOG_DIR/run_daily.log"

mkdir -p "$LOG_DIR"

{
    echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") — starting runDaily ==="
    cd "$BACKEND_DIR"
    node dist/scripts/runDaily.js
    echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") — runDaily finished ==="
} >> "$LOG_FILE" 2>&1
