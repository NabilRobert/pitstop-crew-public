# Pitstop v2 — Frontend Plan (full Google Ads API surface, Tier 1 + Tier 2)

See `docs/v2-backend-plan.md` for the backend half of this same plan — every stage here depends on that stage's API route landing first.

## Context

Pitstop currently models only campaign-level daily performance plus a thin segment dimension (device/geography/one custom remarketing bucket). This "v2" expansion fully utilizes the Google Ads API's surface — even though this app runs on synthetic demo data, not a live account — so the dashboard has real hierarchy and diagnostics to show instead of one flat number per campaign per day.

**Tier 1**: keywords + Quality Score, search terms, ads/creatives, impression share (+ why it's lost), named conversion actions, PMax asset groups.
**Tier 2**: Google's own Recommendations + Optimization Score, change history, demographic segments (age_range/household_income).

Two decisions already made:
- **New dashboard surface lives on drill-down pages**, not stacked onto the already-dense main Dashboard.
- **Build staged, one vertical slice at a time**, matching the backend plan's stage order — each stage's frontend slice is independently buildable/testable once its own API endpoint exists.

## Staged build order (mirrors the backend plan)

1. Ad groups + Keywords + Quality Score — first drill-down page.
2. Search terms.
3. Ads/creatives.
4. Impression share + why it's lost.
5. Named conversion actions.
6. PMax asset groups.
7. Recommendations + Optimization Score.
8. Change history.
9. Demographic segments — **zero new frontend work**, rides the existing `SegmentBreakdownChart.vue`.

## Drill-down page architecture

New route, e.g. `/campaigns/:id` (campaign detail page), reached via a click-through link from `CampaignTable.vue`'s existing rows on the main Dashboard — mirrors the existing `latestReportLink` pattern that already routes to `/reports/daily/:id` rather than inlining full report content on the dashboard. This new page hosts:
- Stage 1: ad group list → keyword table (with QS badges) per ad group
- Stage 2: search terms table (with "wasted spend" row highlighting)
- Stage 3: ad performance table (headline/description preview, ad strength)
- Stage 4: impression share section (Search campaigns only)
- Stage 6: PMax asset group chart (only rendered when viewing the PMax campaign)

Account-wide items get their own top-level nav entries instead of living inside a single campaign's detail page:
- Stage 5 (conversion actions): a chart on the main Dashboard (account-wide, not campaign-scoped) — closest existing analog is `SegmentBreakdownChart.vue`, reuse that as the template.
- Stage 7 (recommendations) + Stage 8 (change events): a new `/insights` (or similar) page, or a section on the main Dashboard — both are account/campaign-optional, episodic lists, not per-campaign drill-down content.
- Stage 9 (demographics): **zero new UI** — `SegmentPerformanceRow` is already generic over `segment_type`; once the backend generator populates `age_range`/`household_income`, they flow into the *existing* `/segments/performance` endpoint and `SegmentBreakdownChart.vue` automatically, same as `device`/`geography`/`custom` do today. Confirm this works before building anything.

## `frontend/src/shared/api/types.ts` — new interfaces per stage

`AdGroupPerformanceRow`, `KeywordPerformanceRow` (+ `quality_score`/`expected_ctr`/`ad_relevance`/`landing_page_experience`), `SearchTermPerformanceRow` (+ `wasted_spend`/`match_flavor`), `AdPerformanceRow` (+ `headlines`/`descriptions`/`ad_strength`), `ConversionActionRow`, `AssetGroupPerformanceRow` (+ `ad_strength`), `RecommendationRow`, `ChangeEventRow`. Extend existing `PerformanceRow` with `search_impression_share`/`search_budget_lost_impression_share`/`optimization_score` (all `number | null`).

## `frontend/src/shared/api/api.ts` — one line per stage

`adGroupPerformance`, `keywordPerformance`, `searchTermPerformance`, `adPerformance`, `conversionActionBreakdown`, `assetGroupPerformance`, `recommendations`, `changeEvents` — each following the exact `performance: (days=30) => request<...>(...)` pattern. `performance()`'s existing binding needs no signature change (return type just gains 3 optional fields).

## New components per stage (mirror existing `X.vue` + `useXChart.ts`/table pattern exactly)

- **Stage 1**: `KeywordTable.vue` (table — keyword text, match type, metrics, QS badge color-coded 1-10 with sub-score tooltip; mirrors `CampaignTable.vue`'s `<table>`/`columnHelp`/`formatNumber` pattern) + an ad-group list on the new campaign detail page.
- **Stage 2**: `SearchTermTable.vue` — adds one new visual affordance not in any existing table today: a conditional "wasted spend" row highlight (clicks > 0 && conversions = 0).
- **Stage 3**: `AdPerformanceTable.vue` — ad group, truncated headline/description preview, ad strength badge, metrics.
- **Stage 4**: `ImpressionShareChart.vue` + `useImpressionShareChart.ts` — **flagged deviation**: a stacked bar (share/budget-lost/rank-lost) is the right chart for this but breaks the codebase's "always exactly one dataset" convention (`chartTheme.ts`). Needs a genuinely new 3-dataset options object with `scales.x.stacked`/`scales.y.stacked: true`, plus 2-3 new `CHART_COLORS` palette entries kept in sync across both Ferrari/Blueprint themes by hand. This is real net-new charting work, size it accordingly — not a mechanical copy.
- **Stage 5**: `ConversionActionChart.vue` + `useConversionActionChart.ts` — mirrors `SegmentBreakdownChart.vue` (grouped-by-category bar) most closely.
- **Stage 6**: `AssetGroupBarChart.vue` + `useAssetGroupBarChart.ts` — mirrors `CampaignBarChart.vue`/`useCampaignBarChart.ts` exactly.
- **Stage 7**: `RecommendationsList.vue` — new pattern (card list: title, description, estimated impact, dismiss/applied badges). Check `frontend/src/features/learning/` first for a reusable card pattern before inventing one.
- **Stage 8**: `ChangeEventTimeline.vue` — new pattern (chronological list: date, resource, field changed, old→new value, changed by). Build simple, don't overengineer.
- **Stage 9**: no new component — confirm `SegmentBreakdownChart.vue` picks up the new segment types automatically.

## `MetricCard.vue` grid additions

New top-line KPIs, one-line additions to the existing grid (no new component): average Quality Score (stage 1), blended impression share + Optimization Score (stage 4).

`metrics.ts`'s `MetricDef` union is tied 1:1 to `PerformanceRow`'s count/currency fields — Quality Score and impression share are a different metric family (bounded 0-10 / 0-100%) and don't get force-fit into `TrendChart`'s toggle mechanism; they get their own dedicated chart/card instead.

## `frontend/src/shared/utils/format.ts` — one gotcha to catch early

`formatPercent(n, digits)` expects a 0-100 number; the new `search_impression_share`/`optimization_score` columns are 0-1 fractions. Every call site needs `formatPercent(row.search_impression_share * 100)` — flag this explicitly at stage 4 so it isn't silently rendered as "0.42%" instead of "42%".

## i18n (`frontend/src/i18n/en.ts` + `id.ts`, both files, every stage)

New top-level keys per new component (`keywordTable`, `searchTermTable`, `adPerformanceTable`, `assetGroupChart`, `impressionShareChart`, `conversionActionChart`, `recommendationsList`, `changeEventTimeline`), matching the existing `columns.*`/`columnHelp.*`/`noData` nesting. Extend `campaignGlossary` with plain-language explanations of the new jargon-heavy metrics (Quality Score, Impression Share, Optimization Score) — this app already has a glossary pattern, worth extending rather than leaving these unexplained.

## Frontend files touched

`frontend/src/shared/api/types.ts` · `frontend/src/shared/api/api.ts` · `frontend/src/shared/utils/format.ts` · `frontend/src/shared/utils/chartTheme.ts` · `frontend/src/features/dashboard/useDashboard.ts` · `frontend/src/features/dashboard/DashboardPage.vue` · `frontend/src/features/dashboard/CampaignTable.vue` (add drill-down link) · new campaign-detail page + route · `frontend/src/features/dashboard/{KeywordTable,SearchTermTable,AdPerformanceTable,AssetGroupBarChart+useAssetGroupBarChart,ImpressionShareChart+useImpressionShareChart,ConversionActionChart+useConversionActionChart,RecommendationsList,ChangeEventTimeline}.vue` (new) · `frontend/src/i18n/en.ts` · `frontend/src/i18n/id.ts`

## Verification (per stage, before moving to the next)

1. `npx vue-tsc -b --noEmit` + `npm run build`.
2. Browser: navigate to the new drill-down page/section, confirm it renders real data (against the now-live backend endpoint from that stage), no console errors.
3. Both Ferrari and Blueprint themes look right for any new chart.
4. Commit with a conventional-commit message once the stage's slice is fully verified end to end.
