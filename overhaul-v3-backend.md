# Overhaul v3: Keyword optimizer. BACKEND

**Status (2026-10-07):** steps 1-8 and contract 3.1-3.4 are built and live on the VPS, with the model steps tested only with stubs (no real Kai or Ciri run yet, blocked on credits). Companion to `overhaul-v3.md` (scope and API contract). Sections 11.6 and the "As built" notes in 11.7 were written by the backend session and merged here.

---

## 0. How to use this file (read first)

You are implementing **only the backend** of Overhaul v3. You need **two files**: this one and `overhaul-v3.md` (the scope doc). Read the scope doc first. Its sections 1-5 (goal, decisions, phasing, the current code, API feasibility) and 13 (the API contract) are binding and live only there. Section numbers are global across the files.

- **Do not touch `frontend/`.** Another file covers it. Do not touch `.env` (the `INVENTORY_DB_STRING` line already exists, empty).
- **The API contract (scope doc section 13, version 3.4) is binding.** Match field names, nullability and status codes exactly. If the codebase or the data makes it impossible, **stop and report it**; do not improvise a different shape.
- **Work one build step at a time** (section 17 below). After each step, report what changed, how you verified it, and anything unexpected, then wait.
- **Deliver full file contents** for every changed or new file (there is no git access on your side; the owner commits first, then you commit your copy). List the files per step.
- **Verify, don't assume.** Every **VERIFY** item is unconfirmed. Resolve each before building on it and report the answer. **STARTING DEFAULT** items are tunable, not rules.
- Run `npm run test:backend` (vitest) and `npx tsc --noEmit` in `backend/` before reporting a step done. Add tests for the pure logic as described in section 12.
- Never log, return or persist the inventory connection string. Never build SQL from keyword text or model output.
- If a step changes an existing prompt (for example Anna's), say so, and run a normal pipeline run afterwards to confirm Ciri's grades do not regress.
- The open questions are in scope doc section 19. Do not guess them.

---
## 6. Data model (`schema.sql`)

All additions follow the existing idempotent pattern. Use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, and `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` for CHECK widening (see how `run_type` was widened). Money in micros; every API-mirroring table gets a nullable `google_*_id`.

**Existing tables, new columns**

```sql
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS cpc_bid_micros BIGINT;            -- NULL = automated bidding / unknown
ALTER TABLE keyword_performance ADD COLUMN IF NOT EXISTS search_impression_share REAL;
ALTER TABLE keyword_performance ADD COLUMN IF NOT EXISTS search_rank_lost_impression_share REAL;
ALTER TABLE keyword_performance ADD COLUMN IF NOT EXISTS conversions_value_micros BIGINT NOT NULL DEFAULT 0;
ALTER TABLE search_term_performance ADD COLUMN IF NOT EXISTS conversions_value_micros BIGINT NOT NULL DEFAULT 0;
ALTER TABLE conversion_actions ADD COLUMN IF NOT EXISTS default_value_micros BIGINT;
ALTER TABLE conversion_actions ADD COLUMN IF NOT EXISTS always_use_default_value BOOLEAN;
ALTER TABLE conversion_actions ADD COLUMN IF NOT EXISTS value_tier TEXT
  CHECK (value_tier IN ('micro', 'lead', 'visit', 'sale'));                      -- our own label, not a Google field
```

Keyword-level impression share is NULL (not 0) until ads run, so the UI can say "no data yet".

**New tables**

```sql
-- Mirrors campaign_criterion / ad_group_criterion / shared_criterion with negative = TRUE.
CREATE TABLE IF NOT EXISTS negative_keywords (
  id SERIAL PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('campaign', 'ad_group', 'shared_set')),
  campaign_id INTEGER REFERENCES campaigns(id),
  ad_group_id INTEGER REFERENCES ad_groups(id),
  text TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'phrase', 'broad')),
  source TEXT NOT NULL CHECK (source IN ('existing', 'applied_suggestion')),
  google_criterion_id TEXT,
  data_source TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Per-keyword, per-day, per-conversion-action. Store NON-ZERO rows only.
CREATE TABLE IF NOT EXISTS keyword_conversion_action_performance (
  id SERIAL PRIMARY KEY,
  keyword_id INTEGER NOT NULL REFERENCES keywords(id),
  conversion_action_id INTEGER NOT NULL REFERENCES conversion_actions(id),
  date DATE NOT NULL,
  conversions REAL NOT NULL DEFAULT 0,
  conversions_value_micros BIGINT NOT NULL DEFAULT 0,
  UNIQUE (keyword_id, conversion_action_id, date)
);

-- One row per unique normalized search-term text, reused across ad groups.
CREATE TABLE IF NOT EXISTS search_term_intents (
  normalized_text TEXT PRIMARY KEY,
  intent TEXT NOT NULL CHECK (intent IN
    ('buyer', 'researcher', 'job_seeker', 'student', 'competitor', 'consumer', 'unknown')),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  method TEXT NOT NULL CHECK (method IN ('rule', 'llm')),
  rule_id TEXT,                        -- which rule fired, for auditing
  classifier_version INTEGER NOT NULL, -- bump to force reclassification
  classified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Keyword text parsed once into make / model / year (cache).
CREATE TABLE IF NOT EXISTS keyword_vehicle_parse (
  keyword_id INTEGER PRIMARY KEY REFERENCES keywords(id),
  make TEXT, model TEXT, year_from INTEGER, year_to INTEGER,
  method TEXT NOT NULL CHECK (method IN ('rule', 'llm')),
  parser_version INTEGER NOT NULL,
  parsed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Demo inventory only. The real source is read through the adapter (section 10).
CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  external_id TEXT,
  make TEXT NOT NULL, model TEXT NOT NULL, year INTEGER NOT NULL,
  mileage_km INTEGER, price_idr BIGINT NOT NULL, acquisition_cost_idr BIGINT,
  status TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'sold')),
  listed_on DATE NOT NULL, sold_on DATE
);
CREATE TABLE IF NOT EXISTS vehicle_events (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('listed', 'price_change', 'reserved', 'sold')),
  event_date DATE NOT NULL, old_price_idr BIGINT, new_price_idr BIGINT
);

CREATE TABLE IF NOT EXISTS keyword_suggestions (
  id SERIAL PRIMARY KEY,
  pipeline_run_id INTEGER NOT NULL REFERENCES pipeline_runs(id),
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN
    ('negative_keyword', 'promote_search_term', 'change_match_type', 'pause_keyword',
     'spin_out_campaign', 'new_keyword', 'raise_bid_candidate')),
  campaign_id INTEGER REFERENCES campaigns(id),
  ad_group_id INTEGER REFERENCES ad_groups(id),
  keyword_id INTEGER REFERENCES keywords(id),
  search_term_id INTEGER REFERENCES search_terms(id),
  payload JSONB NOT NULL,            -- type-specific fields (text, match type, cluster members...)
  evidence JSONB NOT NULL,           -- the numbers behind it, computed in code
  basis TEXT NOT NULL CHECK (basis IN ('evidence', 'prior')),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  expected_impact JSONB,             -- e.g. {"wasted_spend_micros_per_week": ...}
  rank INTEGER,                      -- set by the LLM ranking step
  explanation TEXT,                  -- set by the LLM explanation step
  inventory_snapshot_on DATE,
  fingerprint TEXT NOT NULL,         -- hash of (type + target) for dedupe across runs
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'dismissed', 'superseded')),
  status_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_keyword_suggestions_status ON keyword_suggestions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_suggestions_fingerprint ON keyword_suggestions(fingerprint);
```

**Widened constraints**

- `pipeline_runs.run_type`: add `'keyword_optimizer'`. Change `VALID_RUN_TYPES` in `pipelineRuns.ts` too, plus the unit test file if it enumerates them.
- `ai_outputs.agent_type`: add `'keyword_optimizer'` (only if the narrative goes through `runWithCritic`; see section 11).

**Settings seed rows** (`app_settings`, same pattern as `monthly_cost_cap_usd`, validators in `backend/src/platform/settings.ts`): `keyword_optimizer_enabled` (`'true'`), `keyword_test_budget_share` (`'0.2'`), `keyword_min_confidence_p` (`'0.05'`), `inventory_allowed_spend_share` (`'0.2'`), `inventory_lead_to_sale_rate` (`'0.02'`). Add validators for each (booleans / bounded numbers), the same way `isValidCostCap` works.

**Row-volume budget** (store non-zero rows only): about 100 keywords × 180 days ≈ 18k `keyword_performance` rows; about 600 search terms (long-tail, most appearing on only some days) well under 100k `search_term_performance` rows; `keyword_conversion_action_performance` bounded by keywords × days × actions with conversions. Check the cost of the `ON CONFLICT` upsert path in `upsertDay` (`damon.ts`) at that scale; the backfill should batch, not run one INSERT per row inside one giant transaction.

**VERIFY** the backup script (`backend/scripts/backupDb.ts`) picks up new tables automatically (it should if it is a full `pg_dump`), and that restore order is fine with the new foreign keys.

## 7. Demo data rework

### 7.1 Generator

Replace the single shared split for keywords and search terms with **per-entity weights**, so the entities genuinely differ:

- Add to `KeywordProfile`: `ctrWeight`, `cvrWeight`, `cpcWeight` (relative to the ad group average), plus `conversionActionMix` (share of that keyword's conversions per action, so value-tier conversions differ per keyword) and `bidMicros`.
- Add the same `ctrWeight` / `cvrWeight` to `SearchTermProfile`, **and** `intent` (ground truth, see 7.3) and an `appearanceProbability` (long-tail terms show up on some days only, which is how real search terms behave and how rows stay sparse).
- In `generateDay`, split **impressions** by share, then **clicks** by `share × ctrWeight`, then **conversions** by `clicks × cvrWeight`, each still through `noisyConservingSplit` so parent totals are conserved. Check the conservation invariants the current code relies on (keyword sums equal ad group totals; search-term sums equal keyword totals) with a test.
- Per-keyword value: `conversions_value_micros = Σ conversions_by_action × action.default_value_micros`.
- Keyword-level impression share and rank-lost share, derived from the keyword's `baseQualityScore` and bid weight, NULL for the first days a keyword is live.

### 7.2 Size and history

- About **100 keywords** (up from 25), about **6 months** of history, long-tail search terms.
- **Trap — `START_DATE`.** `profile.ts` has `START_DATE = '2026-06-01'` and expresses the planted campaign decline (`DECLINE_START_DAY = 25`, ~30 days) and the seasonal spike (`SEASONAL_SPIKE_START_DAY = 45`) as day offsets from it. Moving `START_DATE` back to about 2026-04 **shifts those events earlier in calendar time** and also affects the scripted events (`scriptedEvents.ts`), change events (`CHANGE_EVENTS` dates) and the Time Machine (`timeMachine.ts`). Either (a) keep `START_DATE` and generate earlier history as a separate "pre-window" prefix, or (b) move it and add the same number of days to every offset so calendar dates are unchanged. Pick one and write a test that asserts the decline and spike land on the same calendar dates as before.
- One-off backfill script (`backend/scripts/backfillKeywordHistory.ts`), re-runnable (upserts), batched. Ongoing generation stays code in the daily sync. No separate generating agent.

### 7.3 Planted ground truth

Every planted problem is a row in a `GROUND_TRUTH` export (in `profile.ts` or a new `groundTruth.ts`) with: kind, target (keyword/search-term key), the expected suggestion type, and a "should be found by week N" marker. The harness (section 12) scores against it. Minimum set:

| Plant | Count (start) | Shape |
|---|---|---|
| Wasted spend, non-buyer intent: job-seeker ("lowongan sales mobil"), student/tutorial, "gratis" | 8 terms | Clicks, ~0% conversion, enough clicks to clear the significance threshold |
| Wasted spend, wrong product: new-car, repair/bengkel, spare parts | 6 terms | Same shape |
| Hidden winners: long-tail buyer terms with strong conversion, currently only matching via broad/phrase | 6 terms | Few clicks each but high conversion, should be promoted to exact |
| Stock-less keywords: spend on a make/model the dealer has no car for | 5 keywords | Healthy-looking CTR, but zero available stock in the demo inventory |
| Over-served aging stock / under-served fresh stock | 3 models | Drives "push" and "pull back" suggestions |
| Cluster worth its own campaign: 4+ keywords on one make/model with CPA well below the account's | 2 clusters | Currently buried in a generic ad group |
| **Decoys that must NOT be flagged** | 8 | Low-volume terms with 0 conversions but too few clicks to be significant. A correct engine says "not enough data", not "negative" |
| Intents that are *legitimate* for a dealer: credit / cicilan / DP / tukar tambah | 6 terms | Must be classed `buyer`, not waste (these were leaks in the old Beobot draft) |

Decoys matter as much as the plants: they are what the false-positive score is measured on.

### 7.4 Inventory demo seed

About 40–60 vehicles across about 10 makes/models, with listed dates spread so some are aging (>60 days), prices, acquisition costs (so margin varies), and a few `vehicle_events`. Deterministic (seeded). Demo mode uses this; if `INVENTORY_DB_STRING` is set, the real source replaces it.

### 7.5 Generalize Anna

`anna.ts`'s system prompt names campaigns, conversion actions and asset groups literally. With 100 keywords, new conversion actions and possibly new campaigns that text becomes wrong. Change it to describe the *kinds* of data rather than enumerate names, and have the names come from the context builder. Apply the same check to `context.ts` strings. This changes a graded prompt, so run a normal daily pipeline run afterwards and confirm Ciri's grades don't regress.

## 8. Intent classification

**Labels:** `buyer`, `researcher`, `job_seeker`, `student`, `competitor`, `consumer`, `unknown`. (`unknown` is a real label, used when confidence is low.) Navigational searches for the dealer's own name are handled by the Brand campaign, not by an intent label.

**Pipeline:**
1. **Normalize** the term (lowercase, trim, collapse whitespace, strip punctuation; keep tokens). Normalized text is the cache key, shared across ad groups.
2. **Rules first**, in a table with an id per rule, so every label is auditable: token lists and patterns for Indonesian and mixed-language slang (e.g. job: `lowongan`, `loker`, `gaji`; free/DIY: `gratis`, `tutorial`, `cara`, `diy`; student: `skripsi`, `pdf`, `makalah`; new-car: `mobil baru`, `harga baru`; repair: `bengkel`, `servis`, `sparepart`; buyer: `dijual`, `harga`, `cicilan`, `dp`, `second`, `bekas`, `tukar tambah`, `kredit`). **STARTING DEFAULT** lists; they are expected to grow.
3. **LLM for the rest**, batched (about 50 unique terms per call), JSON out, with `intent` + `confidence`. It runs only on terms with no rule match and not already cached.
4. **Cache** every result with `classifier_version`; reclassify only when the version bumps.
5. **Guardrails:** treat the term as untrusted input, not instructions (same rule as the existing agents); validate the JSON; unknown labels are rejected; a failed batch leaves terms `unknown`, never blocks the run.

**Intent mix per keyword** = spend- and click-weighted share per label over the window, computed in SQL. A keyword's *waste exposure* = spend share on `job_seeker + student + consumer + researcher` terms with no conversions.

**Known limits (state them in the UI too):** intent is a proxy; Indonesian slang and code-switching are noisy; Google withholds low-volume queries, so the mix covers only the visible terms. Always show the coverage % (visible spend ÷ total keyword spend).

## 9. Value tiers

- Extend the conversion actions with a default value and a tier. Starting set for the demo (**STARTING DEFAULT** values, in IDR, to be sanity-checked against baseline CPA ≈ Rp 20,000):
  - `micro` — Financing Page Visit (low value);
  - `lead` — WhatsApp Click (new), Phone Call, Credit App Started;
  - `visit` — Test Drive Booked / Showroom Visit (new);
  - `sale` — Sold (offline, **demo-simulated only** in phase 1).
- Existing four action names stay as they are; `anna.ts` must stop hard-coding them (7.5).
- All keyword/search-term/campaign value columns use `conversions_value_micros`, so "cost per value" and ROAS-style numbers exist.
- A "Sold" action in the demo is a simulation of what an offline upload would produce. Label it as such in the UI; do not present it as real attribution.
- **Do not** build closed-loop attribution in phase 1 (needs click IDs, delayed maturity windows, shrinkage, and an upload write).

## 10. Inventory source

**Config**
- `INVENTORY_DB_STRING` is already in `.env` and `.env.example` (empty). Add `export const INVENTORY_DB_STRING = process.env.INVENTORY_DB_STRING` to `backend/src/platform/config.ts` next to `DATABASE_URL`.
- Empty → use the demo `vehicles` / `vehicle_events` tables in the Pitstop DB.
- **Confirmed by the owner (2026-10-06):** it is a **Postgres connection string**. The existing `pg` driver works, no new dependency. The real **column list** is still pending, and the adapter's mapping file can't be finished without it.

**Safety**
- A **separate** `pg.Pool` (do not reuse the Pitstop pool in `db.ts`), small (`max` ≤ 3), short `connectionTimeoutMillis` and a `statement_timeout`.
- Read-only: ask the owner for a read-only database role; additionally run every query inside `BEGIN READ ONLY` as defence in depth.
- Allow-listed, fixed queries only. No SQL built from keyword text or any model output.
- The string is a secret: never log it, never return it from any endpoint, never show it in the UI. Run it through `redactSecrets` like other secrets (add it to the redactor's env-literal list; **VERIFY** how `secretLiterals()` discovers env vars, since it memoizes `process.env` on first call).
- Failure mode: if the source is unreachable, the engine runs without inventory-dependent suggestion types and says so; it never fails the whole weekly run.

**Adapter**
- One interface, `InventorySource { listVehicles(): Promise<Vehicle[]>; listEvents(since): Promise<VehicleEvent[]>; snapshotDate(): string }`, with `DemoInventorySource` and `ExternalInventorySource`. One mapping file converts the owner's real columns to the `vehicles` shape. **The real column list is still pending from the owner.**
- Every suggestion stores `inventory_snapshot_on`. The UI shows it.
- Cache an inventory snapshot per run (read once, not per suggestion).

**Keyword ↔ vehicle matching**
- `keyword_vehicle_parse` caches make/model/year per keyword, via rules against a make/model dictionary built from the inventory plus a static list of common Indonesian-market makes/models, with an LLM fallback for the remainder. Parse once, reuse; reparse when `parser_version` changes.
- Match keywords to stock by make/model (and year range when present). Output per keyword: `stock_count`, `avg_days_listed`, `avg_margin`.

**Target CPA from margin** (formula; parameters live in settings)

```
target_cpa_per_lead = avg_margin_per_vehicle × allowed_spend_share × lead_to_sale_rate
```

Worked example, **illustrative only**: margin Rp 12,000,000 × 0.20 × 0.02 = **Rp 48,000** per lead. Baseline demo CPA is about Rp 20,000, so the demo parameters must be chosen so targets are plausible against it; check this when seeding. Lead-to-sale rate is a guess until real data exists, so label any suggestion that depends on it `basis: prior`.

## 11. Engine, agent and pipeline

### 11.1 Engine (deterministic)

New module `backend/src/optimizer/` (pure functions + SQL readers; no model calls inside). It produces candidate rows for `keyword_suggestions`. Thresholds are **STARTING DEFAULTS**.

**Significance rule for "zero conversions".** With a conversion rate `p0` (use the ad group's own rate over the window, floor it at a small value), the number of clicks with zero conversions needed before calling it waste at 95% confidence is:

```
n_min = ceil( ln(0.05) / ln(1 − p0) )
```

At the demo baseline (p0 ≈ 7.9%) that is about 37 clicks. Below `n_min`, the output is "not enough data", never a negative. Use the same logic for pausing.

| Type | Trigger (starting default) | Evidence stored | Basis |
|---|---|---|---|
| `negative_keyword` | Search term with ≥ `n_min` clicks, 0 conversions; **or** a repeated waste token across ≥ 3 terms with combined clicks ≥ `n_min`; **or** a term classed `job_seeker`/`student`/`consumer` with ≥ 10 clicks and 0 conversions | clicks, cost, conversions, intent, example terms, window | `evidence` |
| `negative_keyword` (preventive) | Standard junk list (job, free, DIY, new-car, repair) not already in `negative_keywords` | which list entry | `prior` — flagged "unverified" |
| `promote_search_term` | Term not already a keyword in the ad group; ≥ 2 conversions; CPA ≤ the parent keyword's CPA; intent `buyer` | term stats vs parent keyword stats | `evidence` |
| `change_match_type` | Broad/phrase keyword whose spend share on non-buyer intents exceeds a threshold, or exact keyword with a large buyer-intent term surplus | intent mix, spend by intent | `evidence` |
| `pause_keyword` | ≥ `n_min` clicks, 0 conversions, and (QS ≤ 4 or stock-less) | clicks, QS, stock_count | `evidence` |
| `spin_out_campaign` | ≥ 3 keywords on the same make/model, combined CPA ≤ 0.8 × the ad group's CPA, enough combined conversions, currently sharing an ad group with weaker keywords | cluster members, CPA vs parent | `evidence` |
| `new_keyword` | Generated from stock attributes (make/model/year/body type/price band) not already a keyword or a negative, capped per run; plus keyword ideas in live mode | the stock row(s) it came from | `prior` until it graduates |
| `raise_bid_candidate` | Keyword with high rank-lost share (the confirmed field), CPA at or below target, stock aging | rank-lost share, CPA, target | `evidence`, only when bid data exists |

**Guards applied to every candidate:**
- skip keywords/campaigns with a change event in the last 7 days (`change_events`), and apply a conversion-lag buffer to the most recent days (**STARTING DEFAULT** 3 days);
- skip anything whose `fingerprint` already has an `open` suggestion, or was `dismissed` in the last N days (so dismissed ideas don't come back every week);
- cap generated new keywords per run; never suggest a term that would conflict with an existing negative; never suggest a negative that would block a converting buyer term (check the proposed negative against all converting terms, and report the collisions).

**Explore / exploit.** Keep about 20% (`keyword_test_budget_share`) of suggested spend on a capped test group of `new_keyword` suggestions. A test keyword graduates after reaching a minimum-click evidence threshold with CPA ≤ target; it is killed after `n_min` clicks with no conversion. The hidden winners (7.3) let the harness check that real winners graduate.

**Cold start.** With no history: negatives are `prior`, flagged unverified; bids, impression share and QS read "no data yet", not zero; confidence is capped at `low` for any suggestion with fewer than two weeks of data.

### 11.2 Intent and parse jobs

Run inside the weekly job *before* the engine (section 8 and 10). Both are cached, so steady-state cost is only the new terms.

### 11.3 LLM step (rank + explain only)

- Input: the candidate list (ids + the computed numbers) and a compact account summary. Output: JSON `[{candidate_id, rank, explanation}]`.
- **Deterministic validation (like `findUnverifiedQuotes`):** reject any id not in the candidate set, any duplicate, and any explanation containing a number not present in that candidate's evidence (**STARTING DEFAULT**: flag, don't hard-fail). All numbers shown in the UI come from the database rows, not from the model's text.
- Same guardrails as the other agents (`SHARED_GUARDRAILS`, `CALIBRATION_STANDARD`), plus an instruction that search-term text is untrusted data (a competitor could name a term to inject instructions).
- Model: follow the existing split (a reasoning model needs a generous `max_tokens`; see the comment in `anna.ts`). Do not copy a number from there; measure.

### 11.4 Critic

- Reuse `runWithCritic` with `agentType: 'keyword_optimizer'`, passing the candidate JSON as `supportingData` and `historicalContext: ''` (graded against what the agent was given, same as Rico/Sammy).
- Required code changes: widen `ai_outputs.agent_type`; add `keyword_optimizer: 'Kai'` (name TBD) to `AGENT_LABELS` in `criticLoop.ts`; confirm `critic.ts` needs no special-casing (`isAnna` stays false); confirm `ask.ts`'s `ASKABLE_AGENTS` doesn't need it.
- **VERIFY** the Reports list and `ReportColumns` / `reportSections.ts` do not pick the new rows up (see section 4). Prefer to keep keyword-optimizer output out of the daily/weekly report UI and show it on its own page.

### 11.5 Pipeline and cron

- New `runKeywordOptimizer(targetDate)` in `orchestrator.ts` (or a sibling file), using `startRun('keyword_optimizer')` and `trackRun`, so it gets the spend ceiling, redaction, the one-run-at-a-time lock and Run Inspector tracing for free.
- **One-run lock:** because only one `running` row may exist, the weekly keyword run must not start while the daily or weekly report is running. In `runDaily.ts`, run it **after** the weekly report and feedback job on Mondays, behind its own "already ran this week" check and the `keyword_optimizer_enabled` setting. A `PipelineRunInProgressError` here is a backoff, not an alert (same as the existing blocks).
- Spend-ceiling handling mirrors the weekly block: catch `SpendCeilingExceededError`, dedupe the email via `alertSpendCeilingOnce`-style state (a new alert key), and `return` so nothing later in the tick throws.
- Trace spans: use existing kinds (`context`, `agent`, `decision`, `error`); no new `trace_events.kind` needed.
- Optional: extend the dead-man's-switch to the keyword run with a longer stale window (it is weekly, not daily; the existing `STALE_HOURS = 30` is wrong for it).
- **Cost:** estimate, not measured: one batched intent job (small, mostly one-off), one rank/explain call, and one to three critic calls. Expect a low-tens-of-cents weekly run; measure the first real runs in the Run Inspector and confirm it stays well inside `monthly_cost_cap_usd` (default $20, existing usage about $4–7/month).

### 11.6 Keyword verdict (contract 3.1)

`GET /keywords/summary` gives each keyword one `verdict`, computed in `src/optimizer/verdict.ts` from the engine's own evidence window (`windowDays` = 90, ending `conversionLagDays` = 3 days before the newest data), its ad-group baseline and its thresholds, so a label and a suggestion can't disagree. The verdict ignores the request's `days`; the other summary fields follow it. First match wins:

| # | Verdict | Rule | Threshold (all from `ENGINE_DEFAULTS` / settings) |
|---|---|---|---|
| 1 | `no_stock` | cost > 0 in the window and `stock_count === 0` (the same value the item shows; `null` never matches) | none |
| 2 | `testing` | the keyword matches an **applied** `new_keyword` suggestion with `is_test: true` (same normalized text; same ad group, or the suggestion had none), and has fewer than `n_min` clicks | `n_min` |
| 3 | `wasting` | `n_min`+ clicks and zero conversions (the significance rule), **or** an open `pause_keyword` suggestion on it | `n_min` at p = `keyword_min_confidence_p` (0.05) |
| 4 | `winner` | `n_min`+ clicks, at least `promoteMinConversions` conversions, and CPA at or below its ad group's CPA (the comparison `raise_bid_candidate` uses). An open pause always lands in 3 first | `n_min`, `promoteMinConversions` = 2 |
| 5 | `needs_data` | fewer than `n_min` clicks (includes a keyword with no spend, and one outside the engine's input, e.g. paused) | `n_min` |
| 6 | `steady` | everything else | none |

`n_min = ceil(ln(p) / ln(1 - p0))` with `p0` = the keyword's ad-group conversion rate over the window (floored at 0.005), exactly as in 11.1. A test keyword that reaches `n_min` leaves `testing`: zero conversions makes it `wasting` (killed), beating its ad group makes it `winner` (graduated).

**Paused keywords (contract 3.2).** The engine reads enabled keywords only; paused ones are read over the same window (`loadKeywordWindow(..., 'paused')`) and judged against their ad group's enabled keywords. A paused keyword never reads `winner` or `wasting` (both imply acting on something already switched off): it reads `steady` instead. `no_stock`, `testing` and `needs_data` apply as above. Status comes from `keywords.status`, case-insensitive: `paused` is paused, `removed` is left out of the summary, anything else (or NULL) is enabled.

Open `negative_keyword` suggestions don't change a keyword's verdict: they target one search term under the keyword, not the keyword itself (its waste exposure shows that share).

### 11.7 Campaign proposals: the `new_campaign` suggestion (contract 3.3)

The owner wants the AI to look at the inventory and propose **whole new campaigns**, which, when approved, appear as **Planned** campaigns with a paste-ready brief (and, much later, can be created in Google Ads, see scope doc 3.1; that write path is **not** part of this task). Code decides; the model only explains, exactly as for every other suggestion. All thresholds are **STARTING DEFAULTS**, settings-backed where it makes sense, and tuned with the scoring harness.

**Four bases** (`payload.basis`):
- `uncovered_stock`: a make/model group (from `keyword_vehicle_parse` plus `vehicles`) with at least 2 available units and **no enabled keyword or campaign targeting it**. This is the clearest case: cars you can sell that nothing advertises.
- `aging_stock`: units listed 60 or more days, or in the top quartile of margin, where coverage is thin (few keywords, or only needs_data / steady verdicts). Overlaps are reported, not hidden.
- `proven_cluster`: the existing spin-out logic (4+ keywords on one make/model, cost per conversion well under the ad group's). Keep emitting `spin_out_campaign` for it **or** fold it into `new_campaign`, but never emit both for the same cluster. Say in your report which you chose.
- `theme`: a price band or body type built from the stock mix, e.g. "family cars under Rp 200 juta": at least 4 units across at least 2 models in the band, with ad groups per model.

**Proposal contents** (all computed in code, from `NewCampaignPayload` in the contract):
- **Name:** deterministic from the make/model or theme ("Search — Toyota Innova Zenix"), made unique against existing campaign names and against open or planned proposals. The name matters: it is how a planned campaign is later recognised in the real data.
- **Ad groups:** one per model (theme campaigns: per model within the band), each with `vehicle_ids`. **Keywords** are generated from stock attributes (make, model, year, "bekas" / "second", plus the dealer's city or suburbs the existing campaigns already use), each with a match type and a `source`. Cap at about 12 keywords per campaign and 4 ad groups; never propose a keyword that already exists in an enabled state or is a negative.
- **Starter negatives:** the standard junk list plus the account's existing campaign-level negatives, so the new campaign does not begin by leaking spend.
- **Budget:** `target_cpa_micros` from the section 10 formula (margin x allowed spend share x lead-to-sale rate). `daily_micros = clamp((allowed_spend_share x total margin of the units) / 30, floor, ceiling)`: the most the stock can justify, spread over a month, bounded by a settings floor and ceiling so a big pile of expensive cars cannot propose an absurd budget. Always include `assumptions`: `lead_to_sale_rate` is a guess, so any proposal that leans on it is `basis: 'prior'` (shown as unverified) and `confidence` is capped at `medium`.
- **Overlaps:** existing campaigns that already target any of the proposal's keywords or models (`shared_keywords` counted), so the UI can warn about cannibalising.
- **`stock`:** units, average days listed, average margin, total value, and the inventory snapshot date.

**Guards:** at most 3 `new_campaign` proposals per run, ranked by (units x average margin); skip one whose fingerprint already has an open or planned proposal, or was dismissed recently; never propose from an inventory snapshot the source reported as unavailable (say so instead).

**Lifecycle:** `open -> planned` (the owner approved it), `planned -> open` (undo), `planned -> dismissed`, `planned -> applied` (the owner created it by hand). After each data sync, if a campaign whose name matches a `planned` proposal (case-insensitive, trimmed) now exists, set `linked_campaign`, move the suggestion to `applied`, and stop proposing it.

**Brief endpoint:** `GET /keyword-suggestions/:id/brief?format=csv|txt` for `new_campaign` only (scope doc section 13). The columns for Google Ads Editor must be **verified against a real Editor export**, like the negatives export. Neutralize every field against formula injection.

**LLM step:** Kai ranks and explains the proposals in plain language ("You have 3 Innova Zenix units, listed 67 days, nothing advertises them"); the validator rejects unknown ids and any number not present in the proposal's own fields. Ciri grades as usual.

**Demo data and harness:** plant ground truth for each basis (at least: 3 models in stock with no coverage, an aging group, a price-band theme, plus a **decoy**: stock that is already well covered and must NOT produce a proposal) and score them like every other plant.

**Tests:** each basis fires; the decoy does not; name uniqueness; budget clamp (floor, ceiling, zero margin); keyword cap and de-duplication against existing keywords and negatives; overlap counting; dedupe and per-run cap; `planned -> applied` auto-link on a matching campaign name (case and whitespace insensitive); brief CSV neutralization; `planned` rejected for any other suggestion type.

**As built (2026-10-07)**: `src/optimizer/campaigns.ts`, called from `runEngine`; thresholds in `src/optimizer/thresholds.ts`, all **STARTING DEFAULTS**:
- **`proven_cluster` is not emitted.** A strong cluster stays a `spin_out_campaign`, and a make/model with a spin-out in the same run gets no `new_campaign` of any basis, so a cluster is never proposed twice.
- **Coverage** is per make/model: enabled keywords whose vehicle parse names it, or a campaign whose name parses to it. **Thin** = at most `thinCoverageMaxKeywords` (1) enabled keywords, **or** only `needs_data` / `steady` verdicts with fewer than `promoteMinConversions` (2) conversions between them. The conversion clause was added after the harness: a converting cluster under `n_min` clicks reads `steady`, and must not count as thin.
- **`uncovered_stock`**: `uncoveredMinUnits` (2) available units, coverage zero. **`aging_stock`**: thin coverage and `agingMinUnits` (2) units that are aging (`agingDays`, 60) or top-quartile margin. Top quartile = margin at or above the 75th percentile (nearest rank) of all available units' known margins **and** above their median, so equal margins don't make every unit "top". The ad group holds all the model's available units.
- **`theme`**: price bands only (the inventory has no body type): under Rp 150 juta, 150-250, 250-400, over 400. Thin models are not proposed on their own this run; up to `campaignMaxAdGroups` (4) models, most units x margin first; needs `themeMinUnits` (4) and `themeMinModels` (2). Confidence `low`; the model-level bases `medium`; all `basis: 'prior'`.
- **Keywords** per model, best first: `<model> bekas` (phrase), `<make> <model> bekas` (exact), `harga <model> bekas` (phrase), `<model> bekas <place>` (phrase, the place word the account's keywords use most, from jakarta / bekasi / tangerang / depok / bogor / jabodetabek), `<model> second` (phrase), `<model> <commonest year> bekas` (phrase). Round-robin across ad groups up to `campaignMaxKeywords` (12). Dropped: any text an enabled keyword already has, any text equal to an existing negative, anything a starter negative or a shared-set negative blocks. `source` is always `stock`.
- **Starter negatives**: `JUNK_NEGATIVES` plus every campaign-level negative in the account, de-duplicated by text and match type.
- **Budget**: `daily_micros` as specified, in whole rupiah; no known margin gets the floor. **3.4** `bound` = `'floor'` / `'ceiling'` when clamped, `null` otherwise (a value exactly on a bound is not clamped; a ceiling below the floor yields the floor, `bound: 'floor'`). The bounds are the settings `campaign_daily_budget_floor_idr` (default `'20000'`) and `campaign_daily_budget_ceiling_idr` (default `'100000'`): whole rupiah, digits only, above 0; nothing checks the floor against the ceiling.
- **Overlaps**: campaigns holding an enabled keyword on any of the proposal's models (`shared_keywords` = how many), or named after one; most shared first.
- **Name**: `Search - <Make> <Model>` or `Search - <band label>` (with the same em dash the rest of the account uses); on a clash with a campaign, an open or planned proposal with another fingerprint, or an earlier proposal of the same run, ` 2`, ` 3`, ... is appended. Fingerprint: `model:<make>|<model>` or `theme:price:<band>`, so a dismissed model stays away even if its basis changes.
- **Cap**: proposals over `campaignCap` (3) are skipped with reason `cap` and returned in `EngineResult.capped` (not stored); the next run offers them again.
- **Brief** (`src/reporting/campaignBrief.ts`): CSV header row `Campaign,Campaign daily budget,Ad group,Keyword,Criterion type,Status`, pinned by a test; the campaign row has Status Paused so an import never starts spending; campaign negatives use `Campaign Negative Exact/Phrase/Broad`. The CSV is **UNVERIFIED** until matched to a real Editor export, and the response carries `X-Editor-Columns: UNVERIFIED` (CORS exposes it and `Content-Disposition`). 400 for a bad id, a bad format or any non-`new_campaign` type; 404 for an unknown id.
- **LLM step**: Kai's prompt has one line on `new_campaign`. For `new_campaign` only, an explanation quoting a number not in the proposal's own fields (payload and evidence; it has no campaign, keyword or term names) is **dropped**, not just flagged (`STRICT_NUMBER_TYPES` in `ranking.ts`); the rank still applies, Ciri sees "(no usable explanation this run)", and the row asks again next run. Other types keep the flag-only default. Known weakness: the shared number check reads "1,493" the Indonesian way as 1.493, which passes its 0.51 tolerance against a proposal's 2 (the 2% rate), so small borrowed figures can slip through. Tested with the model stubbed; no real model call yet.
- **Demo and harness**: plants `UNCOVERED_VEHICLES` (Wuling Almaz, Wuling Cortez, Hyundai Stargazer; Cortez and Stargazer added to the demo stock), the aging Rush and HR-V, the under-Rp-150-juta theme, and two decoys (Avanza, well covered; Xpander, the spin-out cluster). A capped proposal counts as found. 10 seeds: every campaign plant found from week 1, decoys 0% flagged; the older plants unchanged.
- **Deploy lesson**: a restart onto a build that needs a schema migration returned 500 until the migration was applied. Check `db/schema.sql` against the live database before restarting.

## 12. Scoring harness and tests

**Harness** (`backend/scripts/scoreOptimizer.ts`, no model calls; runs the deterministic engine only):
- For N seeds (**STARTING DEFAULT** 10), regenerate the demo window, run the engine, compare against `GROUND_TRUTH`.
- Report per plant kind: found, missed, false positives, plus decoy false-positive rate and the time-to-find (which week it first appears).
- Targets are set after the first run, not guessed now; the harness is what makes thresholds tunable instead of arguable.
- Also score the LLM step separately and cheaply: fraction of explanations that pass the deterministic validation.

**Vitest unit tests** (co-located `*.test.ts`, vitest pinned ^3.2.7 for the VPS's Node 18.19.1; `tsconfig` already excludes tests from the build):
- `n_min` formula and the "not enough data" boundary;
- intent rules: each rule id, Indonesian examples, normalization, `unknown` fallthrough;
- fingerprint dedupe and dismissed-cooldown;
- negative-collision check (proposed negative vs converting terms);
- cold-start behaviour (`basis: prior`, confidence cap);
- target CPA formula and its settings validators;
- generator conservation invariants (children sum to parent) and decline/spike calendar-date stability;
- LLM-output validator (unknown id, duplicate id, foreign number);
- inventory adapter mapping and read-only enforcement (a mutating statement must be rejected).

## 17. Build order (backend)

Each step is independently shippable and testable. **Stop after each step, report, and wait.**

1. **Schema + settings + `INVENTORY_DB_STRING` config read.** No behaviour change. Verify: `initDb` re-runs cleanly twice; existing tests pass.
2. **Generator rework + 100-keyword profile + backfill + ground truth + conservation tests.** Verify: parents still equal the sum of children; decline/spike dates unchanged; CPAs now differ across keywords.
3. **Intent classifier (rules, then LLM batch) + cache.** Verify: rule tests; spot-check a sample of terms; coverage % is correct.
4. **Value tiers + keyword conversion-action data.**
5. **Inventory adapter (demo first), keyword parse, stock matching, target CPA.** Then the external source behind `INVENTORY_DB_STRING` once the real columns are known.
6. **Engine + suggestions table + scoring harness.** Run the harness; tune thresholds; only then proceed. No model yet.
7. **LLM rank/explain + validator + critic wiring + `run_type`/`agent_type` widening + cron hook.** Verify with one manual run: trace in the Run Inspector, spend stays under the cap, Reports list unaffected.
8. **API per scope doc section 13:** the new routes, the additive fields on existing routes, `GET /keywords/summary`, the new settings keys with validators, and `POST /keyword-optimizer/run`. Verify each endpoint against the contract's exact shapes, including the `null` and empty cases.

The frontend work (page, tables, theme, i18n) is in `overhaul-v3-frontend.md` and is **not** part of this task.

## 18. Risks (backend)

| Risk | Mitigation |
|---|---|
| Thresholds look arbitrary | The scoring harness plus the `n_min` formula make them explainable and tunable |
| Engine flags noise as waste | Decoys in ground truth; "not enough data" as an output; conversion-lag and recent-change guards |
| LLM invents a suggestion or number | Candidate-id validation; all displayed numbers come from DB rows; Ciri grades against the candidate JSON |
| A suggested negative blocks a converting term | Collision check against converting terms; show collisions |
| Moving `START_DATE` silently shifts planted events | Test asserting decline/spike calendar dates |
| New agent type leaks into Reports / Learning | Audit queries (section 4); keep its output on its own page |
| One-run lock collides with the daily run | Run after the weekly block; treat `PipelineRunInProgressError` as backoff |
| Inventory DB credentials leak or the source is written to | Separate pool, read-only role + `READ ONLY` transactions, allow-listed queries, redaction, never exposed by API/UI |
| CSV export formula injection from search-term text | Neutralize leading `= + - @` in exported fields |
| Generated keywords bloat the account | Cap per run; graduate-or-kill rules |
| Contract shape can't be met by the data or code | Stop and report; the scope doc is changed first (and the version bumped), then the code |

Open questions that affect this file: scope doc section 19, items 1, 3, 4, 5, 6, 7.
