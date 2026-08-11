# Pitstop — Google Ads AI Performance Dashboard

Pulls performance data from a Google Ads account, stores it over time, and runs it through a small team of AI agents (Anna, Rico, Sammy, reviewed by Ciri the critic) that analyze it, recommend action, and summarize the result — daily and weekly, automatically. Every recommendation is a suggestion, never an applied change. See [`PROJECT.md`](./PROJECT.md) for the full design rationale, and the app's own **How It Works** page for a guided walkthrough once it's running.

`backend/` and `frontend/` are two fully separate deployable units, talking only over the REST API on `:8000` — there's no shared runtime or merged build. This repo just makes it convenient to install and run both from one place during development.

## Quickstart

**Prerequisites:** Node.js 20+, a Postgres database (hosted, not local — see below), and API credentials for Google Ads + an LLM gateway if you want live data (demo mode works with none of that).

```bash
npm install                    # installs both backend/ and frontend/ (npm workspaces)
cp .env.example .env           # fill in DB connection string, API keys — see comments in the file
cp frontend/.env.local.example frontend/.env.local   # points the frontend dev server at :8000
```

Initialize the database schema (safe to re-run):
```bash
cd backend && npx tsx scripts/initDb.ts
```

Run both dev servers (in separate terminals, from the repo root):
```bash
npm run dev:backend    # http://localhost:8000
npm run dev:frontend   # http://localhost:5173
```

## Project structure

```
backend/src/
  agents/       Anna, Rico, Sammy, Ciri (the critic), the shared LLM client and prompt text
  pipeline/     orchestration — ties the agents together for a daily/weekly run
  data/         Google Ads ingestion, Postgres access, demo-mode data generation
  reporting/    read-side queries and content formatting for the frontend + email
  platform/     cross-cutting infra — config, settings, email transport, event bus, timezone
  api/          the Express app — main.ts wires it up, routes/ holds one file per resource

frontend/src/
  app/          the app shell — top bar, live console panel, router (not a feature)
  features/     one folder per page — dashboard/, reports/, settings/, learning/, etc.
  shared/       cross-feature code — the report viewer (used by both Dashboard and Reports),
                generic UI primitives, the API client, composables, and utils
```

`backend/scripts/` holds one-off/cron entry points (`initDb.ts`, `runDaily.ts`, `backupDb.ts`, `generateRefreshToken.ts`) — see [`backend/deploy/README.md`](./backend/deploy/README.md) for production setup (crontab, VPS deploy steps).

## Digging deeper

- [`PROJECT.md`](./PROJECT.md) — the full design doc: architecture decisions, the agent pipeline, cost guardrails, deployment plan, known gaps.
- [`agents/*.md`](./agents/) — one spec per AI agent (model choice, prompt design, guardrails).
- [`research.md`](./research.md), [`dummy.md`](./dummy.md) — supporting research and the demo dataset's design notes.
