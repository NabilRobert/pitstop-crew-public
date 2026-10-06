# Pitstop — Google Ads AI Performance Dashboard

Pulls performance data from a Google Ads account, stores it over time, and runs it through a small team of AI agents (Anna, Rico, Sammy) that analyze it, recommend action, and summarize the result — daily and weekly, automatically. A fourth agent, Ciri the critic, grades every output against a strict rubric before anyone sees it; approval is decided in code from the grade and each issue's severity, not from the model's own opinion of itself, and a flagged output goes back for a bounded revision pass. Every recommendation is a suggestion, never an applied change. See [`PROJECT.md`](./PROJECT.md) for the full design rationale, [`docs/case-study.md`](./docs/case-study.md) for a narrative write-up with screenshots, and the app's own **How It Works** and **Engineering Notes** pages for a guided walkthrough once it's running.

`backend/` and `frontend/` are two fully separate deployable units, talking only over the REST API on `:8000` — there's no shared runtime or merged build. This repo just makes it convenient to install and run both from one place during development.

## Beyond the core pipeline

- **A Run Inspector** records every step of a pipeline run as a nested trace — the data it read, each agent, every model call with its full prompt and response, each critic review, and the approve/revise/flag decision that followed — with per-step tokens and cost, live while a run is in flight.
- **A keyword optimizer** runs weekly as its own agent in the same pipeline and produces ranked, evidence-backed suggestions: negative keywords, search terms worth promoting, keywords to pause, match-type changes, new keywords and campaign ideas, each tied to the dealer's stock. Code finds the candidates and computes every number; the model only ranks and explains them, and the critic grades the result. Suggestions only, with a paste-ready negatives export; the owner marks each applied or dismissed. See [`overhaul-v3.md`](./overhaul-v3.md) for the scope and API contract, plus [`overhaul-v3-backend.md`](./overhaul-v3-backend.md) and [`overhaul-v3-frontend.md`](./overhaul-v3-frontend.md) for the implementation plans.
- **A third color theme, Atom-Eve** (a bold pop-art pink with black type), alongside Ferrari and Blueprint; Ferrari stays the default.
- **A Learning page** tracks Ciri's verdicts over time (approved clean / approved with notes / flagged / no review, by week and agent) and the weekly self-improvement job's suggestion history — never auto-applied, always reviewed by hand.
- **Auth gates the whole app**: a full-access owner login, plus an optional read-only demo account (enforced server-side — a demo token gets a 403 on anything but GET, not just hidden buttons) for sharing a public link without risking real changes or model spend.
- **A monthly spend ceiling** (Settings page) will actually refuse to start a new pipeline run once the month's tracked AI cost passes the configured cap, not just alert after the fact.
- **Operational guardrails**: a dead-man's-switch that catches the schedule itself silently going quiet (not just a failed run), daily backups with retention, and automatic recovery from an orphaned run after a crash.
- **Regression tests** (`backend`, `npm test`) on the logic where a silent bug would matter most — the critic's approval decision, secret redaction, and the spend ceiling.

## Quickstart

**Prerequisites:** Node.js 20+, a Postgres database (hosted, not local — see below), and API credentials for Google Ads + an LLM gateway if you want live data (demo mode works with none of that).

```bash
npm install                    # installs both backend/ and frontend/ (npm workspaces)
cp .env.example .env           # fill in DB connection string, API keys — see comments in the file
cp frontend/.env.local.example frontend/.env.local   # points the frontend dev server at :8000
```

Set a login — the app has no default credentials, nothing loads without one:
```bash
# in .env
AUTH_USERNAME=whatever-you-want
AUTH_PASSWORD=a-real-password
# optional: a second, read-only account for sharing a public demo link
DEMO_USERNAME=
DEMO_PASSWORD=
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

Run the backend's test suite:
```bash
npm run test:backend
```

## Project structure

```
backend/src/
  agents/       Anna, Rico, Sammy, Ciri (the critic), the shared LLM client and prompt text
  pipeline/     orchestration — ties the agents together for a daily/weekly run
  data/         Google Ads ingestion, Postgres access, demo-mode data generation
  reporting/    read-side queries and content formatting for the frontend + email
  platform/     cross-cutting infra — config, settings, auth, email transport, event bus,
                redaction, structured run tracing (the Run Inspector's writer), timezone
  api/          the Express app — main.ts wires it up, routes/ holds one file per resource

frontend/src/
  app/          the app shell — top bar, login, live console panel, router (not a feature)
  features/     one folder per page — dashboard/, reports/, learning/, run-inspector/,
                keyword-optimizer/, engineering-notes/, settings/, etc.
  shared/       cross-feature code — the report viewer (used by both Dashboard and Reports),
                generic UI primitives, the API client, composables, and utils

docs/
  case-study.md   narrative write-up of the project, with screenshots
  images/         the screenshots that write-up embeds
```

`backend/scripts/` holds one-off/cron entry points (`initDb.ts`, `runDaily.ts`, `backupDb.ts`, `generateRefreshToken.ts`) — see [`backend/deploy/README.md`](./backend/deploy/README.md) for production setup (crontab, VPS deploy steps).

## Digging deeper

- [`PROJECT.md`](./PROJECT.md) — the full design doc: architecture decisions, the agent pipeline, cost guardrails, deployment plan, known gaps.
- [`docs/case-study.md`](./docs/case-study.md) — a narrative case study with screenshots: what was built, what didn't work at first, and what's real vs. simulated.
- The app's own **Engineering Notes** page (`/engineering-notes` once running) — the non-obvious engineering decisions: the critic's approval-in-code trust model, the cost work (including a caching claim that was wrong on first read and corrected against real data), and the access-control and operational posture.
- [`agents/*.md`](./agents/) — one spec per AI agent (model choice, prompt design, guardrails).
- [`research.md`](./research.md), [`dummy.md`](./dummy.md) — supporting research and the demo dataset's design notes.
