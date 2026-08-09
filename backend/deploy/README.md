# Deploying the backend (VPS)

Written ahead of actually provisioning the VPS — see PROJECT.md → Deployment.
Run through this once the Sumopod VPS exists.

## 1. Get the code on the box
```bash
git clone <repo-url> google-ads
cd google-ads/backend
```

## 2. Python environment
```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

## 3. Environment variables
Copy `.env.example` (repo root) to `.env` (repo root, one level up from
`backend/`) and fill in every value — same credentials already in use
locally (Sumopod DB connection string, Sumopod AI key, Google Ads
credentials, email provider). `.env` is gitignored; it has to be created
fresh on the VPS, not committed.

## 4. Verify before scheduling anything
```bash
./.venv/bin/python3 -c "
from app.db import get_connection
with get_connection() as conn:
    print('DB OK')
"
./.venv/bin/python3 -c "
from app.llm import complete, MODEL_MINI
print(complete(MODEL_MINI, 'You are a test.', 'Say OK'))
"
```
Both should succeed before moving on — if either fails, fix it before
scheduling, not after (a broken cron job just fails silently at 6am
otherwise, caught only by the dead-man's-switch heartbeat the next day).

## 5. Set the VPS's timezone deliberately
"6am" should mean 6am for the person reading the report — don't leave the
box on UTC by accident:
```bash
sudo timedatectl set-timezone Asia/Jakarta   # or whichever is correct
timedatectl   # confirm
```

## 6. Install the crontab entry
```bash
crontab -e
```
Paste in the line from `deploy/crontab.txt`, with the path adjusted to
where the repo actually lives on this box.

## 7. Confirm it's wired up
```bash
crontab -l                      # confirm the entry saved
./deploy/run_daily.sh           # run it once manually, right now
tail -f logs/run_daily.log      # watch it run
```
A manual run exercises the exact same script cron will call — if it
works here, it'll work at 6am.

## 8. CORS
Once the frontend is deployed to Vercel, set `FRONTEND_ORIGIN` in `.env`
to the real Vercel URL (currently defaults to `http://localhost:3000`).

## Logs
`backend/logs/run_daily.log` — append-only, not rotated yet. Worth adding
`logrotate` once this has been running a while and the file's grown large;
not needed on day one.
