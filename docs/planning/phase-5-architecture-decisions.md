# Phase 5: Architecture Decisions

Short ADRs, settled 2026-10-26. The time budget is "as fast as possible",
so the slice plan (normally Phase 7) is at the end of this doc.

### ADR-001: Evidence is plain SQL, run by a shell script

**Decision:**
- One `.sql` file per question in `evidence/queries/`.
- `evidence/run.sh` starts a throwaway `postgres:16` container (pinned by
  digest), restores the backup, runs each query with `psql --csv`, and
  writes the results to `docs/evidence/`.

**Why:** a reviewer can read exactly what was counted, with no code
between the query and the number. It needs nothing beyond Docker.

**Rejected:**
- *A Node script:* it would hide the queries inside code.
- *A notebook:* heavy, and hard to rerun exactly.
- *Querying the live database:* it may lapse, and its numbers would drift
  between runs.

### ADR-002: One frozen snapshot is the source of truth

**Decision:**
- Every number comes from the 2026-10-26 backup.
- Its SHA-256 is recorded in `docs/evidence/README.md`, so each result is
  tied to one exact snapshot.
- The dump itself stays private. (Should:) a cleaned export of the run
  metadata is published, so others can rerun the queries.

**Why:** the operating period is over, so a frozen snapshot is honest and
reproducible.

### ADR-003: The demo runs in Docker Compose on the MCP server

**Decision:** three containers, none reachable from outside except
through the server's existing proxy.

| Container | Contents | Limits |
|---|---|---|
| `api` | Node backend | non-root, read-only filesystem, `cap_drop: ALL`, 384 MB, 0.5 CPU |
| `db` | `postgres:16` holding the cleaned data | 256 MB, own volume, no published port |
| `web` | `caddy:2-alpine` serving the built frontend | 64 MB |

The server's existing Caddy serves `<demo-domain>` and proxies all of it
to `web`, the only published container (on loopback). `web`'s own Caddy
serves the frontend and passes `/api/*` to `api`, with the prefix stripped
(`handle_path`), since the API's routes sit at the root. *(As built,
2026-10-26: originally the server's Caddy was to split the routes itself.
Doing it inside `web` makes the server step one `reverse_proxy` line, and
the same stack runs unchanged on a laptop.)*

**Why:**
- It's isolated from MCP-backbone: separate database cluster, separate
  processes, and separate memory caps on a shared server.
- It's one domain and one certificate, with the frontend and API on the
  same origin. The frontend is built with
  `VITE_API_URL=https://<demo-domain>/api`.

**Rejected:**
- *Running it natively under systemd, the way MCP-backbone runs:* it would
  share a Postgres cluster with MCP-backbone's key data.
- *A separate database in the server's own Postgres:* containers reach the
  host's loopback awkwardly, and it's the same cluster again.
- *The frontend on Vercel:* another account, and cross-origin setup.
- *An `api.` subdomain:* a second DNS record and certificate.

**Note:** the server's Caddy configuration belongs to another project's
setup, so adding the site is a server step done by Arthur or the server
session.

### ADR-004: Zero spend by construction, not by configuration

**Decision:** four layers, any one of which is enough on its own:
1. **No paid API keys** in the demo's environment: no model gateway,
   Google Ads, voice or email keys. A model call fails at the client.
2. **No crontab.** All scheduling in Pitstop is external cron
   (`backend/deploy/crontab.txt`). It was checked: there is no scheduler
   inside the app. No crontab means no runs.
3. **The demo account is read-only.** `demoReadOnly` refuses anything but
   GET/HEAD.
4. **A test** (Phase 2, D4) asserts layer 3 for every route.

The owner login gets a new random password that only Arthur holds. With
no keys, even the owner can't make it spend.

**Rejected:**
- *A "hosted demo" feature flag in the code:* it adds code to trust;
  keeping the keys off the server is simpler and can be checked.

### ADR-005: The data is cleaned before it reaches the server

**Decision:**
- Restore the backup locally, then run `evidence/clean-for-demo.sql`,
  then dump, then copy the dump to the server.
- The script reports how many rows it changed in each table.
- Candidates: email addresses, the report recipient, owner settings, any
  stored credentials, and the "ask" logs. The exact fields are decided in
  slice 3, after inspecting the data.

**Why:** the server never holds anything that wasn't meant to be public.

### ADR-006: The case study cites only the evidence

**Decision:**
- Every number in `docs/case-study.md` links to a file in `docs/evidence/`.
- Every failure written up names its fixing commit.
- Where the records can't answer a question (for example, calls per run
  before tracing began on 2026-09-28), the case study says so.

## Slice plan

| Slice | Delivers | Done when |
|---|---|---|
| **1. Evidence** | The existing tests run in this clone (fixed if needed); the queries, `run.sh` and results in `docs/evidence/` | One command rebuilds the results byte for byte; the snapshot's hash is recorded |
| **2. Case study** | `docs/case-study.md` rewritten on the evidence, with three failures tied to commits; README links checked | Every number is traceable to a file; nothing is estimated without saying so |
| **3. Demo** | The cleaning script; the compose files; the demo-route test; a full local run on the Mac with no keys; then the server deploy through Arthur | The demo serves the cleaned data at `<demo-domain>`; the env holds no keys; no crontab; the demo login gets a 403 on writes |
| **(Should)** | CI for the tests; the cleaned metadata export; JOURNEY | |

Slices 1 and 2 are local and free. Slice 3's server part waits for the
domain.
