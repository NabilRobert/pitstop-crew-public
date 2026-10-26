# Phase 2: Requirements & Constraints

**Time budget: as fast as possible** (Arthur, 2026-10-26). Planning stays
short. Phases 3 and 4 are folded into this doc and Phase 5, and the build
goes in three slices.

## Core scenario

1. A reviewer opens the repo. The README says what Pitstop is, what's real
   and what's synthetic, and links to the case study.
2. The case study gives reliability, cost and critic numbers for the
   operating period, plus three failures traced from symptom to fix to
   measured result. Each number links to the query that produced it.
3. The reviewer asks for the demo login, which is given on request
   (decided 2026-10-26). They browse the real run history: runs, traces,
   the critic's verdicts and reports, all on synthetic ad data.
4. Nothing they do can spend money.

## Requirements

**Evidence**
- **E1.** Analysis queries are plain SQL files in the repo, one per
  question, so a reviewer can read exactly what was counted.
- **E2.** One command restores the 2026-10-26 backup into a local
  throwaway Postgres, runs every query, and writes the results to
  `docs/evidence/`. The results are committed.
- **E3.** The case study quotes only numbers from `docs/evidence/`. If a
  number can't be computed from the records (for example, calls per run
  before tracing began on 2026-09-28), the case study says so instead of
  estimating.
- **E4.** Each written-up failure names the commit that fixed it. The
  repo's own history is the source for "what changed".

**Demo**
- **D1.** Hosted on the server that runs Projects 1 and 2, under a new
  domain (`<demo-domain>` until Arthur supplies it).
- **D2.** The demo server holds **no paid API keys**: no model gateway, no
  Google Ads, no voice and no email. With no keys present, a model call
  can't happen even if something is misconfigured.
- **D3.** No scheduled jobs are installed: no cron, no daily run, no
  optimizer, no backups to anywhere paid.
- **D4.** A test shows that every route the demo account can reach is a
  read that makes no model call, and that writes are refused with a 403.
  Part of this already exists in `authMiddleware.ts`.
- **D5.** The demo data is the backup, cleaned first. Removed: email
  addresses, the report recipient, owner settings, credentials and
  anything personal in the "ask" logs. The cleaning script lists what it
  changes, and it runs before the data reaches the server.
- **D6.** The demo shows the synthetic-data label, as it does today.

**Docs**
- **W1.** `docs/case-study.md` rewritten around the measured numbers. The
  README links to it and stays short.
- **W2.** A JOURNEY log of what broke and what was wrong while doing this
  project.

## Non-functional

- **Zero spend, verified.** Checked as D2, D3 and D4, not assumed.
- **Small footprint** on a server shared with MCP-backbone and the harness:
  memory and CPU are capped, and Pitstop gets its own database and login,
  separate from MCP-backbone's.
- **Secrets:** a new owner password for the demo server. Nothing reused
  from the old one.
- **A reviewer gets it in about 15 minutes** (Phase 1, metric 7).

## Constraints

- **$0 model budget.** No pipeline runs.
- **Server work goes through Arthur or the server's Claude session.**
  Arthur pushes code and runs anything a safety check blocks.
- **The old server and its database may lapse at any time.** The backup
  is the source of truth, so nothing depends on the old server staying up.
- **No CI and no LICENSE in the repo yet.** As it stands, it's public but
  "all rights reserved".
- **The tests haven't been run in this clone yet.** They need checking
  before the case study cites them.

## Must / Should / Could

| | Item |
|---|---|
| **Must** | E1–E4: queries, a one-command runner, committed results, failures tied to commits |
| **Must** | W1: the case study rewritten on measured numbers |
| **Must** | D1–D6: the demo moved, with no keys, no schedules, the demo-route test, cleaned data and the label |
| **Must** | The existing tests pass in this clone, or are fixed |
| **Should** | CI (GitHub Actions) running the backend and frontend tests |
| **Should** | A cleaned export of the run metadata (runs, outputs without content, traces without payloads), so anyone can rerun the queries without the private dump |
| **Should** | W2: JOURNEY |
| **Could** | A LICENSE file (Arthur's call) |
| **Could** | Fresh screenshots from the moved demo |
| **Won't** | New pipeline runs, a real Google Ads account, new features |

## Rough effort

About 2–3 days in total:
- evidence (E1–E4): half a day;
- case study (W1): half a day to a day;
- the demo move (D1–D6): a day, mostly waiting on server steps.
