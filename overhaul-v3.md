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

- **Suggestions only, for now.** Nothing in Pitstop can change an account today, and nothing in this build adds that. The owner's stated end state (2026-10-06) is to **create campaigns and ads from inside Pitstop**. That arrives later as a separate, explicit write path (phase 4 below) with its own safety design, and only after the developer token has Basic Access. Until it ships, the README, case study and Engineering Notes remain accurate in saying nothing can change an account. (Offline conversion upload, also a write, is phase 3.)
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
| 9 | The AI should also propose **whole new campaigns** from the inventory (uncovered stock, aging or high-margin stock, proven keyword clusters, price-band or seasonal themes). **Approve** puts it in a Planned lane with a paste-ready brief; the end state is a guarded "Create in Google Ads" button (phase 4) | owner, 2026-10-06 |
| 10 | The AI should also **suggest ads** (like keywords and campaigns), built from the inventory and from keywords proven to be winners; creating a campaign with its ads from inside Pitstop is built first as a **simulation** written to the demo data and tagged SIMULATED. Copy = templates + model polish; dealer "Pitstop Used Cars", Tangerang, Gading Serpong, a placeholder WhatsApp number, no landing page yet; financing, trade-in, test drive and inspection claims are all allowed | owner, 2026-10-08 |
| 8 | New frontend theme named **Atom-Eve**, **not** the default (Ferrari stays default). Final direction: bold pop-art, a saturated pink ground with black type and outlines, modeled on a Dribbble pop-art storefront the owner chose (history: light, then dark, then this) | owner, 2026-10-06 |

## 3. Phasing

| Phase | What | Needs a write to the Ads account? |
|---|---|---|
| **1** | Intent per search term, intent mix per keyword, cached | No |
| **1** | Value tiers: conversion actions with values, keyword-level conversions by action | No |
| **1** | Deterministic engine + scheduled agent (daily at 06:00 by default, owner-set time, can be turned off) + suggestions UI + inventory | No |
| **2** | Live ingestion of keyword / search-term / negative data from the real API | No (read) |
| **4a** | **Ad suggestions and a SIMULATED launch** (section 3.6): same flow and safeguards, written only to the demo data | No (demo tables only) |
| **4b** | **Create campaigns and ads in Google Ads from Pitstop** (the owner's end state). Needs Basic Access, write scope, and the safeguards in section 3.1 | **Yes** (campaign / ad-group / ad mutations) |
| **3** | Closed-loop sale / margin attribution | **Yes** (offline conversion upload) — outside Pitstop's read-only stance, so it needs its own decision |
| **Later** | Competitor data (auction insights) | No |

Phase 1 is everything in the backend and frontend files unless stated otherwise.

### 3.1 Safeguards required before phase 4 (write to Google Ads) is built
Written down now so the later build cannot skip them: (1) creation is **paused by default** and with a capped daily budget; (2) a **validate-only** call runs first and the owner confirms on a screen that shows the exact request; (3) every write goes into an **audit log** in the Pitstop database (who, what, request, response, time); (4) a **kill-switch setting** disables the write path without a deploy; (5) the demo account can never reach it (server-side 403, like every other write); (6) the **monthly spend ceiling** and a per-campaign budget cap apply; (7) a created campaign can be paused or removed from Pitstop; (8) ad copy generated by a model is graded by Ciri and shown in full before anything is sent; (9) it is built only after Basic Access is granted and tested against a test account first.

### 3.6 Ads and simulated launches (added 2026-10-08)

The owner wants the AI to **suggest ads** the way it suggests keywords and campaigns ("I think this ad would work, here is why"), built from the **inventory** and from keywords the system has **proven to be winners**, and wants to try creating a campaign with its ads from inside Pitstop **as a simulation** first. Everything here is additive.

```ts
type SuggestionType = ... | 'new_ad'                          // 3.6; 'planned' (3.3) is now valid for new_campaign AND new_ad

type AdCheckFlags = {                                          // computed in code, shown by the UI; never the model's opinion
  limits_ok: boolean            // 3-15 headlines of at most 30 characters, 2-4 descriptions of at most 90, paths of at most 15
  numbers_from_facts: boolean   // every number in the copy comes from `facts`
  claims_allowed: boolean       // no claim the dealer profile does not allow (financing, trade-in, test drive, inspection)
}

interface NewAdPayload {
  kind: 'new_ad'
  target:
    | { kind: 'existing_ad_group'; ad_group_id: number }
    | { kind: 'proposed_campaign'; campaign_suggestion_id: number; ad_group_name: string }
  basis: 'new_campaign' | 'weak_ad' | 'uncovered_winner'      // why this ad: for a proposed campaign / replaces a poor-or-average ad / winners' wording appears in no headline
  headlines: { text: string }[]                                // 3-15, each at most 30 characters
  descriptions: { text: string }[]                             // 2-4, each at most 90 characters
  path1: string | null                                         // at most 15 characters
  path2: string | null
  final_url: string | null                                     // null until the dealer profile has a landing page (the demo has none)
  facts: {                                                     // everything the copy is allowed to say
    make: string | null; model: string | null
    units: number
    year_from: number | null; year_to: number | null
    price_from_idr: number | null; price_to_idr: number | null
    mileage_from_km: number | null
    dealer: string; city: string | null; area: string | null; whatsapp: string | null
    claims_used: ('installments' | 'trade_in' | 'test_drive' | 'inspection')[]
    snapshot_on: string
  }
  winner_keywords: { keyword_id: number | null; text: string }[]  // proven winners that shaped the wording
  replaces_ad: { id: number; label: string; ad_strength: 'poor' | 'average' | 'good' | 'excellent' | null } | null
  checks: AdCheckFlags
  polished: boolean                                            // true when the model reworded the template copy and it passed validation; false = template copy
}
// Add `| NewAdPayload` to the SuggestionPayload union.
```

**Lifecycle.** `new_ad` follows `new_campaign`: `open -> planned -> applied | dismissed`, with `planned -> open` as undo (`planned` is valid for these two types only).

**Settings (additive; flat strings in `/settings`, validated per key).** Dealer profile and what ads may claim:

| Key | Default | Valid |
|---|---|---|
| `dealer_name` | `'Pitstop Used Cars'` | non-empty, at most 40 characters |
| `dealer_city` | `'Tangerang'` | at most 40 characters, may be empty |
| `dealer_area` | `'Gading Serpong'` | at most 40 characters, may be empty |
| `dealer_whatsapp` | `'0812-5550-0123'` | a placeholder number for the demo; digits, spaces, `-`, `+`, at most 20 characters, may be empty |
| `dealer_landing_url` | `''` | empty, or an `http(s)://` URL; empty means ads carry `final_url: null` |
| `ads_claim_installments` | `'true'` | `'true'` or `'false'` |
| `ads_claim_trade_in` | `'true'` | same |
| `ads_claim_test_drive` | `'true'` | same |
| `ads_claim_inspection` | `'true'` | same |
| `ads_inspection_wording` | `'Unit sudah melalui pemeriksaan'` | at most 60 characters; the exact wording ads may use when inspection is allowed |
| `ads_write_enabled` | `'false'` | `'true'` or `'false'`: the **kill switch** for creating anything, simulated or not |
| `ads_write_mode` | `'simulated'` | only `'simulated'` is accepted for now; `'live'` is rejected with 400 until the write path exists |

**`Campaign` (from `GET /campaigns`) gains `simulated: boolean`** (true for a campaign created by a simulated launch; false for everything else).

**Launches.** `POST /launches` (owner only; demo gets 403). Body:

```ts
{ suggestion_id: number            // a PLANNED new_campaign (its planned ads are created with it) or a PLANNED new_ad on an existing ad group
  validate_only: boolean           // true = check and return what WOULD be created; writes nothing
  confirm_name: string }           // must equal the campaign name (new_campaign) or the ad group name (new_ad) exactly, else 400
```

200 returns a `Launch`:

```ts
interface Launch {
  id: number | null                // null for validate_only (nothing stored)
  created_at: string
  mode: 'simulated'               // 'live' later
  status: 'validated' | 'created' | 'failed'
  suggestion_id: number
  campaign: { id: number; name: string } | null     // null for validate_only
  objects: { kind: 'budget' | 'campaign' | 'ad_group' | 'ad' | 'keyword' | 'negative'; name: string; detail: string | null }[]
  messages: string[]               // what the simulation checked, and anything that failed
}
```

Rules: a campaign is created **paused** with the proposal's daily budget; it is written as `data_source: 'demo'` rows (campaign, budget, ad groups, keywords, negatives, ads) and appears in the campaign list with `simulated: true`; the proposal moves to `applied` with `linked_campaign` set. Errors: 403 demo; 409 `{detail: "Creating campaigns is switched off in Settings"}` when `ads_write_enabled` is false; 409 when the suggestion is not `planned`; 400 bad body, wrong type, or `confirm_name` mismatch; 404 unknown suggestion. **Every call, including validate-only and failures, writes an audit row** (who, when, request, result).

`GET /launches?limit=` (1-100, default 20): the audit log, newest first, `Launch[]` (validate-only attempts included, with `id: null` replaced by the audit row's own id so they can be listed; add `validate_only: boolean` to the item).

**Nothing in 3.6 sends anything to Google Ads.** The simulated writer implements an interface (`AdsWriter`) whose real implementation, for the API's mutate calls with validate-only first, comes with phase 4 and Basic Access; the UI and the safeguards do not change when it does.

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

## 13. API contract (version 3.6, 2026-10-08)

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
  | 'new_campaign'                    // 3.3: a whole new campaign proposal, see the payload below
type SuggestionStatus = 'open' | 'planned' | 'applied' | 'dismissed' | 'superseded'   // 3.3 adds 'planned'
type Basis = 'evidence' | 'prior'           // 'prior' = not yet backed by this account's data; show "unverified"
type Confidence = 'high' | 'medium' | 'low'
type MatchType = 'exact' | 'phrase' | 'broad'
type ValueTier = 'micro' | 'lead' | 'visit' | 'sale'

type CampaignBasis = 'uncovered_stock' | 'aging_stock' | 'proven_cluster' | 'theme'

interface NewCampaignPayload {                   // 3.3
  kind: 'new_campaign'
  basis: CampaignBasis                           // why the engine proposes it
  name: string                                   // suggested campaign name; also what links it to the real campaign later
  theme: string | null                           // e.g. 'Family cars under Rp 200 juta' for a theme campaign
  ad_groups: {
    name: string
    keywords: { text: string; match_type: MatchType; source: 'stock' | 'existing_keyword' | 'keyword_ideas' }[]
    vehicle_ids: number[]                        // the stock this ad group is for
  }[]
  starter_negatives: { text: string; match_type: MatchType }[]   // so the new campaign does not start by leaking spend
  budget: {
    daily_micros: number                         // suggested daily budget
    bound: 'floor' | 'ceiling' | null            // 3.4: set when daily_micros was clamped by that setting (campaign_daily_budget_floor_idr / _ceiling_idr); null when not clamped
    target_cpa_micros: number | null             // derived from margin x allowed spend share x lead-to-sale rate
    assumptions: { allowed_spend_share: number; lead_to_sale_rate: number }   // shown, because lead_to_sale_rate is a guess
  }
  stock: { units: number; avg_days_listed: number | null; avg_margin_idr: number | null; total_value_idr: number | null; snapshot_on: string }
  overlaps: { campaign_id: number; name: string; shared_keywords: number }[]  // existing campaigns already targeting some of this
}

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
  linked_campaign: { id: number; name: string } | null   // 3.3: set when a `planned` campaign shows up in the real data (same name), at which point status becomes 'applied'
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
  inventory: {                           // null when no stock link applies or inventory is unavailable. `new_campaign` rows always have null here: their stock figures are in payload.stock (one place, so the two can't disagree)
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
  | NewCampaignPayload
  | { kind: 'new_keyword'; text: string; match_type: MatchType; ad_group_id: number | null
      source: 'stock' | 'search_term' | 'keyword_ideas'; vehicle_ids: number[]; is_test: boolean }
  | { kind: 'raise_bid_candidate'; current_bid_micros: number | null; rank_lost_share: number }
```

**Endpoints (all new)**

`GET /keyword-suggestions`
- Query: `status` (default `open`; one of the statuses or `all`), `type`, `campaign_id`, `limit` (default 50, 1–200, else 400), `offset` (default 0).
- Order: `rank` ascending with nulls last, then `created_at` descending, then `id` ascending (one run's rows share a timestamp, and id ascending is the engine's own order).
- 200:
  ```ts
  { items: Suggestion[]; total: number
    run: { id: number; finished_at: string | null; status: 'running'|'success'|'failure'|'partial' } | null  // latest keyword_optimizer run
    inventory: { source: 'demo' | 'connected' | 'unavailable'; snapshot_on: string | null } }
  ```
- With no run yet: `items: []`, `total: 0`, `run: null`. That is a normal state, not an error.

`PATCH /keyword-suggestions/:id`
- Body: `{ "status": "applied" | "dismissed" | "open" | "planned" }`. Owner only (demo gets 403). `planned` is valid only for `type: 'new_campaign'` (anything else is 400).
- Allowed transitions: `open → applied`, `open → dismissed`, `applied → open`, `dismissed → open` (undo); for `new_campaign` also `open → planned`, `planned → open` (undo), `planned → dismissed`, and `planned → applied` (the owner created it in Google Ads by hand). The server also moves `planned → applied` by itself, and sets `linked_campaign`, when a campaign with the same name appears in the synced data. `superseded` is set only by the server; trying to change it returns 409; setting it returns 400.
- 200: the updated `Suggestion`. 400 invalid body or `:id`; 404 unknown id; 409 on a `superseded` row.

`GET /keyword-suggestions/export`
- Query: `type` (default `negative_keyword`; only that type is exportable in v3, else 400), `status` (default `open`), `format` (`csv` | `txt`, default `csv`).
- 200 with `Content-Disposition: attachment`.
- `csv` columns: `Campaign,Ad Group,Keyword,Criterion Type` with `Criterion Type` one of `Negative Exact | Negative Phrase | Negative Broad`. **VERIFY** these headers and values against a real Google Ads Editor export before relying on them (campaign-level negatives may need a different type value).
- `txt`: one keyword per line, formatted `[exact]`, `"phrase"` or bare `broad`.
- **Every field must be neutralized against spreadsheet formula injection**: if it starts with `=`, `+`, `-`, `@`, tab or carriage return, prefix it with `'`. Quote and escape CSV properly. Search-term text is untrusted input.

`GET /keyword-suggestions/:id/brief` (3.3)
- Only for `type: 'new_campaign'` (else 400). Query `format` = `csv` | `txt` (default `csv`). 200 with `Content-Disposition: attachment`, 404 unknown id.
- The paste-ready campaign brief: campaign name, daily budget, each ad group, each keyword with its match type, and the starter negatives, in an Editor-style CSV. **As built (3.4):** the header row is exactly `Campaign,Campaign daily budget,Ad group,Keyword,Criterion type,Status`; the campaign row has Status `Paused` so an import never starts spending; campaign-level negatives use `Campaign Negative Exact` / `Phrase` / `Broad`. The CSV is **UNVERIFIED** against a real Editor export, and the response says so in an `X-Editor-Columns: UNVERIFIED` header (CORS exposes it and `Content-Disposition`). Google's import guide says headers must be English and ignores case and spaces, and Editor's import dialog lets you re-map a column by hand, so the practical risk is low. Errors: 400 for a bad id, a bad format or a type other than `new_campaign`; 404 for an unknown id. Same formula-injection neutralization as the negatives export: every field is untrusted text. The `txt` form is a readable outline for pasting into a chat or a document.

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
    // --- added in 3.2: identity and status, so a campaign's page can list its CURRENT keywords ---
    text: string
    match_type: 'exact' | 'phrase' | 'broad'
    campaign: { id: number; name: string }
    ad_group: { id: number; name: string }
    status: 'enabled' | 'paused'                         // 'removed' keywords are not returned
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
- **3.2: the summary lists every keyword that is not removed, including enabled keywords with no activity in the window and paused ones.** Until now only keywords with performance rows were reachable, so a paused keyword, a brand-new one or one with zero impressions could not be shown, and the UI could not tell "paused" from "never ran". A keyword with no activity is returned with its identity fields, `status`, and honest empties (`intent_mix: null`, `conversions_by_action: []`, verdict `needs_data` or `testing`). A `paused` keyword never gets a `winner`/`wasting` verdict that implies action: use `steady` unless it is `no_stock`. Existing consumers are unaffected (all additions).
- **`verdict` (3.1, additive).** One label per keyword for the cork-board view, decided in code with the engine's own rules, so a label and a suggestion can never disagree. Evaluate in this priority order and take the first match: `no_stock` (the keyword spent money in the window and `stock_count === 0`: clicks cannot become a sale), `testing` (the keyword is in the capped test group of new suggestions), `wasting` (the engine's significance rule says it is wasting money: enough clicks, zero conversions, or the same condition behind an open pause / negative suggestion), `winner` (enough clicks and a cost per conversion at or below the comparison the engine uses; never `winner` while an open pause suggestion exists for it), `needs_data` (below the significance thresholds, so no call can be made), otherwise `steady` (healthy, nothing notable). The backend chooses the exact thresholds and documents them in section 11 of the backend file. The frontend never recomputes a verdict.

`GET /settings` and `PUT /settings` (existing flat key/value object, validated per key in `settings.ts`) gain these keys, all strings: `keyword_optimizer_enabled` (`'true'|'false'`), `keyword_test_budget_share` (`'0'–'1'`), `keyword_min_confidence_p` (`'0'–'1'`, exclusive of 0), `inventory_allowed_spend_share` (`'0'–'1'`), `inventory_lead_to_sale_rate` (`'0'–'1'`). **3.5** adds `keyword_optimizer_run_time` (default `'06:00'`, `HH:MM` in WIB, validated exactly like `daily_run_time`): when the keyword optimizer runs by itself each day. `keyword_optimizer_enabled` is that automatic run's on/off switch (default `'true'`): independent of `auto_reports_enabled`, and "Run now" works whichever way it is set. **3.4** adds `campaign_daily_budget_floor_idr` (default `'20000'`) and `campaign_daily_budget_ceiling_idr` (default `'100000'`): whole rupiah, digits only (surrounding spaces ignored), a safe integer above 0. Nothing checks the floor against the ceiling: a ceiling below the floor means the floor wins. A bad value gets 400 `{detail}` from the existing handler. The connection string is **never** a setting and never appears here.

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
| Backend and frontend disagree on the API contract | The contract exists in one place only (scope doc section 13, version 3.6); both implementers treat it as binding and report conflicts instead of improvising |

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
