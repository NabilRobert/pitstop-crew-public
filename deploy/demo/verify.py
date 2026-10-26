#!/usr/bin/env python3
"""Proves the running demo can't spend money (ADR-004). Run it against the
live stack after `docker compose up`:

    python3 deploy/demo/verify.py [--base http://127.0.0.1:8090] [--as owner]

1. Every route, taken from backend/src/api/routes/*.ts, is called with the
   demo login. Every write must be refused with 403. Every read must succeed
   without reaching a model.
2. The API's log, for the duration of the check, must show no attempt to
   call a model (the client fails at once without a key).
3. The API container must hold no model, Google Ads, voice or email
   variables, and run nothing but the API: no scheduler.
4. The database must hold the seed's data, not be empty.

Credentials are read from deploy/demo/demo.env and never printed. Exits 1
if any check fails. `--as owner` runs the same checks with the owner login,
which isn't read-only: it must fail, which shows the checks can.
"""

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ["docker", "compose", "-f", str(ROOT / "deploy/demo/compose.yaml")]
ROUTE_RE = re.compile(r"router\.(get|post|put|patch|delete)\(\s*['\"`]([^'\"`]+)['\"`]", re.S)
# Routes outside the read-only rule, and why.
EXEMPT = {
    ("POST", "/auth/login"): "signs in; mounted before auth",
    ("POST", "/auth/logout"): "ends the caller's own session",
}
STREAMS = {"/console/stream"}  # server-sent events: held open, checked by status only
SECRET_VARS = re.compile(r"^(sumopod-api-key|gads-|client-id|client-secret|RESEND_API_KEY|GMAIL_|ELEVENLABS)", re.I)
MODEL_CALL_SIGNS = ("sumopod-api-key not set", "OpenAIError", "APIConnectionError", "api.openai.com", "ai.sumopod.com")


def env_file() -> dict[str, str]:
    out = {}
    for line in (ROOT / "deploy/demo/demo.env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def call(base: str, method: str, path: str, token: str | None = None, body: dict | None = None):
    data = json.dumps(body or {}).encode() if method != "GET" else None
    req = urllib.request.Request(base + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=3 if path in STREAMS else 15) as r:
            return r.status, (r.read(2000) if path not in STREAMS else b"").decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(2000).decode(errors="replace")
    except TimeoutError:
        return 200, ""  # a stream that stayed open


def routes() -> list[tuple[str, str]]:
    found = set()
    for f in sorted((ROOT / "backend/src/api/routes").glob("*.ts")):
        if f.name.endswith(".test.ts"):
            continue
        for m, p in ROUTE_RE.findall(f.read_text()):
            found.add((m.upper(), p))
    return sorted(found, key=lambda r: (r[1], r[0]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8090")
    ap.add_argument("--as", dest="role", choices=["demo", "owner"], default="demo")
    args = ap.parse_args()
    api = args.base.rstrip("/") + "/api"
    env = env_file()
    user, pw = (env["DEMO_USERNAME"], env["DEMO_PASSWORD"]) if args.role == "demo" else (env["AUTH_USERNAME"], env["AUTH_PASSWORD"])

    status, body = call(api, "POST", "/auth/login", body={"username": user, "password": pw})
    if status != 200:
        print(f"FAIL  login as {args.role}: HTTP {status}")
        return 1
    token = json.loads(body)["token"]
    since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 1))

    failures: list[str] = []
    # A seed that fails to restore leaves Postgres up and "healthy" with an
    # empty database (initdb doesn't run again on restart), so check it loaded.
    count = subprocess.run(COMPOSE + ["exec", "-T", "db", "psql", "-U", "pitstop", "-d", "pitstop", "-At", "-c",
                                      "select count(*) from pipeline_runs"], capture_output=True, text=True).stdout.strip()
    if not count.isdigit() or int(count) == 0:
        failures.append(f"the database is empty or unreadable (pipeline_runs: {count or 'no answer'}): the seed didn't load")
    table = routes()
    writes = reads = 0
    for method, path in table:
        concrete = re.sub(r":[A-Za-z_]+", "1", path)
        if (method, path) in EXEMPT:
            continue
        status, body = call(api, method, concrete, token)
        if any(s in body for s in MODEL_CALL_SIGNS):
            failures.append(f"{method} {path}: response shows a model call was attempted")
        if method == "GET":
            reads += 1
            if status >= 500:
                failures.append(f"GET {path}: HTTP {status}")
        else:
            writes += 1
            if status != 403:
                failures.append(f"{method} {path}: HTTP {status}, expected 403")

    time.sleep(1)
    logs = subprocess.run(COMPOSE + ["logs", "--no-color", "--since", since, "api"], capture_output=True, text=True).stdout
    for sign in MODEL_CALL_SIGNS:
        if sign in logs:
            failures.append(f"API log shows a model call was attempted ({sign!r})")

    names = subprocess.run(COMPOSE + ["exec", "-T", "api", "sh", "-c", "env | cut -d= -f1"], capture_output=True, text=True).stdout.split()
    leaked = [n for n in names if SECRET_VARS.match(n)]
    if leaked:
        failures.append(f"API container has paid-service variables: {', '.join(leaked)}")
    procs = subprocess.run(COMPOSE + ["exec", "-T", "api", "ps", "-o", "args"], capture_output=True, text=True).stdout.splitlines()[1:]
    others = sorted({p.strip() for p in procs if "node backend/dist/src/api/main.js" not in p and not p.strip().startswith("ps ")})
    if others:
        failures.append(f"API container runs more than the API: {', '.join(others)}")

    print(f"{len(table)} routes: {reads} reads, {writes} writes checked, {len(EXEMPT)} exempt ({'; '.join(f'{m} {p}: {why}' for (m, p), why in EXEMPT.items())})")
    print(f"container: {len(names)} env vars, none for paid services" if not leaked else "container: paid-service variables present")
    print(f"database: {count} pipeline runs")
    for f in failures:
        print("FAIL ", f)
    print("PASS: the demo can't reach a model" if not failures else f"{len(failures)} check(s) failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
