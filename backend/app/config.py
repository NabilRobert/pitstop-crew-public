"""Central settings, loaded once from the repo-root .env file."""

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

DB_PATH = REPO_ROOT / "backend" / "data.db"

# Google Ads credentials — keys match what's already in the repo's .env.
GADS_DEVELOPER_TOKEN = os.environ.get("gads-api-token")
GADS_CLIENT_ID = os.environ.get("client-id")
GADS_CLIENT_SECRET = os.environ.get("client-secret")
GADS_REFRESH_TOKEN = os.environ.get("gads-refresh-token")
GADS_LOGIN_CUSTOMER_ID = os.environ.get("gads-login-customer-id")

# Added by later tasks — not required yet.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Email — Resend primary, Gmail SMTP fallback (PROJECT.md → Automation).
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "reports@example.com")
REPORT_RECIPIENT_EMAIL = os.environ.get("REPORT_RECIPIENT_EMAIL")
GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")  # Gmail app password, not the account password

DATA_SOURCE = os.environ.get("DATA_SOURCE", "demo")  # "demo" or "live"

# Frontend origin, for CORS (see PROJECT.md — domain deferred, so this
# defaults to localhost for dev; set the real Vercel URL in .env at deploy time).
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
