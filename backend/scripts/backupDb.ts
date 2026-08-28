// Daily DB backup — see PROJECT.md → Automation ("Database backup").
// Sumopod/Sumobase's own backup policy for the hosted Postgres instance
// isn't documented anywhere findable, so this doesn't rely on it.
//
// Runs pg_dump in custom format (compressed, pg_restore-compatible) and
// keeps a rolling window of recent backups locally. Requires the
// `postgresql-client` package on the host (for pg_dump) — not an npm
// dependency, a system one. Tracked in pipeline_runs like daily/weekly
// runs (run_type='backup'), so a silent failure isn't invisible the way
// it was before — see the backup dead-man's-switch check in runDaily.ts.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { DATABASE_URL, REPO_ROOT } from '../src/platform/config.js'
import { trackRun } from '../src/pipeline/pipelineRuns.js'
import { formatBackupFailureAlert } from '../src/reporting/reports.js'
import { deliverReport } from '../src/platform/emailDelivery.js'

const execFileAsync = promisify(execFile)

// backend/backups/ — matches .gitignore's "backend/backups/" entry and
// where this has actually been writing on the VPS. (REPO_ROOT resolves to
// the monorepo root via schema.sql, not backend/ itself — this used to
// read 'backend-ts' here, a stale segment from before that folder was
// renamed to 'backend', which never matched anything real.)
const BACKUP_DIR = join(REPO_ROOT, 'backend', 'backups')
const RETENTION_DAYS = 14

async function main() {
  await trackRun('backup', async () => {
    if (!DATABASE_URL) throw new Error('PITSTOP_DB_STRING not set — add it to .env')

    await mkdir(BACKUP_DIR, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', 'T').slice(0, 15) + 'Z'
    const dumpPath = join(BACKUP_DIR, `backup_${timestamp}.dump`)

    try {
      await execFileAsync('pg_dump', [DATABASE_URL, '-Fc', '-f', dumpPath])
    } catch (err) {
      // execFile's thrown error embeds the full command line — including
      // DATABASE_URL's plaintext credentials — in its .message. That would
      // otherwise land in pipeline_runs.error_message (DB-stored) and get
      // emailed in plaintext by the failure alert below. Rethrow with just
      // pg_dump's own stderr (the actually-useful diagnostic) instead.
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: unknown }).code : undefined
      const stderr =
        err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr: unknown }).stderr).trim() : ''
      throw new Error(`pg_dump failed${code ? ` (${code})` : ''}${stderr ? `: ${stderr}` : ''}`)
    }
    console.log(`Backed up to ${dumpPath}`)

    await pruneOldBackups()
  })
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

// trackRun re-throws after marking the pipeline_runs row 'failure' — catch
// here to also send an email alert before exiting non-zero, same
// "surfaced, never silently skipped" pattern runDaily.ts uses.
main().catch(async (err) => {
  const message = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err)
  const { subject, body } = formatBackupFailureAlert(message)
  await deliverReport('backup', subject, body)
  console.error(message)
  process.exit(1)
})
