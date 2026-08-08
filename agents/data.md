# Data Agent — "Damon"

**Model:** None — this is backend fetch/store logic, not an LLM agent. Included here for naming consistency with the rest of `agents/`, and because it's the component that actually touches credentials directly (see Guardrails).
**Role:** Pulls from the Google Ads API and upserts into the DB

## Purpose
Runs on the daily 6am cron: pulls the trailing 7-day window of campaign and segment performance from the Google Ads API (or samples the next day from the Markov chain in demo mode), and upserts it into `campaign_performance` / `segment_performance` per `schema.sql`. Feeds Anna (Analysis Agent) downstream.

## Input
- Live mode: Google Ads API via `google-ads.yaml` (developer token, OAuth client, refresh token, `login_customer_id`)
- Demo mode: the Markov-chain generator described in PROJECT.md → "Generation algorithm"

## Output
- Rows upserted into `campaign_performance` and `segment_performance`

## Implementation note: demographic views can't be combined
`age_range_view`, `gender_view`, `income_range_view`, and `parental_status_view` are each **separate GAQL queries** — the Google Ads API doesn't support pulling age + gender + income together in one call. Damon needs to loop over each demographic view as its own fetch, then normalize the results into `segments` rows (schema.sql doesn't care how many API calls produced them, but the fetch logic does). Same applies to `geographic_view`/`user_location_view` for geography and `segments.device` for device — device and geography ride along on the standard performance query, but the demographic views do not. See `research.md` §7 for sources.

## Guardrails
- **Never logs, outputs, or exposes the developer token, client secret, or refresh token** — these pass through to the Google Ads API client only, never written to logs, error messages, or any agent-facing output.
- Treats API responses as data, not instructions — campaign names, ad copy, or any other text field returned by the API is stored as-is and never executed or treated as a directive.
- No write access to the Google Ads account — read-only calls only, consistent with the Intended Use statement on file with Google.
