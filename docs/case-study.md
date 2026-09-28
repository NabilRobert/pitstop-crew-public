# Pitstop — case study

An AI performance dashboard for Google Ads. A small team of LLM agents reads the account's stored performance data, writes an analysis, turns it into recommendations, and summarises the result. A fourth agent, the critic, grades every output before anyone sees it. This is a write-up of what was built and what was learned along the way, including the parts that didn't work at first.

**Live demo:** https://gads.my.id (demo mode — see "What is and isn't real" below)
**Code:** this repo. Design rationale is in [`PROJECT.md`](../PROJECT.md), per-agent specs in [`agents/`](../agents/).

<!-- SCREENSHOT: dashboard overview -->
<!-- SCREENSHOT: report with the "Why this?" trail open -->
<!-- SCREENSHOT: Learning page grade-trend chart -->

## The problem

Google Ads' own Recommendations tab is structurally biased toward spending more: its Optimization Score is only maximised by accepting spend-expanding changes, whatever they do to cost per lead. Most people who run ads also don't want to open the Ads UI to find out how yesterday went. Pitstop is the opposite: fetched on a schedule, presented at a glance, and its recommendations are graded by a critic that is specifically hunting for overconfident claims. Everything the AI produces is a suggestion. Nothing in the system can change a bid, budget or targeting.

## What it does

- **Data layer ("Damon").** Pulls a trailing window from the Google Ads API (or generates it, in demo mode) into Postgres, so trends are computed from history rather than live snapshots.
- **Agents.** Anna analyses, Rico recommends, Sammy summarises. Ciri, the critic, reviews each one and can send it back for revision, capped at two revisions per output.
- **A "why" trail** on every report section: the full draft → critique → revision history, so the critic loop is visible rather than just a status pill.
- **Ask.** Rico and Sammy can be queried on demand, answered against the same data the report used.
- **A weekly feedback job** that reads recurring patterns in Ciri's critiques and drafts a prompt patch. It is never applied automatically; a person reviews it.
- **Operations.** Scheduled runs, failure alerts by email, a dead-man's-switch for when the schedule itself doesn't fire, a live console of what the pipeline is doing, and a System Health page.
- **Coverage.** Campaigns, ad groups, keywords with Quality Score, search terms, ads, impression share and why it's lost, named conversion actions, Performance Max asset groups, Google's own recommendations, change history, and demographic segments. This is a deliberate subset of the API, chosen so each piece feeds the agents something they can reason about.

## Decisions worth explaining

**The critic decides approval in code, not in the model's head.** Early on, approval followed whatever the model said about whether it had found issues. Now each issue carries a severity, and code decides: approved only if there is no high-severity issue and the grade is A, B or C. A D or F always blocks. A malformed or missing severity is treated as high, so a bad response fails safe into a revision rather than through. Medium and low issues don't block, so an output can be *approved with notes*; the UI says so instead of showing a plain "approved".

**Revisions edit; they don't rewrite.** A revision now receives the previous draft plus the critic's structured issues and is told to fix those. Before that, revisions regenerated from scratch, which cost more and could lose things that were already right.

**Each agent is graded against what it was actually given.** Rico is graded against Anna's text, Sammy against Anna and Rico — not against the raw data neither of them saw. Grading Rico for "unsupported" claims that Anna had already made was penalising the wrong agent.

**Facts are computed in SQL, not by the model.** Rankings, per-action totals and budget-lost vs rank-lost impression share are pre-computed and handed to Anna as facts. Models are worst at arithmetic over tables, so they don't do it.

**Failure is loud.** An empty model response used to be persisted as a blank draft. Now it retries with a larger token budget, and if the first draft is still empty the run fails and alerts. A blank revision keeps the previous draft, flagged.

## What went wrong, and what it taught me

**The flag-rate chart couldn't move.** The original Learning page charted "share of outputs Ciri flagged". It sat near 33% regardless of quality, because it counted every draft and revision, so the arithmetic of a critic that blocks the first draft and passes the second pins the ratio. It looked like a metric and measured the loop's shape. I replaced it with a chart over final outputs only, banded into approved clean / approved with notes / flagged / no review, plus two overlapping quality lines (grade C or worse, high-severity issue). It marks the deploy dates of the changes that break comparability, and carries a written caveat: approval got easier to earn under the severity rule, so more approvals is not by itself proof the reports got better.

**Cost was invisible until it hurt.** The pipeline was quietly making about 18 model calls per run. I added per-run usage tracking, which showed where the calls went, and cut it to roughly 6–7 calls per run by fixing the revision loop and the grading inputs. I also turned scheduled reports off while I worked, because unattended runs on the expensive tier add up. Cost figures use placeholder per-token rates unless real ones are configured, so treat the dollar numbers as estimates.

**A silent pipeline is worse than a broken one.** Scheduled runs had stopped for days before I noticed. The cause turned out to be my own switch, but the takeaway stands: the dead-man's-switch and health page exist because "nothing happened" is the failure mode that alerts don't catch.

## What is and isn't real

- The demo runs on **generated data**: a seeded Markov-chain generator with deliberate patterns (a declining campaign, a seasonal spike, an outperforming segment), so the agents have something real to find. The UI labels this.
- The **live Google Ads path is built but not exercised against a real account**: the developer token is at test-account access level, awaiting Basic Access review. Live calls reach Google correctly and stop at `DEVELOPER_TOKEN_NOT_APPROVED`.
- The **AI pipeline, the critic loop, the grading and the operations tooling are real** and run against the generated data with live model calls.
- It is a single-user tool. Auth is one login; there is no multi-tenancy.

## What I'd do next

- Get Basic Access approved and run one real account through the same pipeline.
- Log every step the agents take as a structured trace, so a run can be inspected end to end rather than only through the live console.
- Track what happens to a recommendation after it's shown (acted on, ignored, outcome), so the critic can be checked against results and not only against itself.
- Alerts to Slack/Discord, and thresholds so a report is only pushed when something moved.

## Stack

Vue 3, Vite, Tailwind v4, Chart.js (frontend, Vercel) · Node, TypeScript, Express (backend, VPS) · Postgres · OpenAI-compatible model gateway · Resend for email.
