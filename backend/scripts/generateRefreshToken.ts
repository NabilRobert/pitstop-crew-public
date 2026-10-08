// One-time script — see docs/PROJECT.md → Auth / API Setup Progress, step 4.
//
// Run this, complete the browser OAuth consent with the Google account
// that has access to the Ads MCC, then paste the printed refresh token
// into .env as gads-refresh-token. Requires client-id/client-secret
// already in .env.
//
// access_type=offline + prompt=consent force Google to re-issue a refresh
// token even if this account already granted access in an earlier
// attempt — Google normally only issues one on the very first grant, and
// a prior attempt may have completed the grant before failing on a later
// step (e.g. a redirect URI mismatch), leaving no refresh token returned
// on retry without this. (Ported from the same fix in the Python version.)

import { createServer } from 'node:http'
import { exec } from 'node:child_process'
import { OAuth2Client } from 'google-auth-library'
import { GADS_CLIENT_ID, GADS_CLIENT_SECRET } from '../src/platform/config.js'

const PORT = 8080
const REDIRECT_URI = `http://localhost:${PORT}/`
const SCOPES = ['https://www.googleapis.com/auth/adwords']

async function main() {
  if (!GADS_CLIENT_ID || !GADS_CLIENT_SECRET) {
    console.error('Set client-id and client-secret in .env before running this.')
    process.exit(1)
  }

  const oauth2Client = new OAuth2Client(GADS_CLIENT_ID, GADS_CLIENT_SECRET, REDIRECT_URI)
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  })

  console.log(`\nOpening browser for consent. If it doesn't open, visit:\n${authUrl}\n`)
  exec(`open "${authUrl}"`) // macOS; harmless no-op failure elsewhere

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '', REDIRECT_URI)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      res.end(error ? 'Authorization failed — you may close this tab.' : 'You may close this tab now.')
      server.close()
      if (error) reject(new Error(error))
      else if (code) resolve(code)
      else reject(new Error('No code or error in callback'))
    })
    server.listen(PORT)
  })

  const { tokens } = await oauth2Client.getToken(code)

  if (!tokens.refresh_token) {
    console.error(
      "No refresh token returned even with prompt=consent — try revoking this app's access at " +
        'https://myaccount.google.com/permissions and running this script again.'
    )
    process.exit(1)
  }

  console.log('\nAdd this to .env as gads-refresh-token:\n')
  console.log(tokens.refresh_token)
}

main()
