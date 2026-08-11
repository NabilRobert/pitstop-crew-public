# Deploying the backend (VPS)

Written ahead of actually provisioning the VPS — see PROJECT.md → Deployment.
Run through this once the Sumopod VPS exists.

## 1. Get the code on the box
```bash
git clone <repo-url> google-ads
cd google-ads/backend-ts
```

## 2. Node environment
```bash
npm install
npm run build   # compiles src/ + scripts/ to dist/ — the deploy scripts run the built output, not tsx
```

## 3. Environment variables
Copy `.env.example` (repo root) to `.env` (repo root, one level up from
`backend-ts/`) and fill in every value — same credentials already in use
locally (Sumopod DB connection string, Sumopod AI key, Google Ads
credentials, email provider). `.env` is gitignored; it has to be created
fresh on the VPS, not committed.

## 4. Verify before scheduling anything
```bash
node -e "
import('./dist/src/data/db.js').then(async ({query}) => {
  console.log('DB OK:', await query('SELECT 1'));
  process.exit(0);
});
"
node -e "
import('./dist/src/agents/llm.js').then(async ({complete, MODEL_MINI}) => {
  console.log(await complete(MODEL_MINI, 'You are a test.', 'Say OK'));
  process.exit(0);
});
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

## 6. Install `postgresql-client` (for pg_dump, used by the backup script)
```bash
sudo apt install postgresql-client
```

## 7. Install the crontab entries
```bash
crontab -e
```
Paste in both lines from `deploy/crontab.txt`, with the path adjusted to
where the repo actually lives on this box.

## 8. Confirm it's wired up
```bash
crontab -l                      # confirm the entries saved
./deploy/run_daily.sh           # run it once manually, right now
tail -f logs/run_daily.log      # watch it run
```
A manual run exercises the exact same script cron will call — if it
works here, it'll work at 6am.

## 9. CORS
Once the frontend is deployed to Vercel, set `FRONTEND_ORIGIN` in `.env`
to the real Vercel URL (currently defaults to `http://localhost:5173`).

## Redeploying after code changes
```bash
git pull
npm install   # only if dependencies changed
npm run build
```
No restart needed for the cron-based scripts (each run is a fresh
process); only matters if a long-running process (e.g. the API server)
is also kept up via something like pm2/systemd.

## Logs
`backend-ts/logs/run_daily.log` — append-only, not rotated yet. Worth
adding `logrotate` once this has been running a while and the file's
grown large; not needed on day one.
