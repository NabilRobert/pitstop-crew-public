# Phase 1: Problem Brief

**Project:** a case study of Pitstop, an LLM agent pipeline that ran
unattended on a schedule from August to October 2026. It has three parts:
- this public repo;
- a write-up whose every number comes from the pipeline's own records;
- a read-only demo.

It is the third of three portfolio pieces. The first is
[MCP-backbone](https://github.com/NabilRobert/MCP-backbone), a database
MCP server. The second is
[agent-eval-harness](https://github.com/NabilRobert/agent-eval-harness),
which measures whether an agent works. Like those two, it should prove its
claims rather than state them.

## Problem

Most agent projects can't show what happened once the demo ended:
- how often the scheduled runs worked;
- what each run cost;
- what broke, and how it was found;
- whether a fix actually helped.

The first two projects measure agents in controlled runs. This one has to
show an agent system *in operation*, which is harder to fake.

Pitstop has the raw material. It ran on a daily schedule for about 11 weeks
and recorded:
- every run's status and cost;
- every agent output and critic verdict;
- from 2026-09-28 onwards, a full trace of every model call (62 runs).

Its existing write-up (`docs/case-study.md`) tells the story well, but has
three problems:
- **Its numbers are approximate and untraceable.** For example, "about 18
  model calls per run, cut to about 6". A reader has no way to check them.
- **The data is synthetic.** The case study says so honestly, but that
  makes the operational evidence (runs, cost, failures) the part that has
  to carry the weight.
- **The demo may disappear.** It is paused and runs on a server whose
  account no longer has credit.

## Affected parties

| Party | Wants |
|---|---|
| Arthur (builder) | Evidence that he can run agents unattended and debug them, defensible in an interview |
| Reviewer / AI engineering team | Proof beyond a demo: reliability, cost, failure modes and measured fixes, from a real running system |
| Someone running agents unattended | Patterns they can reuse: approval decided in code, a spend ceiling, a dead-man's switch, full run traces |

## How it's handled today, and where it breaks

- **The narrative case study** is honest about what's real, but its numbers
  are rounded recollections, not queries anyone can rerun.
- **Screenshots** show the features, not how the system behaved over time.
- **The demo** needs a login, and it sits on a server that is about to
  lapse. When that server goes, the only interactive evidence goes with it.
- **The run history** exists only in a hosted database the reader can't
  see. A backup was taken on 2026-10-26 and verified by restoring it.

## Success metrics (verifiable, from records only)

1. **Every number in the write-up is computed by a committed script.**
   - The script runs against a local restore of the 2026-10-26 backup.
   - Its output is committed next to it.
   - No figure in the write-up is typed by hand.
2. **Reliability over the operating period**, from `pipeline_runs`:
   - runs by type and outcome;
   - each failure with its recorded cause;
   - gaps in the schedule, which are what the dead-man's switch exists to
     catch.
3. **Cost**, from `pipeline_runs.cost_usd_micros` and the token counts in
   the traces:
   - cost per run, by run type;
   - the calls-per-run change, confirmed or corrected from the traces.
     Where tracing doesn't cover a period, the write-up says so instead of
     estimating.
4. **The critic's behaviour**, from `ai_outputs`:
   - outcomes per agent and over time (approved, revised, flagged);
   - grades and revision counts;
   - the "flag rate couldn't move" lesson, shown with the data.
5. **At least three failure modes written up in full:** symptom, how it was
   found, cause, the fixing commit in this repo's history, and the measured
   result afterwards.
6. **A read-only demo on the same server as Projects 1 and 2**, with:
   - zero model spend, verified;
   - scheduled jobs off;
   - a test showing no route reachable by the demo account makes a model
     call (Ask, for example, would);
   - the synthetic data still labelled in the UI.
7. **A reviewer understands the system and the evidence from the README
   and the case study in about 15 minutes.**

## Non-goals (current pass; revise as planning continues)

- **No new pipeline runs.** The budget for model calls is $0, so the
  evidence is the 11 weeks already recorded. New runs happen only if Arthur
  funds them and approves each one.
- **No claims about ad performance.** The ad data is synthetic, so nothing
  here says Pitstop improved an account.
- **No new Pitstop features**, beyond what hosting the demo safely needs.
- **No raw database in the repo.** Only the aggregates the scripts produce
  are published; the dump stays private.
- **No multi-tenancy, and no public way to make it spend money.**
- **No naming of employers or clients.** The pause is stated as a fact,
  without reasons.

## Decisions (settled 2026-10-25/26)

1. **Subject:** Pitstop, which is Arthur's own system. A related
   production system he worked on isn't covered.
2. **Repo:** this public repo (`pitstop-crew-public`) with its full
   history. The history was scanned for secrets and personal data before
   publishing, and nothing needed rewriting.
3. **Evidence source:** the 2026-10-26 database backup, analysed on a local
   restore. The analysis never touches the live database.
4. **Hosting:** the demo moves to the server that runs Projects 1 and 2, as
   a read-only demo with its schedules switched off. It gets a new domain,
   which Arthur will supply; the old address isn't used. Until then, docs
   say `<demo-domain>`. *(Supplied 2026-10-26: `pitcrew-public.my.id`.)*
5. **Budget:** $0 for model calls.
6. **Format:**
   - the README;
   - `docs/case-study.md`, rewritten around the measured numbers;
   - the analysis scripts and their outputs;
   - these planning docs;
   - a JOURNEY log of what broke and what was wrong.

## Open questions (for Phase 2)

- **Should the read-only demo login be published,** or given on request?
  Publishing it is safe only once metric 6 holds: no model calls are
  reachable.
- **Time budget** for this project.

## Cost of doing nothing

The portfolio's "real system in operation" piece rests on a narrative with
rounded numbers, and its demo disappears when the old server lapses. The
operational evidence, the part a reviewer can't get from any demo, stays
locked in a private database.
