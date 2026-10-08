// Builds a Google Ads customer client from the credentials in .env.
// Uses google-ads-api, an unofficial/community-maintained npm package —
// there is no officially Google-maintained Node/TS client library. See
// docs/PROJECT.md for the trade-off this represents versus the Python version.

import { GoogleAdsApi } from 'google-ads-api'
import {
  GADS_CLIENT_ID,
  GADS_CLIENT_SECRET,
  GADS_DEVELOPER_TOKEN,
  GADS_LOGIN_CUSTOMER_ID,
  GADS_REFRESH_TOKEN,
  GADS_TARGET_CUSTOMER_ID,
} from '../platform/config.js'

const REQUIRED: Record<string, string | undefined> = {
  'gads-api-token': GADS_DEVELOPER_TOKEN,
  'client-id': GADS_CLIENT_ID,
  'client-secret': GADS_CLIENT_SECRET,
  'gads-refresh-token': GADS_REFRESH_TOKEN,
  'gads-login-customer-id': GADS_LOGIN_CUSTOMER_ID,
}

export function getClient() {
  const missing = Object.entries(REQUIRED)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) {
    throw new Error(
      `Missing Google Ads credentials in .env: ${missing.join(', ')}. Run scripts/generateRefreshToken.ts for the refresh token.`
    )
  }

  const api = new GoogleAdsApi({
    client_id: GADS_CLIENT_ID!,
    client_secret: GADS_CLIENT_SECRET!,
    developer_token: GADS_DEVELOPER_TOKEN!,
  })

  return api.Customer({
    customer_id: GADS_TARGET_CUSTOMER_ID!,
    refresh_token: GADS_REFRESH_TOKEN!,
    login_customer_id: GADS_LOGIN_CUSTOMER_ID!,
  })
}
