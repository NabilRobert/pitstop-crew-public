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
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")

DATA_SOURCE = os.environ.get("DATA_SOURCE", "demo")  # "demo" or "live"
