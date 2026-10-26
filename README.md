# Pitstop

An AI performance dashboard for Google Ads. A small team of LLM agents
reads an account's stored performance data and writes the analysis. It
turns that into recommendations and summarises the result. A fourth agent,
the critic, reviews every output before anyone sees it.

![Dashboard overview](docs/images/dashboard-overview.webp)

- **Live demo:** https://gads.my.id. It runs in demo mode on synthetic
  data, and a read-only account is available on request.
- **Status:** built from August to October 2026 and ran unattended on a
  daily schedule. Paused since October 2026.

## Why it exists

Google Ads' own Recommendations tab leans towards spending more. Its
Optimization Score only rises when you accept changes that expand spend,
whatever they do to cost per lead. Pitstop gives the owner of a small
account an analysis that isn't selling anything. It shows what changed,
why, and what to do about it, with the evidence attached.

## How it works

```
Google Ads data ──► Postgres ──► Anna (analysis) ──► Rico (recommendations) ──► Sammy (summary)
  (or demo data)                    ▲                    ▲                         ▲
                                    └──── Ciri, the critic: approve / revise / flag ┘
```

- **Data layer.** It stores a trailing window of account data in
  Postgres, so trends come from history rather than live snapshots. Facts
  like rankings, totals and impression-share splits are computed in SQL
  and handed to the agents as facts. Models are worst at arithmetic over
  tables.
- **The critic.** Ciri reviews each agent's output against what that agent
  was actually given, and can send it back for revision, at most twice.
  **Code decides approval, not the model:** each issue carries a severity,
  and an output passes only if there are no high-severity issues.
- **Every claim can be traced.** Each report section has a "why" trail:
  draft, critique, revision.
- **The Run Inspector** records every run as a nested trace: the data it
  read, every model call with its full prompt and response, each critic
  review, and the decision that followed.
- **A keyword optimizer** turns keyword and search-term data into ranked
  suggestions: negatives, pauses, match-type changes and new keywords.
  - The ranking engine is deterministic and tested against planted
    problems with known answers.
  - Ad copy is built from templates and checked in code: length limits,
    and only claims the account can back up.
- **A learning loop.** A weekly job reads recurring patterns in the
  critic's reviews and drafts prompt changes. They are never applied
  automatically.

## Running it unattended

The project is as much about operating agents as building them:

- **A monthly spend ceiling.** The pipeline refuses to start a run once
  the month's tracked AI cost passes the cap. It doesn't just alert
  afterwards.
- **A dead-man's switch.** It catches the schedule itself going quiet, not
  only runs that fail.
- **Loud failures.** An empty model response retries with a larger budget,
  then fails the run and sends an alert. It is never saved as a blank
  draft.
- **Recovery.** Daily backups with retention, and automatic recovery from
  a run orphaned by a crash.
- **Read-only demo access is enforced on the server.** A demo login gets
  a 403 on anything but a read; the buttons aren't just hidden.

## What's real and what isn't

- **Real:** the agent pipeline, the critic loop and its grading, cost
  tracking, the Run Inspector and the operations tooling. They ran on a
  schedule, making live model calls.
- **Synthetic:** the ad data. A seeded generator produces an account with
  deliberate patterns for the agents to find: a declining campaign, a
  seasonal spike and an outperforming segment. The UI labels it.
- **Built but not used on a real account:** the live Google Ads path. It
  reaches the API correctly, but the developer token was never approved
  beyond test access.
- **Single-user:** one owner login plus an optional read-only demo login.
  No multi-tenancy.

The full write-up, with what went wrong and what changed, is in
[docs/case-study.md](docs/case-study.md).

## Run it locally

You need Node.js 20+ and a Postgres database. Without Google Ads or model
credentials it runs in demo mode (`DATA_SOURCE=demo`).

```bash
npm install                                          # backend and frontend (npm workspaces)
cp .env.example .env                                 # database URL, AUTH_USERNAME / AUTH_PASSWORD
cp frontend/.env.local.example frontend/.env.local
cd backend && npx tsx scripts/initDb.ts && cd ..     # create the schema (safe to re-run)
npm run dev:backend                                  # API on :8000
npm run dev:frontend                                 # UI on :5173
```

Running a pipeline makes paid model calls, so it needs a model API key in
`.env`. It uses Sumopod, an OpenAI-compatible gateway, by default. To call
OpenAI directly instead, set `SUMOPOD_BASE_URL=https://api.openai.com/v1`
and put an OpenAI key in `sumopod-api-key`. No code changes are needed. To look at the UI with no backend and no keys, run
`npm run mock-api -w frontend`, which serves test data on `:8000`.

## Tests

```bash
npm run test:backend     # Vitest
npm run test:frontend    # renders the real pages against a mocked API
```

The backend tests focus on the logic where a silent bug would matter
most: the critic's approval decision, secret redaction, the spend
ceiling, and the keyword optimizer's ranking.

## Layout

```
backend/src/    agents/ · pipeline/ · data/ (ingestion, demo generator) · reporting/ · platform/ (config, auth, tracing, redaction) · api/
frontend/src/   app/ (shell) · features/ (one folder per page) · shared/
agents/         one spec per agent: model choice, prompt design, guardrails
docs/           case study and screenshots
PROJECT.md      the design doc: decisions, pipeline, cost guardrails, known gaps
```

## Stack

TypeScript throughout. Node and Express on the backend, with Postgres and
the official OpenAI SDK, pointed at Sumopod or any OpenAI-compatible
endpoint. Vue 3, Vite and Tailwind on the frontend.
