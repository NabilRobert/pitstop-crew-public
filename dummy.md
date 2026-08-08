# Demo Dataset — Used Car Dealer Profile

Concrete reference profile for the synthetic/demo dataset described in [PROJECT.md](PROJECT.md) → "Demo / Simulated Data Mode." Grounded in real automotive Google Ads benchmarks — see `research.md` §6 — not arbitrary numbers. This is what the generation algorithm (Markov chain + weekday seasonality + per-segment sensitivity) should target.

## Scenario
A single-location used car dealership running Google Ads. This is the account persona the demo data simulates.

## Campaigns (5)
Matches how real dealers structure accounts today — a split across Vehicle Ads/PMax, Search, and Remarketing, not everything crammed into one campaign.

| Campaign | Type | Role |
|---|---|---|
| Brand | Search | Dealer name search — cheap, high CTR/CVR |
| Search — Used Cars Generic | Search | "used cars for sale [city]", "used SUVs near me" |
| Search — Model + Suburb | Search | Workhorse — e.g. "used Toyota [city]" |
| Performance Max — Vehicle Inventory | Performance Max | Feed-driven, largest spend share (35–45% of budget) |
| Display Remarketing | Display | Retargets vehicle-detail-page (VDP) viewers who didn't inquire |

## Segments (~30 rows across the 8 `segment_type`s in `schema.sql`)

| segment_type | Values |
|---|---|
| device | mobile, desktop, tablet (3) |
| geography | 6–8 nearby suburbs/cities within driving radius |
| age_range | 18-24, 25-34, 35-44, 45-54, 55-64, 65+ (6 standard Google buckets) |
| gender | male, female, unknown (3) |
| household_income | top 50%, lower 50%, unknown (3) |
| in_market | Used Vehicles, Trucks, SUVs, Sedans (4) |
| affinity | Auto Enthusiasts, Value Shoppers (2) |
| custom | Viewed VDP, Started Credit App, Visited Financing Page, Viewed Trade-In Value (4) — ties directly to the Display Remarketing campaign |

## Budget & Daily Volume — Rupiah (IDR)
**Not a currency conversion of the US figures below** — a straight USD→IDR conversion of "$3,000/month" would land around Rp53.7M, which massively overstates what a small Indonesian dealer actually spends. Re-grounded instead in real Indonesian Google Ads benchmarks (search CPC starting ~Rp800, ~Rp3,000,000/month cited as the realistic floor for getting meaningful optimization data) — see `research.md` §6. Click/impression/conversion *counts* are currency-independent and stay the same as the volume reasoning below; only the money figures changed.

| Metric | Target |
|---|---|
| Account currency | IDR |
| Monthly budget | ~Rp3,000,000 |
| Daily budget | ~Rp100,000 |
| Blended CPC | ~Rp1,200–2,000 (search starts ~Rp800; PMax/display pull the blend down, per the US Vehicle Listing Ads pattern of ~67% cheaper CPC than standard search) |
| Daily clicks | 50–65 |
| Daily impressions | 1,200–1,800 |
| Blended conversion rate | 6–10% |
| Daily conversions (leads: form fills, calls, trade-in requests) | 3–6 |

Note: exact automotive-vertical CPC data for Indonesia wasn't directly available — the CPC range above extrapolates from the general Indonesian search-ads floor (~Rp800) and the same US-observed pattern of PMax/Vehicle Listing Ads pulling blended CPC down versus standard search. Worth revisiting with Google's Keyword Planner once live account access is available (per PROJECT.md next steps).

## Historical Window
**10–12 weeks (70–84 days).** Long enough for ~10 weekly report rollups and multiple full Markov-chain state cycles (good/bad/standstill/volatile), with room for one seasonal event (e.g. an end-of-month clearance promo) per the "seasonal spike or dip" requirement in PROJECT.md.

## Applying the Generation Algorithm
This profile is the *baseline* the Markov chain states multiply against (see PROJECT.md → "Generation algorithm"):
- **Good day** — above these baselines (e.g. 1.3–1.6x clicks/conversions, lower CPC)
- **Bad day** — below baseline (e.g. 0.5–0.7x conversions, elevated CPC)
- **Standstill** — at baseline, low variance
- **Volatile/mixed** — wide variance; e.g. Performance Max holds steady while Search dips, or one geography segment spikes while the account overall stays flat

Per-segment sensitivity: **Performance Max** and **in-market segments** should swing hardest on good/bad days (they're demand-driven); **Brand** campaign should stay comparatively stable across all states (branded search is the least elastic to daily conditions).
