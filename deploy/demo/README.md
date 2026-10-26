# Read-only demo

Pitstop's public demo: the real run history (on synthetic ad data), behind a
read-only login given on request. It can't spend money. There are no model,
Google Ads, voice or email keys, no crontab, and the demo account is refused
every write. `verify.py` checks all of that against the running stack.

| Container | What | Limits |
|---|---|---|
| `db` | Postgres 16 with the cleaned seed | 256 MB, 0.5 CPU, no published port |
| `api` | the API (`HOST=0.0.0.0`, `TRUST_PROXY_HOPS=2`) | 384 MB, 0.5 CPU, read-only, no capabilities |
| `web` | Caddy: the built frontend, and `/api/*` passed to `api` | 64 MB, published on `127.0.0.1:8090` only |

## Build the seed (on the laptop)

```bash
deploy/demo/build-seed.sh backups/pitstop-2026-10-26.dump
```

This restores the private backup into a throwaway container and runs
[`clean.sql`](clean.sql). It writes `seed/pitstop-demo.dump`, which is
git-ignored. `clean.sql` removes:
- the owner's email address;
- the dealer's WhatsApp number and any other phone number;
- the Ask history;
- raw provider error text (account and trace IDs, spend, billing details).

It also switches the app's schedules off. It aborts, writing nothing, if
any of that survives.

## Run it locally

```bash
cp deploy/demo/demo.env.example deploy/demo/demo.env   # fill in; chmod 600
openssl rand -hex 16 > deploy/demo/db_password.txt     # and use it in PITSTOP_DB_STRING
docker compose -f deploy/demo/compose.yaml up -d --build
python3 deploy/demo/verify.py                         # must print PASS
```

Open http://127.0.0.1:8090 and sign in with the demo login.

`docker compose -f deploy/demo/compose.yaml down -v` resets the data to the
seed.

## On the server

The server already runs Docker (for the eval harness) and a Caddy that
terminates TLS.

1. **Copy the code and the seed:**
   ```bash
   git clone <this repo> ~/pitstop-demo
   scp deploy/demo/seed/pitstop-demo.dump <server>:~/pitstop-demo/deploy/demo/seed/
   ```
   Run the `scp` on the laptop, where the seed is. The seed must stay
   readable by Postgres inside the container (`chmod 644`; it holds only
   cleaned data). If it isn't, the restore fails and the database comes up
   empty. `verify.py` catches that.
2. **Create `deploy/demo/demo.env` and `deploy/demo/db_password.txt`** on
   the server.
   - Use mode 600, and edit them with `nano`.
   - Use fresh passwords; never reuse the old server's.
   - Set `FRONTEND_ORIGIN=https://pitcrew-public.my.id`.
   - Add no keys.
3. **Start it:**
   ```bash
   docker compose -f deploy/demo/compose.yaml up -d --build
   ```
4. **Verify it:** run `python3 deploy/demo/verify.py`. It must print
   `PASS`. If you bound the demo elsewhere (step 5), add
   `--base http://<that address>:8090`.
5. **Proxy the domain.** Where Caddy runs decides where the demo listens:
   - **Caddy on the host:** keep the default (loopback) and add
     ```
     pitcrew-public.my.id {
         reverse_proxy 127.0.0.1:8090
     }
     ```
   - **Caddy inside a container** (the case on the current server): inside
     that container, `127.0.0.1` is the container itself. Bind the demo to
     the Docker bridge gateway instead. Put
     `PITSTOP_DEMO_BIND=172.18.0.1` in `deploy/demo/.env` (git-ignored; use
     your network's gateway from `docker network inspect`), recreate `web`,
     and proxy to that address:
     ```
     pitcrew-public.my.id {
         reverse_proxy 172.18.0.1:8090
     }
     ```
     The gateway address isn't reachable from the internet; check with
     `curl -m 5 http://<public ip>:8090`, which must time out.
   Back up the Caddy config, `caddy validate` it, then reload.
6. **Check it from outside:** `https://pitcrew-public.my.id/api/health` should
   return `{"status":"ok"}`.

Install no crontab for it. Pitstop's schedules are all external cron, so
leaving it out is what keeps the pipeline from ever running here.
