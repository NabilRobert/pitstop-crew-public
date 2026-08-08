"""Builds a GoogleAdsClient from the credentials in .env — no separate
google-ads.yaml file, config stays centralized like everything else."""

from google.ads.googleads.client import GoogleAdsClient

from app.config import (
    GADS_CLIENT_ID,
    GADS_CLIENT_SECRET,
    GADS_DEVELOPER_TOKEN,
    GADS_LOGIN_CUSTOMER_ID,
    GADS_REFRESH_TOKEN,
)

_REQUIRED = {
    "gads-api-token": GADS_DEVELOPER_TOKEN,
    "client-id": GADS_CLIENT_ID,
    "client-secret": GADS_CLIENT_SECRET,
    "gads-refresh-token": GADS_REFRESH_TOKEN,
    "gads-login-customer-id": GADS_LOGIN_CUSTOMER_ID,
}


def get_client() -> GoogleAdsClient:
    missing = [key for key, value in _REQUIRED.items() if not value]
    if missing:
        raise RuntimeError(
            f"Missing Google Ads credentials in .env: {', '.join(missing)}. "
            f"Run scripts/generate_refresh_token.py for the refresh token."
        )
    return GoogleAdsClient.load_from_dict({
        "developer_token": GADS_DEVELOPER_TOKEN,
        "client_id": GADS_CLIENT_ID,
        "client_secret": GADS_CLIENT_SECRET,
        "refresh_token": GADS_REFRESH_TOKEN,
        "login_customer_id": GADS_LOGIN_CUSTOMER_ID,
        "use_proto_plus": True,
    })
