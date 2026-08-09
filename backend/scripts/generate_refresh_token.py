"""One-time script — see PROJECT.md → Auth / API Setup Progress, step 4.

Run this, complete the browser OAuth consent with the Google account that
has access to the Ads MCC, then paste the printed refresh token into .env
as gads-refresh-token. Requires client-id/client-secret already in .env.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from google_auth_oauthlib.flow import InstalledAppFlow  # noqa: E402

from app.config import GADS_CLIENT_ID, GADS_CLIENT_SECRET  # noqa: E402

SCOPES = ["https://www.googleapis.com/auth/adwords"]


def main():
    if not GADS_CLIENT_ID or not GADS_CLIENT_SECRET:
        raise SystemExit("Set client-id and client-secret in .env before running this.")

    client_config = {
        "installed": {
            "client_id": GADS_CLIENT_ID,
            "client_secret": GADS_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }
    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
    # prompt="consent" forces Google to re-issue a refresh token even if this
    # account already granted access in an earlier attempt — Google normally
    # only issues one on the very first grant, and a prior attempt may have
    # completed the grant before failing on a later step (e.g. the redirect
    # mismatch), leaving no refresh token returned on retry without this.
    credentials = flow.run_local_server(port=8080, access_type="offline", prompt="consent")

    if not credentials.refresh_token:
        raise SystemExit(
            "No refresh token returned even with prompt=consent — try revoking "
            "this app's access at https://myaccount.google.com/permissions and "
            "running this script again."
        )

    print("\nAdd this to .env as gads-refresh-token:\n")
    print(credentials.refresh_token)


if __name__ == "__main__":
    main()
