# Pitstop v2 — Backend Plan (full Google Ads API surface, Tier 1 + Tier 2)

See `docs/v2-frontend-plan.md` for the frontend half of this same plan.

## Context

Pitstop currently models only campaign-level daily performance plus a thin segment dimension (device/geography/one custom remarketing bucket). This "v2" expansion fully utilizes the Google Ads API's surface — even though this app runs on synthetic demo data, not a live account — so the dashboard and the AI agents (Anna/Rico/Sammy/Ciri) have real hierarchy and diagnostics to reason about instead of one flat number per campaign per day.

Researched the actual Google Ads API surface (80+ resources, 400+ metrics) and cross-referenced against the existing "used-car-dealer" demo profile (5 campaigns: Brand, Search-Generic, Search-Model+Suburb [declining], PMax-Vehicle-Inventory, Display-Remarketing). Landed on 9 items across two tiers:

**Tier 1** (clear fit, high narrative value): keywords + Quality Score, search terms, ads/creatives, impression share (+ why it's lost), named conversion actions, PMax asset groups.
**Tier 2** (valuable, bigger lift): Google's own Recommendations + Optimization Score, change history, demographic segments (age_range/household_income — schema already supports these, just unused).

Build staged, one vertical slice at a time (schema → generator → API → UI → verify → commit, per item), not one giant batch.

## Cross-cutting design decisions

1. **Ad groups/keywords/ads/asset groups are genuinely new fact tables, not segment-like rows.** `segments`/`segment_performance` model *optional, orthogonal* cuts of a campaign's totals (device, geography — the same click can be cut multiple independent ways). Ad group → keyword → ad is a strict **containment hierarchy** (every keyword belongs to exactly one ad group), matching how the real API also models these as distinct resources, not segments of `campaign`.
2. **Quality Score: full score + all 3 diagnostic sub-scores** (`expected_ctr`, `ad_relevance`, `landing_page_experience`), stored **per day** on `keyword_performance` (not a static attribute) — lets QS visibly drift across the demo window and tie into the existing decline story.
3. **Impression share: store only the 2 independent numbers** (`search_impression_share`, `search_budget_lost_impression_share`) as new nullable columns on `campaign_performance`; derive rank-lost at read time (`1 - is - budget_lost`, clamped ≥ 0) rather than storing a 3rd number that could drift out of sync. Populate only for the 3 Search-type campaigns (Brand, Search-Generic, Search-Model) — real Google Ads doesn't expose this metric for PMax at all, and Display uses a different metric family entirely; leaving those `NULL` is itself a realistic detail.
4. **Optimization Score: also a new nullable column** (`optimization_score REAL`) on `campaign_performance` — same reasoning as impression share, a per-day-drift-able snapshot, not a new table.
5. **`segments.segment_type` CHECK needs no widening** — already includes `age_range`/`household_income`/`in_market`/`affinity` in the existing schema. Tier 2's demographics item is generator + `profile.ts` work only.
6. **Conversion actions get a first-class table + join-fact table**, not folded into `segments` — they need richer attributes (`category`, `counting_type`) than a bare segment string, and Tier 1 wants them treated as first-class named entities the LLM reasons about directly.
7. **Recommendations and change events are episodic/scripted, not generated inside the daily Markov loop.** They get a static, hand-authored list in `profile.ts` (same pattern as the existing `DECLINE_START_DAY`/`SEASONAL_SPIKE_START_DAY` scripted moments), upserted idempotently once, not derived fresh from `(date, seed)` every call. Seed one change event **exactly at `DECLINE_START_DAY` on `search_model`** (a budget/bid-strategy cut) so change history and the decline correlate causally — a genuine "why" story for Anna/Rico, not two disconnected features.
8. **Conversion action names are account-wide**, splitting every campaign's daily `conversions` total: `Test Drive Booked` (0.30), `Credit App Started` (0.20), `Phone Call` (0.30), `Financing Page Visit` (0.20). Two names deliberately echo Display's existing `custom` segment values (read as "same funnel, different view") — but Display's existing segment stays untouched, no migration.
9. **Token-budget risk is real — new agent-context builders must aggregate, not raw-dump.** `anna.ts` already documents `gpt-5-mini` truncating at the current, narrower prompt size. Keyword/search-term-level data for ~8 ad groups × ~4 keywords × ~3 search terms each is 1000+ rows for a 30-day window — new context builders default to **top-N aggregates** (top 10 by cost, top 10 "wasted spend" search terms), mirroring the existing `buildHistoricalSummary` pattern, never `buildPerformanceContext`'s raw-dump pattern.
10. **One shared `buildFullContext()` composes everything**, used by both the daily pipeline (`orchestrator.ts`) and the Ask feature (`ask.ts`) — so asking Aska/Ask "what's my Quality Score on Search-Model?" actually has data to answer from, not two divergent context-building paths.
11. **`dummy.md`/`PROJECT.md` get updated in the same commit as the `profile.ts` changes they document** — matches this repo's existing convention (`profile.ts`'s own header: "change the profile there first, then mirror it here").

## Staged build order

1. **Ad groups + Keywords + Quality Score** — foundational hierarchy level; first drill-down page (Campaign → Ad Groups → Keywords).
2. **Search terms** — depends on stage 1's keywords existing.
3. **Ads/creatives** — depends on stage 1's ad groups.
4. **Impression share + why it's lost** — independent, just new columns on `campaign_performance`.
5. **Named conversion actions** — independent, account-wide.
6. **PMax asset groups** — independent, scoped to the `pmax` campaign only.
7. **Recommendations + Optimization Score** — Tier 2, episodic/scripted.
8. **Change history** — Tier 2, episodic/scripted, correlated with stage 1-set-up decline story.
9. **Demographic segments (age_range, household_income)** — Tier 2, cheapest item: schema already ready, rides the *existing* `segments`/`SegmentBreakdownChart.vue` path with zero new frontend components.

## New DB tables

Append to bottom of `/Users/nabilrobert/Desktop/my-kerjaan-aku/google-ads/schema.sql`, idempotent style — `CREATE TABLE IF NOT EXISTS`, matching every existing convention: `SERIAL PRIMARY KEY`, nullable `google_<entity>_id TEXT` for future live-mode, `cost_micros BIGINT`, `impressions/clicks INTEGER DEFAULT 0`, `conversions REAL DEFAULT 0`, `date DATE`, a `UNIQUE` composite per fact table matching its grain, explicit `CREATE INDEX ... (date)` at the bottom.

### Stage 1 — ad groups + keywords
```sql
CREATE TABLE IF NOT EXISTS ad_groups (
    id SERIAL PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    google_ad_group_id TEXT, name TEXT NOT NULL, status TEXT,
    data_source TEXT NOT NULL CHECK (data_source IN ('live','demo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, name)
);
CREATE TABLE IF NOT EXISTS ad_group_performance (
    id SERIAL PRIMARY KEY, ad_group_id INTEGER NOT NULL REFERENCES ad_groups(id), date DATE NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    cost_micros BIGINT NOT NULL DEFAULT 0, conversions REAL NOT NULL DEFAULT 0,
    UNIQUE (ad_group_id, date)
);
CREATE TABLE IF NOT EXISTS keywords (
    id SERIAL PRIMARY KEY, ad_group_id INTEGER NOT NULL REFERENCES ad_groups(id),
    google_keyword_id TEXT, text TEXT NOT NULL,
    match_type TEXT NOT NULL CHECK (match_type IN ('exact','phrase','broad')), status TEXT,
    data_source TEXT NOT NULL CHECK (data_source IN ('live','demo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ad_group_id, text, match_type)
);
CREATE TABLE IF NOT EXISTS keyword_performance (
    id SERIAL PRIMARY KEY, keyword_id INTEGER NOT NULL REFERENCES keywords(id), date DATE NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    cost_micros BIGINT NOT NULL DEFAULT 0, conversions REAL NOT NULL DEFAULT 0,
    quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 10),
    expected_ctr TEXT CHECK (expected_ctr IN ('above_average','average','below_average')),
    ad_relevance TEXT CHECK (ad_relevance IN ('above_average','average','below_average')),
    landing_page_experience TEXT CHECK (landing_page_experience IN ('above_average','average','below_average')),
    UNIQUE (keyword_id, date)
);
```

### Stage 2 — search terms
Anchored to exactly one triggering keyword — a deliberate simplification vs. the real API's looser attribution.
```sql
CREATE TABLE IF NOT EXISTS search_terms (
    id SERIAL PRIMARY KEY, ad_group_id INTEGER NOT NULL REFERENCES ad_groups(id),
    keyword_id INTEGER REFERENCES keywords(id), text TEXT NOT NULL,
    match_flavor TEXT NOT NULL CHECK (match_flavor IN ('close_variant','broader')),
    data_source TEXT NOT NULL CHECK (data_source IN ('live','demo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ad_group_id, text)
);
CREATE TABLE IF NOT EXISTS search_term_performance (
    id SERIAL PRIMARY KEY, search_term_id INTEGER NOT NULL REFERENCES search_terms(id), date DATE NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    cost_micros BIGINT NOT NULL DEFAULT 0, conversions REAL NOT NULL DEFAULT 0,
    UNIQUE (search_term_id, date)
);
```

### Stage 3 — ads
```sql
CREATE TABLE IF NOT EXISTS ads (
    id SERIAL PRIMARY KEY, ad_group_id INTEGER NOT NULL REFERENCES ad_groups(id),
    google_ad_id TEXT, label TEXT NOT NULL, ad_type TEXT NOT NULL DEFAULT 'responsive_search_ad',
    headlines JSONB NOT NULL, descriptions JSONB NOT NULL, final_url TEXT, status TEXT,
    ad_strength TEXT CHECK (ad_strength IN ('poor','average','good','excellent')),
    data_source TEXT NOT NULL CHECK (data_source IN ('live','demo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ad_group_id, label)
);
CREATE TABLE IF NOT EXISTS ad_performance (
    id SERIAL PRIMARY KEY, ad_id INTEGER NOT NULL REFERENCES ads(id), date DATE NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    cost_micros BIGINT NOT NULL DEFAULT 0, conversions REAL NOT NULL DEFAULT 0,
    UNIQUE (ad_id, date)
);
```

### Stage 4 — impression share + optimization score
New columns, not new tables.
```sql
ALTER TABLE campaign_performance ADD COLUMN IF NOT EXISTS search_impression_share REAL;
ALTER TABLE campaign_performance ADD COLUMN IF NOT EXISTS search_budget_lost_impression_share REAL;
ALTER TABLE campaign_performance ADD COLUMN IF NOT EXISTS optimization_score REAL;
```
(`optimization_score` is populated here at stage 4 for convenience since it's the same column-only pattern, even though the *Recommendations* half of Tier 2 item 7 lands at stage 7.)

### Stage 5 — conversion actions
```sql
CREATE TABLE IF NOT EXISTS conversion_actions (
    id SERIAL PRIMARY KEY, google_conversion_action_id TEXT, name TEXT NOT NULL,
    category TEXT, counting_type TEXT, status TEXT,
    data_source TEXT NOT NULL CHECK (data_source IN ('live','demo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, data_source)
);
CREATE TABLE IF NOT EXISTS conversion_action_performance (
    id SERIAL PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    conversion_action_id INTEGER NOT NULL REFERENCES conversion_actions(id), date DATE NOT NULL,
    conversions REAL NOT NULL DEFAULT 0,
    UNIQUE (campaign_id, conversion_action_id, date)
);
```

### Stage 6 — PMax asset groups
```sql
CREATE TABLE IF NOT EXISTS asset_groups (
    id SERIAL PRIMARY KEY, campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    google_asset_group_id TEXT, name TEXT NOT NULL, status TEXT,
    data_source TEXT NOT NULL CHECK (data_source IN ('live','demo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, name)
);
CREATE TABLE IF NOT EXISTS asset_group_performance (
    id SERIAL PRIMARY KEY, asset_group_id INTEGER NOT NULL REFERENCES asset_groups(id), date DATE NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    cost_micros BIGINT NOT NULL DEFAULT 0, conversions REAL NOT NULL DEFAULT 0,
    ad_strength TEXT CHECK (ad_strength IN ('poor','average','good','excellent')),
    UNIQUE (asset_group_id, date)
);
```

### Stage 7 — recommendations
```sql
CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY, campaign_id INTEGER REFERENCES campaigns(id),  -- NULL = account-level
    google_recommendation_id TEXT, recommendation_type TEXT NOT NULL,
    title TEXT NOT NULL, description TEXT,
    impact_impressions_pct REAL, impact_conversions_pct REAL,
    dismissed BOOLEAN NOT NULL DEFAULT false, applied BOOLEAN NOT NULL DEFAULT false,
    generated_date DATE NOT NULL,
    data_source TEXT NOT NULL CHECK (data_source IN ('live','demo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, generated_date, recommendation_type, title)
);
```

### Stage 8 — change events
Deliberately flattened `field_changed`/`old_value`/`new_value` vs. the real API's full protobuf resource snapshots — far more directly quotable by Anna, no UI need for a full diff.
```sql
CREATE TABLE IF NOT EXISTS change_events (
    id SERIAL PRIMARY KEY, campaign_id INTEGER REFERENCES campaigns(id),  -- NULL = account-level
    google_change_event_id TEXT, changed_at TIMESTAMPTZ NOT NULL,
    resource_type TEXT NOT NULL, -- CAMPAIGN, CAMPAIGN_BUDGET, AD_GROUP, AD, KEYWORD, BIDDING_STRATEGY
    change_operation TEXT NOT NULL CHECK (change_operation IN ('CREATE','UPDATE','REMOVE')),
    field_changed TEXT, old_value TEXT, new_value TEXT, changed_by TEXT,
    data_source TEXT NOT NULL CHECK (data_source IN ('live','demo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, changed_at, field_changed)
);
```

### Stage 9 — demographics
No schema change (CHECK already covers `age_range`/`household_income`).

### Indexes
Append per stage, same pattern as existing `idx_campaign_performance_date`:
```sql
CREATE INDEX IF NOT EXISTS idx_ad_group_performance_date ON ad_group_performance(date);
CREATE INDEX IF NOT EXISTS idx_keyword_performance_date ON keyword_performance(date);
CREATE INDEX IF NOT EXISTS idx_search_term_performance_date ON search_term_performance(date);
CREATE INDEX IF NOT EXISTS idx_ad_performance_date ON ad_performance(date);
CREATE INDEX IF NOT EXISTS idx_conversion_action_performance_date ON conversion_action_performance(date);
CREATE INDEX IF NOT EXISTS idx_asset_group_performance_date ON asset_group_performance(date);
CREATE INDEX IF NOT EXISTS idx_recommendations_date ON recommendations(generated_date);
CREATE INDEX IF NOT EXISTS idx_change_events_changed_at ON change_events(changed_at);
```

## Demo-profile design (`backend/src/data/demo/profile.ts` additions, per stage)

- **Stage 1**: 8 static ad groups across `brand`/`search_generic`/`search_model` only (PMax has no ad groups in the real API; Display is deliberately excluded too to bound row count) — e.g. under `search_model`: `model_toyota` (0.35), `model_honda` (0.30), `model_suzuki` (0.20), `model_daihatsu` (0.15). 3-5 static keywords per ad group with per-keyword base Quality Score (6-8). QS for `search_model`'s keywords gets a date-driven erosion tied to the existing `declineMultiplier`: `qsToday = clamp(round(baseQS - (1-declMult)*3), 1, 10)` — so "QS dropped as the decline progressed" becomes a real, correlatable finding.
- **Stage 2**: per keyword, 1 `close_variant` + 1-2 `broader` search-term text templates (statically authored per keyword theme), quantities split off the parent keyword's totals.
- **Stage 3**: 2-3 static RSA-style ads per ad group (4-5 headlines, 2-3 descriptions each, themed per ad group), `ad_strength` loosely correlated with each ad's performance share.
- **Stage 4**: base impression-share values per Search campaign (`brand: 0.80, search_generic: 0.50, search_model: 0.35`), daily noise, extra erosion + budget-lost bias for `search_model` tied to the decline (makes "the decline is budget-driven, not a rank/competitiveness problem" a discoverable insight). Optimization Score: base 0.55-0.85 per campaign, daily noise, extra downward drift for `search_model` during its decline window.
- **Stage 5**: 4 account-wide conversion actions with fixed shares (listed in cross-cutting decision #8), split via the existing `splitConservingTotal` against every campaign's daily conversions.
- **Stage 6**: 4 static PMax asset groups themed by vehicle category (`SUVs & Crossovers` 0.35, `Sedans` 0.30, `Trucks & Pickups` 0.20, `Hatchbacks` 0.15), scoped to `pmax` only.
- **Stage 7-8**: static `RECOMMENDATIONS`/`CHANGE_EVENTS` arrays keyed by `dayOffset` (same pattern as `DECLINE_START_DAY`) — resolved to absolute dates in a new `backend/src/data/demo/scriptedEvents.ts`. One change event lands exactly at `DECLINE_START_DAY` on `search_model` (a budget/bid-strategy cut).
- **Stage 9**: `AGE_RANGES`/`HOUSEHOLD_INCOMES` arrays matching `dummy.md`'s existing table, split unconditionally across all 5 campaigns — added directly into `generateDay()`'s existing per-campaign segment loop (same code path as `DEVICES` today), no new code path needed.

**New reusable generator primitive** (`backend/src/data/demo/generator.ts`, used at every hierarchy level in stages 1/2/3/6): a "noisy conserving split" — perturb each day's static base shares via `entityRng(seed, day, childKey+':share-noise')`, re-normalize to sum to 1.0, then call the existing `splitConservingTotal(total, normalizedShares, '', 1.0)`. Gives believable day-to-day share wobble while exactly conserving the parent total, reusing the existing primitive rather than inventing a new one.

## Sync/wiring per stage

- `backend/src/data/demo/generator.ts`: extend `DayData` with new arrays per stage (`adGroups`, `keywords`, `searchTerms`, `ads`, `conversionActions`, `assetGroups`; demographics ride the existing `segments` array). Extend `CampaignDay` with `searchImpressionShare`/`searchBudgetLostImpressionShare`/`optimizationScore` (nullable).
- `backend/src/data/demo/scriptedEvents.ts` (new, stage 7): pure `getRecommendations()`/`getChangeEvents()` resolving `profile.ts`'s `dayOffset`s into absolute dates — same purity contract as `generateDay` (no `Date.now()`, no unseeded random).
- `backend/src/data/damon.ts`: extend `upsertDay`'s caller-owned `Map`s (one new pair per stage: `adGroupIds`/`keywordIds` at stage 1, etc.), copying the exact `campaignIdFor`/`getOrCreateCampaign` "check map, else resolve-and-cache by natural key + `data_source='demo'`" pattern. New `syncScriptedEvents()` (stage 7) idempotently upserts `scriptedEvents.ts`'s output via the `UNIQUE` constraints above, called unconditionally (cheap) from `syncTrailingWindow`'s demo branch.
- Live-mode (`syncLiveWindow`) stays out of scope this pass — every new table's nullable `google_<entity>_id` column means no schema change when live-mode is eventually extended.

## Agent-context layer

- `backend/src/data/context.ts`: one new builder function per stage (`buildAdGroupKeywordContext`, `buildSearchTermContext`, `buildAdContext`, `buildImpressionShareContext`, `buildConversionActionContext`, `buildAssetGroupContext`, `buildRecommendationsContext`, `buildChangeEventContext`, `buildDemographicContext`) — each `CURRENCY_NOTE + JSON.stringify(...)`, **aggregated top-N**, not raw dumps (decision #9). New `buildFullContext(args)` composes `buildPerformanceContext` + all builders added so far (grows one function at a time across stages).
- `backend/src/pipeline/orchestrator.ts`: `runAgentChain` switches from `buildPerformanceContext` to `buildFullContext` — one-line change, done once at stage 1, not per-stage.
- `backend/src/reporting/ask.ts`: same swap, same timing.
- `backend/src/agents/anna.ts` `SYSTEM_PROMPT`: append one paragraph (grows incrementally per stage, or written once covering all 9 items given Anna's prompt is the only one needing this) telling the model what new data types exist and when to use them. Confirmed: Rico/Sammy never see raw context directly, so no changes needed in `rico.ts`/`sammy.ts`.

## Structured API layer

- `backend/src/reporting/reporting.ts`: one new function per stage (`getAdGroupPerformance`, `getKeywordPerformance`, `getSearchTermPerformance`, `getAdPerformance`, `getConversionActionBreakdown`, `getAssetGroupPerformance`, `getRecommendations`, `getChangeEvents`), each following the exact `getSegmentBreakdown`/`getPerformanceSeries` shape (`days`/`endDate` params, one JOIN, raw rows). No new function for impression share/optimization score — they ride as extra `SELECT` columns on the existing `getPerformanceSeries` query (stage 4).
- New route files per stage, mounted in `backend/src/api/main.ts`'s existing flat `app.use(...)` list: `routes/adGroups.ts` (`GET /ad-groups/performance`), `routes/keywords.ts` (`GET /keywords/performance`), `routes/searchTerms.ts`, `routes/ads.ts`, `routes/conversionActions.ts`, `routes/assetGroups.ts`, `routes/recommendations.ts`, `routes/changeEvents.ts`. No new route for stage 4 (extends existing `/performance`) or stage 9 (extends existing `/segments/performance`).

## Backend files touched

`schema.sql` · `backend/src/data/demo/profile.ts` · `backend/src/data/demo/generator.ts` · `backend/src/data/demo/scriptedEvents.ts` (new) · `backend/src/data/damon.ts` · `backend/src/data/context.ts` · `backend/src/agents/anna.ts` · `backend/src/pipeline/orchestrator.ts` · `backend/src/reporting/ask.ts` · `backend/src/reporting/reporting.ts` · `backend/src/api/routes/{adGroups,keywords,searchTerms,ads,conversionActions,assetGroups,recommendations,changeEvents}.ts` (new) · `backend/src/api/main.ts` · `dummy.md` · `PROJECT.md`

## Verification (per stage, before moving to the next)

1. `npx tsc --noEmit`.
2. Re-run the demo sync for a date range (`syncTrailingWindow` or equivalent) and confirm new table row counts are sane and internally consistent (child rows sum to parent totals — spot-check with a `SUM(...) GROUP BY parent_id` query against the parent fact table).
3. Hit the new API endpoint directly (`curl` with an auth token) and confirm real rows come back with plausible values.
4. Trigger a real pipeline run (or Ask/Aska question touching the new data) and confirm Anna's analysis actually references the new context section at least once — proves the context actually reaches the model, not just that it's technically concatenated.
5. Commit with a conventional-commit message once the stage's slice is fully verified end to end.
