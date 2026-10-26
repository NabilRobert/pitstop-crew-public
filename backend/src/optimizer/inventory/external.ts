// The dealer's own inventory database, read through INVENTORY_DB_STRING
// (docs/overhaul-v3-backend.md section 10, "Safety"):
// - its own small pg.Pool, never the Pitstop pool in db.ts;
// - every query inside BEGIN READ ONLY with a statement timeout, on top
//   of the read-only role the owner is asked to provide;
// - only the fixed queries in mapping.ts, checked by assertReadOnlySql
//   before they run;
// - the connection string is a secret: never logged, returned or shown.
//   Errors leave here through sanitizeInventoryError only.

import pg from 'pg'
import { INVENTORY_DB_STRING } from '../../platform/config.js'
import { redactSecrets } from '../../platform/redact.js'
import { wibDate } from '../../platform/timezone.js'
import { EXTERNAL_MAPPING, MAPPING_PENDING_MESSAGE, type ExternalMapping } from './mapping.js'
import type { InventorySource, Vehicle, VehicleEvent } from './types.js'

const POOL_MAX = 3
const CONNECT_TIMEOUT_MS = 5_000
const STATEMENT_TIMEOUT_MS = 10_000

// Statements a read-only inventory query may start with, and words that
// must never appear in one. Belt and braces: READ ONLY transactions and
// the read-only role already stop writes; this stops a bad mapping edit
// from even being sent.
const ALLOWED_START = /^\s*(select|with)\b/i
const FORBIDDEN = /\b(insert|update|delete|merge|upsert|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|vacuum|lock|set|reset|comment|refresh)\b/i

/** Throws unless `sql` is a single SELECT (or WITH … SELECT) with no
 * data- or schema-changing keyword and no statement separator. */
export function assertReadOnlySql(sql: string): void {
  const body = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  if (!ALLOWED_START.test(body)) throw new Error('inventory query rejected: only SELECT / WITH queries are allowed')
  if (/;\s*\S/.test(body)) throw new Error('inventory query rejected: one statement only')
  const hit = body.match(FORBIDDEN)
  if (hit) throw new Error(`inventory query rejected: "${hit[0].toLowerCase()}" is not allowed in a read-only query`)
}

// Driver and network failures are reported as one of these fixed messages,
// never as the driver's own text: that can carry the database username,
// table and column names, or a host the redactor doesn't know about.
// Matched on the error's code (Postgres SQLSTATE or Node errno) first,
// then on a few code-less messages pg itself produces.
const DRIVER_ERRORS: { codes: RegExp; message: RegExp | null; text: string }[] = [
  { codes: /^(28P01|28000)$/, message: /password authentication failed|no pg_hba\.conf entry/i, text: 'the inventory database rejected the login' },
  { codes: /^3D000$/, message: null, text: 'the inventory database was not found' },
  { codes: /^(ENOTFOUND|EAI_AGAIN)$/, message: /getaddrinfo/i, text: "the inventory database's host could not be resolved" },
  { codes: /^(ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE)$/, message: /connection terminated|server closed the connection/i, text: 'could not reach the inventory database' },
  { codes: /^(ETIMEDOUT|57014)$/, message: /timeout|timed out/i, text: 'the inventory database timed out' },
  { codes: /^25006$/, message: null, text: 'the inventory database refused a write (read-only)' },
  { codes: /^42/, message: /does not exist|syntax error/i, text: 'an inventory query failed — check the column mapping' },
  { codes: /^(08|53|XX)/, message: null, text: 'the inventory database returned an error' },
]

/** Short, single-line, secret-free text for an inventory failure — what
 * the API's `error` field and the run trace are allowed to show. Only the
 * messages this file writes itself (mapping pending, query rejected) pass
 * through, still redacted; anything from the driver or the network becomes
 * a fixed message (DRIVER_ERRORS), so the database username, its table
 * names and the driver's own wording never leave the process. */
export function sanitizeInventoryError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const ours = raw === MAPPING_PENDING_MESSAGE || raw.startsWith('inventory query rejected')
  if (!ours) {
    const code = err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : ''
    const known = DRIVER_ERRORS.find((d) => (code !== '' && d.codes.test(code)) || (d.message !== null && d.message.test(raw)))
    return known ? known.text : 'the inventory database returned an error'
  }
  let text = redactSecrets(raw)
  // Belt and braces for connection strings redactSecrets doesn't know
  // about (it only learns env values it has seen): strip any URL.
  text = text.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi, '[redacted connection string]')
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > 200 ? `${text.slice(0, 197)}...` : text
}

let pool: pg.Pool | null = null

function getPool(connectionString: string): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString,
      max: POOL_MAX,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      application_name: 'pitstop-inventory-readonly',
    })
    // An idle client erroring (the server restarting) must not crash the
    // process; the next query just reconnects.
    pool.on('error', () => {})
  }
  return pool
}

async function readOnlyQuery(connectionString: string, sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  assertReadOnlySql(sql)
  const client = await getPool(connectionString).connect()
  try {
    await client.query('BEGIN READ ONLY')
    const result = await client.query(sql, params)
    await client.query('COMMIT')
    return result.rows
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export class ExternalInventorySource implements InventorySource {
  readonly kind = 'connected' as const

  constructor(
    private readonly connectionString: string,
    private readonly mapping: ExternalMapping | null = EXTERNAL_MAPPING
  ) {}

  private requireMapping(): ExternalMapping {
    if (!this.mapping) throw new Error(MAPPING_PENDING_MESSAGE)
    return this.mapping
  }

  async listVehicles(): Promise<Vehicle[]> {
    const m = this.requireMapping()
    return (await readOnlyQuery(this.connectionString, m.vehiclesQuery)).map((r) => m.toVehicle(r))
  }

  async listEvents(since: string): Promise<VehicleEvent[]> {
    const m = this.requireMapping()
    if (!m.eventsQuery) return []
    return (await readOnlyQuery(this.connectionString, m.eventsQuery, [since])).map((r) => m.toEvent(r))
  }

  async snapshotDate(): Promise<string> {
    return wibDate()
  }
}

/** The configured external source, or null when INVENTORY_DB_STRING is
 * empty (then the demo inventory is used). */
export function externalSourceFromConfig(): ExternalInventorySource | null {
  return INVENTORY_DB_STRING ? new ExternalInventorySource(INVENTORY_DB_STRING) : null
}
