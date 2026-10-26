#!/bin/sh
# Runs once, when the database volume is first created: loads the cleaned seed.
set -e
pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error /seed/pitstop-demo.dump
