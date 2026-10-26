# Evidence

Every number in the case study comes from a file in this folder. Each file
is the output of one plain SQL query in
[`evidence/queries/`](../../evidence/queries/), run against a single frozen
snapshot of Pitstop's database. The snapshot was taken on 2026-10-26, and
its SHA-256 is in [`SNAPSHOT`](SNAPSHOT).

To rebuild every file:

```bash
evidence/run.sh path/to/pitstop-2026-10-26.dump
```

The script restores the dump into a throwaway Postgres container, runs
each query in UTC+7 (the account's time zone), and rewrites this folder.
Two runs produce byte-identical output. The dump itself isn't published:
it holds full prompts, responses and settings. The queries are here so
anyone can see exactly what was counted.

## What each file answers

| File | Question |
|---|---|
| `01-runs-by-type.csv` | How many runs of each kind, how they ended, over which dates, at what recorded cost |
| `02-runs-by-week.csv` | Runs per week, so gaps in the schedule show |
| `03-failures.csv` | Every run that didn't fully succeed, and why, as a cause category |
| `04-daily-schedule-gaps.csv` | Every gap of more than a day between daily-pipeline runs |
| `05-cost-per-run.csv` | Cost per run by type, from each run's own record |
| `06-model-calls-per-run.csv` | Model calls and tokens per run, from the Run Inspector's traces |
| `07-critic-final-outcomes-by-month.csv` | Whether each output's final version was approved or flagged by the critic |
| `08-critic-grades-by-month.csv` | The critic's letter grades over time |
| `09-revisions-per-output.csv` | How many revisions each output went through (the maximum is two) |
| `10-flag-rate-two-ways.csv` | The flag rate counted over every draft vs. over final versions only |
| `11-critic-before-after-severity.csv` | Final outcomes before and after severity-based approval went live (date taken from the data) |
| `12-blank-drafts.csv` | Outputs saved with empty content, by month |
| `13-headline-totals.csv` | The totals the case study quotes that span several rows elsewhere, so none is added up by hand |
| `14-critic-before-after-same-agents.csv` | File 11 restricted to the three report agents, so before and after compare the same kinds of output |
| `15-schedule-switches.csv` | The app's schedule switches in the snapshot: reports off, keyword optimizer on |

## Read these with the caveats

- **The ad data is synthetic.** These files measure how the pipeline
  behaved: runs, cost, failures, the critic. They measure nothing about ad
  performance.
- **"Daily" is a pipeline type, not a count of scheduled days.** It
  includes runs started by hand while developing. For example, the week of
  2026-08-10 has 25.
- **Cost was recorded only once tracking existed.** 7 of the 68 daily
  runs and 20 of the 23 keyword-optimizer runs have a cost.
  `recorded_cost_usd` is a floor, not the full spend.
- **Traces start on 2026-09-28.** Calls per run before that date can't be
  measured from the records.
- **Failure causes are categories.** `03-failures.sql` maps each recorded
  message to a category; the mapping is the whole classification. Raw
  messages aren't published, because some carry provider account and
  trace IDs.
- **Grades and approvals count different things.** A grade is given on
  every review, including first drafts that were sent back. Approval is
  decided in code for the final version: no high-severity issue, and a
  grade of A, B or C. So October can have mostly D grades (on drafts) and
  more approvals (on final versions).
