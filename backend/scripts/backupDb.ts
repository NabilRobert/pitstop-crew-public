// Daily DB backup — see PROJECT.md → Automation ("Database backup").
// Sumopod/Sumobase's own backup policy for the hosted Postgres instance
// isn't documented anywhere findable, so this doesn't rely on it.
//
// Runs pg_dump in custom format (compressed, pg_restore-compatible) and
// keeps a rolling window of recent backups locally. Requires the
// `postgresql-client` package on the host (for pg_dump) — not an npm
// dependency, a system one.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { DATABASE_URL, REPO_ROOT } from '../src/config.js'

const execFileAsync = promisify(execFile)

const BACKUP_DIR = join(REPO_ROOT, 'backend-ts', 'backups')
const RETENTION_DAYS = 14

async function main() {
  if (!DATABASE_URL) throw new Error('PITSTOP_DB_STRING not set — add it to .env')

  await mkdir(BACKUP_DIR, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', 'T').slice(0, 15) + 'Z'
  const dumpPath = join(BACKUP_DIR, `backup_${timestamp}.dump`)

  await execFileAsync('pg_dump', [DATABASE_URL, '-Fc', '-f', dumpPath])
  console.log(`Backed up to ${dumpPath}`)

  await pruneOldBackups()
}

async function pruneOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000
  const files = await readdir(BACKUP_DIR)
  for (const f of files) {
    if (!f.startsWith('backup_') || !f.endsWith('.dump')) continue
    const path = join(BACKUP_DIR, f)
    const stats = await stat(path)
    if (stats.mtimeMs < cutoff) {
      await unlink(path)
      console.log(`Pruned old backup: ${f}`)
    }
  }
}

main()
