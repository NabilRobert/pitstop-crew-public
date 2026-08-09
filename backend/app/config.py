"""Central settings, loaded once from the repo-root .env file."""

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

# Postgres, hosted on Sumopod (Sumobase) — replaced the local SQLite file.
DATABASE_URL = os.environ.get("PITSTOP_DB_STRING")

# Google Ads credentials — keys match what's already in the repo's .env.
GADS_DEVELOPER_TOKEN = os.environ.get("gads-api-token")
GADS_CLIENT_ID = os.environ.get("client-id")
GADS_CLIENT_SECRET = os.environ.get("client-secret")
GADS_REFRESH_TOKEN = os.environ.get("gads-refresh-token")
GADS_LOGIN_CUSTOMER_ID = os.environ.get("gads-login-customer-id")  # the MCC id
# The account actually being queried. Defaults to the MCC id, which is only
# correct if the MCC itself is the working account — set this separately in
# .env (gads-target-customer-id) if the real account is a distinct client
# under the MCC. Not yet confirmed which applies here.
GADS_TARGET_CUSTOMER_ID = os.environ.get("gads-target-customer-id", GADS_LOGIN_CUSTOMER_ID)

# AI layer — routed through Sumopod (OpenAI-compatible gateway), not OpenAI
# directly. Host confirmed as ai.sumopod.com; the exact path is NOT
# confirmed from official docs (sparse at time of writing) — SUMOPOD_BASE_URL
# is overridable in .env in case the default guess below is wrong.
SUMOPOD_API_KEY = os.environ.get("sumopod-api-key")
SUMOPOD_BASE_URL = os.environ.get("SUMOPOD_BASE_URL", "https://ai.sumopod.com/v1")

# Email — Resend primary, Gmail SMTP fallback (PROJECT.md → Automation).
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "reports@example.com")
REPORT_RECIPIENT_EMAIL = os.environ.get("REPORT_RECIPIENT_EMAIL")
GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")  # Gmail app password, not the account password

DATA_SOURCE = os.environ.get("DATA_SOURCE", "demo")  # "demo" or "live"

# Frontend origin, for CORS (see PROJECT.md — domain deferred, so this
# defaults to localhost for dev; set the real Vercel URL in .env at deploy
# time). Vite's default dev port is 5173, not 3000.
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
