# Evaluation against the plan

Checked on 2026-10-26 against the success metrics in
[Phase 1](phase-1-problem-brief.md) and the Must/Should/Could list in
[Phase 2](phase-2-requirements-constraints.md). A metric counts as met only
when it was checked, not because the work was done.

## Phase 1 success metrics

| # | Metric | Status | How it was checked |
|---|---|---|---|
| 1 | Every number in the write-up comes from a committed script | **Met** | See below |
| 2 | Reliability over the operating period | **Met** | Runs by type and outcome ([01](../evidence/01-runs-by-type.csv), [02](../evidence/02-runs-by-week.csv)); every failure with its cause ([03](../evidence/03-failures.csv)); gaps in the schedule ([04](../evidence/04-daily-schedule-gaps.csv)) |
| 3 | Cost per run, and the calls-per-run change confirmed or corrected | **Met** | Cost by run type ([05](../evidence/05-cost-per-run.csv)). Calls per run measured for the traced period: 7.3, correcting "about 6" ([06](../evidence/06-model-calls-per-run.csv)). "About 18 before" predates tracing, and the case study says it's unverified |
| 4 | The critic's behaviour over time | **Met** | Final outcomes, grades, revisions, the flag rate counted two ways, and before/after the approval change ([07](../evidence/07-critic-final-outcomes-by-month.csv)–[11](../evidence/11-critic-before-after-severity.csv)) |
| 5 | At least three failure modes, each with symptom, how it was found, cause, fixing commit and measured result | **Mostly met** | See below |
| 6 | A read-only demo on the same server, zero model spend, verified | **Pending deploy** | See below |
| 7 | A reviewer gets it in about 15 minutes | **Unverified** | See below |

**Metric 1: how it was checked.**
- Every figure in `docs/case-study.md` was extracted and matched against
  the values in `docs/evidence/`.
- Every one was found, with three kinds of exception, all accounted for:
  - dates written as words, which match ISO dates in the evidence;
  - link labels, which aren't numbers;
  - one deliberately unverified recollection ("about 18 calls"), labelled
    as such in the text.
- The sweep found five totals that had been summed by hand. They now come
  from [13](../evidence/13-headline-totals.csv), and they matched.
- `evidence/run.sh` rebuilds every file byte for byte (run twice).
- CI checks that every query has its result and every evidence link in the
  case study resolves.

**Metric 5: what's met and what isn't.** Three failure modes are traced to
their fixing commits, each with a measured result:

| Failure | Fixing commit | Evidence |
|---|---|---|
| The flag-rate chart couldn't move | `cdd56b3` | [10](../evidence/10-flag-rate-two-ways.csv) |
| The approval rule approved almost nothing | `42a8710`, with the date confirmed from the data | [11](../evidence/11-critic-before-after-severity.csv) |
| Blank drafts saved as content | `543af98`, `f8b9e9c` | [12](../evidence/12-blank-drafts.csv) |

The gap: **"how it was found" is implied by each symptom rather than
stated.** Only Arthur knows how each one was actually noticed.

**Metric 6: what's verified, and what isn't yet.**
- **Built and verified locally:**
  - `deploy/demo/verify.py` calls all 55 routes with the demo login. Every
    write gets a 403, and no read reaches a model.
  - It confirms the API container holds no paid-service variables and
    runs only the API.
  - It was shown to fail with a key added and with the owner login.
  - The data-cleaning checks were each shown to fail with their cleaning
    step removed.
  - The UI shows the read-only and demo-mode labels.
- **Not done yet:** the server deploy. The domain, `pitcrew-public.my.id`,
  was supplied on 2026-10-26 and didn't resolve yet when checked. This row
  is re-checked after the deploy, with `verify.py` run on the server.

**Metric 7: why it's unverified.** The README is 992 words and the case
study 1,762, about 4 and 7 minutes of reading. That fits the budget, but
whether a reviewer *understands* it in 15 minutes can only be tested by a
cold reader. It hasn't been.

## Phase 2: Must / Should / Could

| | Item | Status |
|---|---|---|
| Must | E1–E4: queries, one-command runner, committed results, failures tied to commits | Done |
| Must | W1: the case study rewritten on measured numbers | Done |
| Must | D1: hosted on the server | **Pending deploy** |
| Must | D2–D6: no keys, no schedules, the demo-route test, cleaned data, the synthetic label | Done and verified locally |
| Must | The existing tests pass in this clone | Done. They didn't at first (17 of 22 frontend checks failed, and the typecheck crashed); fixed |
| Should | CI | Done: tests, typecheck, builds, evidence completeness, demo images |
| Should | A cleaned export of run metadata, so others can rerun the queries | **Not done.** The queries can be read but not rerun by anyone without the private snapshot |
| Should | W2: JOURNEY | Done |
| Could | A LICENSE | Arthur's decision; none yet ("all rights reserved") |
| Could | Fresh screenshots from the moved demo | Not done; waits for the deploy |
| Won't | New pipeline runs | Respected: no model calls were made in this project |

## Known limits, as published

- **The ad data is synthetic.** Nothing here measures ad performance.
- **Recorded cost is a floor:** cost was recorded for only 7 of the 68
  daily runs.
- **Traces cover only runs from 2026-09-28.**
- **The snapshot is private**, so the evidence can be read and audited but
  not regenerated by others (the Should item above).
- **Single user,** with a read-only demo login given on request.

## What's left

1. **Deploy the demo**, then re-check metric 6 on the server
   (`verify.py`, then `/api/health` from outside).
2. **A cold read** for metric 7.
3. **The Should and Could items above**, if wanted:
   - the metadata export;
   - screenshots;
   - a LICENSE.
