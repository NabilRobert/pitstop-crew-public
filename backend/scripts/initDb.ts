// Creates the schema on the hosted Postgres DB from the repo-root
// schema.sql (shared, not language-specific). Safe to re-run — every
// statement is IF NOT EXISTS.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { DATABASE_URL, REPO_ROOT } from '../src/config.js'

async function main() {
  if (!DATABASE_URL) throw new Error('PITSTOP_DB_STRING not set — add it to .env')
  const schemaSql = readFileSync(join(REPO_ROOT, 'schema.sql'), 'utf-8')
  const client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    await client.query(schemaSql)
    console.log('Initialized schema on hosted Postgres DB')
  } finally {
    await client.end()
  }
}

main()
