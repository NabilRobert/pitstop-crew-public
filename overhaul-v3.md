# Overhaul v3: Keyword optimizer. Scope

**Status:** planned, not started. Written 2026-10-06. The owner schedules the build.
**Branch base:** `feat-v2-overhaul` work is merged; v3 starts from `main`.

This is the **scope and contract** document: what is being built, why, the decisions made, the facts about the current code, the API feasibility check, the API contract, and the open questions. The *how* lives in two implementation files:

| File | Sections | For |
|---|---|---|
| `overhaul-v3.md` (this file) | 1-5, 13, 17-20 | everyone |
| `overhaul-v3-backend.md` | 0, 6-12, 17, 18 | whoever builds the backend |
| `overhaul-v3-frontend.md` | 0, 14-16, 17, 18 | whoever builds the frontend |

Section numbers are **global across the three files** (section 13 is always the API contract, in this file). Sections marked **VERIFY** are assumptions not confirmed from the code or API docs; resolve them before building on them. Sections marked **STARTING DEFAULT** are numbers meant to be tuned against the scoring harness (section 12, backend file), not fixed rules.

---

## 1. Goal and principles

Add a dedicated keyword optimizer. It should:

1. push keywords and campaigns that perform well, and help create good new ones;
2. cut wasteful keywords;
3. suggest new keywords instead of recycling the same ones;
4. suggest campaign / ad-group structure from keyword performance;
5. tie every suggestion to the dealer's used-car inventory.

Principles, carried over from v1/v2 and not negotiable:

- **Suggestions only.** Nothing in Pitstop can change an account. No one-click apply. (Offline conversion upload, a write, is explicitly out of scope — see phase 3.)
- **Facts are computed in code, not by the model.** The engine (SQL/stats) decides what is a candidate and what the numbers are. The LLM may rank and explain candidates; it may not add a candidate or alter a number.
- **Approval is decided in code.** Ciri grades; `decideApproval` decides.
- **"Not enough data" is a valid output**, never papered over.
- **API-shaped data.** Every table the engine reads mirrors a Google Ads API resource/field, so the real API can feed it later.

## 2. Decisions already made

| # | Decision | Source |
|---|---|---|
| 1 | The advertiser is the **existing demo used-car dealer**. Extend it. The earlier Beobot-as-advertiser draft is obsolete | owner, 2026-10-06 |
| 2 | Build **intent per search term** first, plus **value tiers** (separate conversion actions with different values). Closed-loop sale attribution comes later | owner accepted the recommendation |
| 3 | Frontend domain is `https://pitcrewai.my.id` | owner |
| 4 | Stays on the same VPS (no migration) | owner |
| 5 | NVDA price-alert cron is parked, not part of v3 | owner |
| 6 | Inventory comes from the owner's own **Postgres** database via `INVENTORY_DB_STRING` (a connection string) | owner |
| 7 | The owner will plan/schedule the build; nothing starts unprompted | owner |
| 8 | New frontend theme named **Atom-Eve**, **not** the default (Ferrari stays default). Final direction: bold pop-art, a saturated pink ground with black type and outlines, modeled on a Dribbble pop-art storefront the owner chose (history: light, then dark, then this) | owner, 2026-10-06 |

## 3. Phasing

| Phase | What | Needs a write to the Ads account? |
|---|---|---|
| **1** | Intent per search term, intent mix per keyword, cached | No |
| **1** | Value tiers: conversion actions with values, keyword-level conversions by action | No |
| **1** | Deterministic engine + weekly agent + suggestions UI + inventory | No |
| **2** | Live ingestion of keyword / search-term / negative data from the real API | No (read) |
| **3** | Closed-loop sale / margin attribution | **Yes** (offline conversion upload) — outside Pitstop's read-only stance, so it needs its own decision |
| **Later** | Competitor data (auction insights) | No |

Phase 1 is everything in the backend and frontend files unless stated otherwise.

## 4. What the code looks like today (verified 2026-10-06)

These facts shape the plan; I read them from the repo.

- **Schema** (`schema.sql`, 609 lines, idempotent `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` style, no migration tool):
  - `keywords` (match_type CHECK `exact|phrase|broad`, UNIQUE `(ad_group_id, text, match_type)`), no bid column.
  - `keyword_performance`: impressions, clicks, `cost_micros`, conversions, QS + 3 sub-scores. **No** impression share, **no** conversion value, **no** per-action split.
  - `search_terms`: UNIQUE `(ad_group_id, text)`, anchored to **one** `keyword_id`, `match_flavor` CHECK `close_variant|broader`. The same query text can appear once per ad group.
  - `conversion_actions`: name, category, counting_type, status. **No value column.** `conversion_action_performance` is campaign-level only.
  - **No negative-keyword table.**
  - Impression share exists **only on `campaign_performance`** (`search_impression_share`, `search_budget_lost_impression_share`), for the 3 Search campaigns.
- **`ai_outputs.agent_type`** has a CHECK limiting it to `analysis | recommendation | summary | critic`. `period` is limited to `daily | weekly`.
- **`pipeline_runs.run_type`** has a CHECK limiting it to `daily | weekly | weekly_feedback | backup`, mirrored in `VALID_RUN_TYPES` in `backend/src/pipeline/pipelineRuns.ts`. Only one run may be `running` at a time (`idx_pipeline_runs_one_running`).
- **Cron** (`backend/scripts/runDaily.ts`, every 15 min): daily run once past `daily_run_time`; on Mondays the weekly run, then the weekly feedback job. A `SpendCeilingExceededError` is caught per block and deduped to one email per month.
- **Orchestrator** (`backend/src/pipeline/orchestrator.ts`): `runWeekly` calls `runAgentChain`, which builds one context string and runs Anna → Rico → Sammy through `runWithCritic`.
- **Agents:** `anna.ts` hard-codes campaign names (Brand, Search — Used Cars Generic, Search — Model + Suburb), the four conversion action names (Test Drive Booked, Credit App Started, Phone Call, Financing Page Visit) and the four PMax asset-group names. `criticLoop.ts` has `AGENT_LABELS` for the three agents only. `critic.ts` treats `analysis` specially (`isAnna`).
- **Learning page** queries (`backend/src/reporting/learning.ts`) hard-code the three agent types, so a new agent type will not pollute them. **VERIFY** that the Reports list queries (`backend/src/reporting/outputs.ts`, `reports.ts`) also filter by `agent_type`; if they filter only by `period`, a `keyword_optimizer` output with `period = 'weekly'` would show up in the Reports list.
- **Live sync is campaign-only.** `syncLiveWindow` in `backend/src/data/damon.ts` queries only the `campaign` resource. There is no live ingestion for ad groups, keywords, search terms, conversion actions or negatives. Demo mode is the only source of keyword data today. This is why live ingestion is its own phase (2).
- **Demo generator** (`backend/src/data/demo/generator.ts`, 658 lines): impressions, clicks, cost and conversions are each split with `noisyConservingSplit` using the **same** `keywordShares` / `searchTermShares`, so every keyword has the same CTR, CPC and conversion rate. This is why there is nothing to optimize today. Baseline: CPC ≈ Rp 1,600, 57 clicks and 4.5 conversions per baseline day, so CPA ≈ Rp 20,000 and a conversion rate ≈ 7.9%.
- **Demo profile** (`profile.ts`, 705 lines): 5 campaigns, 8 ad groups, 25 keywords (`share`, `baseQualityScore`), 2 search terms per keyword. `START_DATE = '2026-06-01'`. A decline (`DECLINE_START_DAY = 25`) and a seasonal spike (`SEASONAL_SPIKE_START_DAY = 45`) are expressed as **day offsets from `START_DATE`**.
- **Money:** micros of IDR (`cost_micros`), BIGINT parsed to JS Number in `db.ts` (OIDs 20 and 1700).
- **Frontend:** feature folders under `frontend/src/features/`; routes in `frontend/src/app/router/index.ts`; nav in `frontend/src/app/navLinks.ts`; API client in `frontend/src/shared/api/api.ts` and types in `types.ts`; `KeywordTable.vue` / `SearchTermTable.vue` live under `features/dashboard/` and take their row types from `useCampaignDetail.ts`. Demo accounts are blocked from `/settings`, `/aska`, `/time-machine` by `DEMO_HIDDEN` and get a 403 from `demoReadOnly` on every non-GET.

## 5. Google Ads API feasibility (checked 2026-10-06 against API v24 field docs and help pages)

| Need | Status |
|---|---|
| Keyword metrics, Quality Score | Available: `keyword_view`, `ad_group_criterion.quality_info` |
| Keyword bids | Available: `ad_group_criterion.cpc_bid_micros` (empty under automated bidding) |
| Search terms with cost / conversions | Available: `search_term_view`. Google withholds low-volume terms |
| Search-term match type | Available: `segments.search_term_match_type` |
| Existing negatives | Available: `campaign_criterion`, `ad_group_criterion`, shared sets |
| Conversion value | Available: `conversion_action.value_settings`, `metrics.conversions_value` |
| Per-keyword conversions by action | Available, but a query segmented by `segments.conversion_action` returns **only conversion metrics**. Run two queries and join. **VERIFY** on `search_term_view` |
| Keyword ideas + volume | Available: `KeywordPlanIdeaService`. Low-spend accounts may get ranges only |
| Keyword-level impression share | `search_impression_share` and `search_rank_lost_impression_share` **confirmed** on `keyword_view`. `search_budget_lost_impression_share` is in the schema but Google's help docs call it campaign-level only: do not rely on it per keyword |
| Auction insights | `segments.auction_insight_domain` is listed on `keyword_view`. The `metrics.auction_insight_search_*` fields were **not confirmed**. Keyword-level fields can't be freely mixed with other metrics. Out of the first build |
| Intent labels | **Not from Google.** Our own layer |
| Inventory, margin, sold status | **Not from Google.** The dealer's database |
| Real sale value per keyword | **Not readable.** Needs an offline upload (a write) |

Caveats:
- Keyword-level conversion value undercounts conversions Google cannot tie to a click (WhatsApp leads often can't be).
- The developer token is still at test access. Nothing in the live path has run against a real account. The demo proves the engine works on API-shaped data, not that the live path works.

Draft GAQL for phase 2 (**VERIFY every field name against a real test-account query before relying on it**):

```sql
-- keywords + metrics + QS
SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
       ad_group_criterion.keyword.match_type, ad_group_criterion.status,
       ad_group_criterion.cpc_bid_micros, ad_group_criterion.quality_info.quality_score,
       ad_group_criterion.quality_info.search_predicted_ctr,
       ad_group_criterion.quality_info.creative_quality_score,
       ad_group_criterion.quality_info.post_click_quality_score,
       metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
       metrics.conversions_value, metrics.search_impression_share,
       metrics.search_rank_lost_impression_share, segments.date
FROM keyword_view WHERE segments.date BETWEEN ... 

-- search terms
SELECT search_term_view.search_term, segments.search_term_match_type, ad_group.id,
       metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, segments.date
FROM search_term_view WHERE segments.date BETWEEN ...

-- negatives
SELECT campaign.id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
FROM campaign_criterion WHERE campaign_criterion.negative = TRUE AND campaign_criterion.type = KEYWORD
-- (plus ad_group_criterion with negative = TRUE, and shared_criterion)

-- keyword conversions by action (conversion metrics only)
SELECT ad_group_criterion.criterion_id, segments.conversion_action, metrics.conversions,
       metrics.conversions_value, segments.date
FROM keyword_view WHERE segments.date BETWEEN ...
```

Open API question for phase 2: Pitstop anchors each search term to **one** keyword. The real API can attribute a term to a keyword via `segments.keyword.*`, but a term can surface under more than one. Decide how to collapse that (**VERIFY**).

## 13. API contract (version 3.1, 2026-10-06)

This section is **identical in the backend and frontend files**. It is the only thing the two sides share. If either side needs to change it, change it here first, bump the version, and regenerate both files.

**Conventions (match the existing routes):**
- New routers live in `backend/src/api/routes/`, are registered in `main.ts` after `authMiddleware` and `demoReadOnly`, and use `asyncHandler`.
- Errors are `{ "detail": "<message>" }` with a status code, exactly like the existing routes (400 invalid input, 404 not found, 409 conflict / run in progress, 429 spend cap, 500 unexpected). `detail` must never contain a secret or the inventory connection string.
- The demo account can call every `GET` and gets **403 on every non-GET** (existing `demoReadOnly`). The frontend must hide or disable write actions for demo (`isDemo`).
- Dates are `"YYYY-MM-DD"` strings. Money is **integer micros of IDR** (`*_micros`) as JSON numbers, except `*_idr` fields, which are whole rupiah. Shares and rates are numbers in `[0, 1]`.
- **`null` means "no data", never `0`.** Impression share, bids, intent and stock fields are `null` when unknown. The UI renders "no data yet".
- Every change to an **existing** endpoint is **additive only** (new fields), so the current frontend keeps working unchanged.

**Shared types**

```ts
type Intent = 'buyer' | 'researcher' | 'job_seeker' | 'student' | 'competitor' | 'consumer' | 'unknown'
type SuggestionType =
  | 'negative_keyword' | 'promote_search_term' | 'change_match_type' | 'pause_keyword'
  | 'spin_out_campaign' | 'new_keyword' | 'raise_bid_candidate'
type SuggestionStatus = 'open' | 'applied' | 'dismissed' | 'superseded'
type Basis = 'evidence' | 'prior'           // 'prior' = not yet backed by this account's data; show "unverified"
type Confidence = 'high' | 'medium' | 'low'
type MatchType = 'exact' | 'phrase' | 'broad'
type ValueTier = 'micro' | 'lead' | 'visit' | 'sale'

interface Suggestion {
  id: number
  pipeline_run_id: number
  type: SuggestionType
  status: SuggestionStatus
  basis: Basis
  confidence: Confidence
  rank: number | null                 // 1 = most important; null until the LLM step has ranked it
  explanation: string | null          // LLM text; may be null. All NUMBERS shown must come from evidence/payload, not this text
  campaign: { id: number; name: string } | null
  ad_group: { id: number; name: string } | null
  keyword: { id: number; text: string; match_type: MatchType } | null
  search_term: { id: number; text: string } | null
  payload: SuggestionPayload          // shape depends on `type`, see below
  evidence: {
    window_start: string; window_end: string
    clicks: number | null; impressions: number | null; cost_micros: number | null
    conversions: number | null; conversions_value_micros: number | null
    min_clicks_required: number | null   // the n_min threshold used; shows why "not enough data" applies
    [extra: string]: unknown             // type-specific numbers, e.g. parent_keyword_cpa_micros
  }
  expected_impact: { wasted_spend_micros_per_week?: number; extra_conversions_per_week?: number } | null
  inventory: {                           // null when no stock link applies or inventory is unavailable
    snapshot_on: string; stock_count: number; avg_days_listed: number | null; avg_margin_idr: number | null
  } | null
  created_at: string                     // ISO timestamp
  status_changed_at: string | null
}

type SuggestionPayload =
  | { kind: 'negative_keyword'; text: string; match_type: MatchType; scope: 'campaign' | 'ad_group'
      collisions: { search_term: string; conversions: number }[] }   // converting terms the negative would block
  | { kind: 'promote_search_term'; text: string; to_match_type: 'exact'; ad_group_id: number }
  | { kind: 'change_match_type'; from: MatchType; to: MatchType }
  | { kind: 'pause_keyword' }
  | { kind: 'spin_out_campaign'; keyword_ids: number[]; suggested_name: string; make: string | null; model: string | null }
  | { kind: 'new_keyword'; text: string; match_type: MatchType; ad_group_id: number | null
      source: 'stock' | 'search_term' | 'keyword_ideas'; vehicle_ids: number[]; is_test: boolean }
  | { kind: 'raise_bid_candidate'; current_bid_micros: number | null; rank_lost_share: number }
```

**Endpoints (all new)**

`GET /keyword-suggestions`
- Query: `status` (default `open`; one of the statuses or `all`), `type`, `campaign_id`, `limit` (default 50, 1–200, else 400), `offset` (default 0).
- Order: `rank` ascending with nulls last, then `created_at` descending.
- 200:
  ```ts
  { items: Suggestion[]; total: number
    run: { id: number; finished_at: string | null; status: 'running'|'success'|'failure'|'partial' } | null  // latest keyword_optimizer run
    inventory: { source: 'demo' | 'connected' | 'unavailable'; snapshot_on: string | null } }
  ```
- With no run yet: `items: []`, `total: 0`, `run: null`. That is a normal state, not an error.

`PATCH /keyword-suggestions/:id`
- Body: `{ "status": "applied" | "dismissed" | "open" }`. Owner only (demo gets 403).
- Allowed transitions: `open → applied`, `open → dismissed`, `applied → open`, `dismissed → open` (undo). `superseded` is set only by the server; trying to change it returns 409; setting it returns 400.
- 200: the updated `Suggestion`. 400 invalid body or `:id`; 404 unknown id; 409 on a `superseded` row.

`GET /keyword-suggestions/export`
- Query: `type` (default `negative_keyword`; only that type is exportable in v3, else 400), `status` (default `open`), `format` (`csv` | `txt`, default `csv`).
- 200 with `Content-Disposition: attachment`.
- `csv` columns: `Campaign,Ad Group,Keyword,Criterion Type` with `Criterion Type` one of `Negative Exact | Negative Phrase | Negative Broad`. **VERIFY** these headers and values against a real Google Ads Editor export before relying on them (campaign-level negatives may need a different type value).
- `txt`: one keyword per line, formatted `[exact]`, `"phrase"` or bare `broad`.
- **Every field must be neutralized against spreadsheet formula injection**: if it starts with `=`, `+`, `-`, `@`, tab or carriage return, prefix it with `'`. Quote and escape CSV properly. Search-term text is untrusted input.

`GET /inventory/summary`
- 200:
  ```ts
  { source: 'demo' | 'connected' | 'unavailable'
    snapshot_on: string | null
    error: string | null               // short, sanitized; never the connection string
    totals: { available: number; reserved: number; sold_last_30d: number } | null
    aging: { bucket: '0-30' | '31-60' | '61-90' | '90+'; count: number }[]
    by_model: { make: string; model: string; available: number; avg_days_listed: number | null
                avg_price_idr: number | null; avg_margin_idr: number | null; linked_keyword_count: number }[] }
  ```
- If the source is down, still return 200 with `source: 'unavailable'`, the sanitized `error`, `totals: null`, empty arrays. The page must degrade, not break.

`POST /keyword-optimizer/run`
- Owner only. Starts a keyword optimizer run on demand (same lock, spend cap and tracing as scheduled runs).
- 202 `{ "run_id": number }`; 409 another run is in progress; 429 monthly spend cap reached (`detail` has the cap); 403 for demo.

**Extensions to existing endpoints (additive fields only)**

`GET /keywords/performance` (still one row per keyword per day) adds to each row:
`cpc_bid_micros: number|null`, `search_impression_share: number|null`, `search_rank_lost_impression_share: number|null`, `conversions_value_micros: number`.

`GET /search-terms/performance` (still one row per term per day) adds to each row:
`conversions_value_micros: number`, `intent: Intent`, `intent_confidence: number`, `intent_method: 'rule'|'llm'`.

`GET /keywords/summary` (**new**; window aggregates that cannot be derived from the per-day rows)
- Query: `days` (default 30), `adGroupId` (optional).
- 200: `{ items: KeywordSummary[]; coverage: number | null }`
  ```ts
  type KeywordVerdict = 'winner' | 'wasting' | 'no_stock' | 'testing' | 'needs_data' | 'steady'
  interface KeywordSummary {
    keyword_id: number
    verdict: KeywordVerdict                              // added in 3.1, see the rules below
    intent_mix: Partial<Record<Intent, number>> | null   // spend-weighted shares summing to ~1; null if no classified terms
    intent_coverage: number | null                       // visible search-term spend / keyword spend, 0-1
    conversions_by_action: { conversion_action_id: number; name: string; tier: ValueTier | null
                             conversions: number; value_micros: number }[]
    stock_count: number | null                           // null = no vehicle link or inventory unavailable
    avg_days_listed: number | null
    waste_exposure: number | null                        // spend share on non-buyer intents with zero conversions, 0-1
  }
  ```
- `coverage` at the top level is the overall visible-search-term spend ÷ total keyword spend.
- **`verdict` (3.1, additive).** One label per keyword for the cork-board view, decided in code with the engine's own rules, so a label and a suggestion can never disagree. Evaluate in this priority order and take the first match: `no_stock` (the keyword spent money in the window and `stock_count === 0`: clicks cannot become a sale), `testing` (the keyword is in the capped test group of new suggestions), `wasting` (the engine's significance rule says it is wasting money: enough clicks, zero conversions, or the same condition behind an open pause / negative suggestion), `winner` (enough clicks and a cost per conversion at or below the comparison the engine uses; never `winner` while an open pause suggestion exists for it), `needs_data` (below the significance thresholds, so no call can be made), otherwise `steady` (healthy, nothing notable). The backend chooses the exact thresholds and documents them in section 11 of the backend file. The frontend never recomputes a verdict.

`GET /settings` and `PUT /settings` (existing flat key/value object, validated per key in `settings.ts`) gain these keys, all strings: `keyword_optimizer_enabled` (`'true'|'false'`), `keyword_test_budget_share` (`'0'–'1'`), `keyword_min_confidence_p` (`'0'–'1'`, exclusive of 0), `inventory_allowed_spend_share` (`'0'–'1'`), `inventory_lead_to_sale_rate` (`'0'–'1'`). A bad value gets 400 `{detail}` from the existing handler. The connection string is **never** a setting and never appears here.

**Existing endpoints that need no change but whose consumers must handle the new run type:** `GET /pipeline/runs` and the Run Inspector will return `run_type: 'keyword_optimizer'`. The System Health page renders `run.run_type.replace('_', ' ')`, so it displays "keyword optimizer" with no code change; check any place that filters or colors by run type.

**Docs to update when this ships:** the app's API Reference page (`frontend/src/features/api-reference/`) and any API doc in the repo.

## 17. Build order (overview)

Detailed steps are in the backend and frontend files, section 17 of each. The order across them:

1. **Backend steps 1-7** (schema, demo data, intent, value tiers, inventory, engine, agent and cron). No frontend dependency.
2. **Frontend step 1: the Atom-Eve theme.** No backend dependency; can be done first, last or in parallel.
3. **Backend step 8: the API per section 13.** This is what makes the real endpoints exist.
4. **Frontend steps 2-5** (types and fixtures, the page, table extensions, settings/i18n/docs). Can start in parallel with backend steps 1-7 against fixtures that match section 13 exactly; switch to the real endpoints after backend step 8.
5. **Docs:** README, case study, Engineering Notes once both sides ship.
6. **Phase 2 (live ingestion)** is a separate decision.

Each side works one step at a time, stops, and reports before the next. The backend session has no git access: each backend step is delivered as full file contents, committed on this side first, same as every earlier change. Hand the backend session `overhaul-v3.md` **and** `overhaul-v3-backend.md`; hand a frontend session `overhaul-v3.md` **and** `overhaul-v3-frontend.md`.

## 18. Cross-cutting risks

| Risk | Mitigation |
|---|---|
| Claims outrun reality (live path untested) | Say "demo / API-shaped" everywhere; keep the test-access caveat in the case study |
| Backend and frontend disagree on the API contract | The contract exists in one place only (scope doc section 13, version 3.1); both implementers treat it as binding and report conflicts instead of improvising |

## 19. Open questions

1. **`INVENTORY_DB_STRING`:** confirmed a Postgres connection string. Still needed: the real table and column names (to write the adapter mapping). *(blocks backend step 5)*
2. Publish the read-only demo login? The live link (https://pitcrewai.my.id) lands on a login screen. *(owner decision, affects README/case study)*
3. `START_DATE`: keep and prefix history, or move and rebase offsets (7.2)? *(blocks backend step 2)*
4. Agent name for the keyword optimizer (placeholder "Kai"). *(affects backend (labels) and frontend (UI text))*
5. Real values for the value tiers and the `allowed_spend_share` / `lead_to_sale_rate` parameters. *(affects backend step 4/5)*
6. Auction insights: test one real query on a test account before building any competitor feature. *(before any competitor feature)*
7. Does the Reports list filter by `agent_type`? (section 4) *(backend must check before step 7)*
8. Theme: confirm the derived ink and tint colors (section 15.4) are acceptable, since the palette itself only provides fills. *(affects frontend step 1)*

## 20. Not in v3

Git-based deploy (two-repo issue), migration tool (node-pg-migrate 7.x works on Node 18.19), NVDA price-alert script (parked), ElevenLabs (parked), closed-loop attribution and any write to the Ads account (phase 3), competitor/auction-insight features, live ingestion (phase 2).
