# Google Ads AI Performance Dashboard

## Overview
A web app that pulls performance data from a Google Ads account via the Google Ads API, stores it over time, and uses an AI layer to analyze the data and surface actionable recommendations. Also tracks which **audience segments** (not individual users) respond best to which ads.

## Positioning — why this, not Google's own tools
The obvious question, from a technical or non-technical viewer alike: why not just use Google Ads' own Recommendations tab?

1. **Google's recommendations are structurally biased toward more spend, not better performance.** This isn't a hunch — it's documented: the Optimization Score is mathematically only maximized by accepting spend-expanding changes (broader match types, bigger budgets, expanded audiences), regardless of CPA or lead quality. Audits of accounts with 90%+ optimization scores regularly find 20–30% of spend wasted. See `research.md` §8. Rico's recommendations are the structural opposite: critic-verified, suggestions-only, never auto-applied, with no incentive to push spend up.
2. **One place to check, without opening Google Ads at all.** The dashboard, not the native Google Ads UI (which most people, technical or not, find cluttered and built for account management, not at-a-glance understanding).
3. **Fetched and presented, not dug for.** Data pulls automatically on schedule and is surfaced in a format built for understanding at a glance, not the reporting/table-building most PPC tools force on you.

## Core Goal
1. Pull campaign/ad performance data from Google Ads (impressions, clicks, cost, conversions, CTR, etc.)
2. Store this data historically (not just live snapshots) so trends can be detected
3. Feed structured performance data to an AI model to generate plain-language recommendations
4. Track and surface **audience segment performance** — which demographics, devices, locations, and in-market/affinity segments are converting best — to inform targeting decisions

## Important Constraint (Read First)
Google Ads does **not** expose individual user data — no names, no personal identifiers, no user-level activity logs. This is a privacy/policy boundary, not a technical limitation, and cannot be worked around.

What **is** available and useful:
- Aggregate demographic breakdowns (age range, gender, household income tier)
- Device type performance (mobile/desktop/tablet)
- Geographic performance (city/region level)
- Audience segment performance (in-market, affinity, custom segments) — performance by segment, not individual identities

The "save the types of users attracted to the ad" feature should be reframed and built as **audience segment performance tracking**, not user-level profiling.

## Account Structure
- Google Ads account currently has no live campaigns yet (empty at project start)
- API access requires a Google Ads **Manager Account (MCC)** — a standard client account cannot generate a developer token directly
- An MCC was set up and the working account linked to it

## Auth / API Setup Progress
1. ✅ Developer token obtained via API Center inside the MCC (Tools & Settings → Setup → API Center). Test account access level, pending Google's Basic Access review — **still pending**; live calls currently fail with `DEVELOPER_TOKEN_NOT_APPROVED`, confirmed against the real API (see "Live mode" below).
2. ✅ Intended Use statement submitted, describing this as a personal/single-account reporting + AI recommendation tool, read-only, no automated bid/budget changes.
3. ✅ OAuth Client ID + Secret created in Google Cloud Console (APIs & Services → Credentials → OAuth client ID), type **Web application**. Note from actually going through this: the console UI has moved to a "Google Auth Platform" layout (Overview / Branding / **Audience** / Clients / Data Access tabs) — Test users now live under **Audience**, not a section on the client page itself. The OAuth consent screen defaults to "Testing" status, which blocks *everyone*, including the developer, until their account is added there.
   - Authorized redirect URIs: needs the *exact* URI the auth flow requests, trailing slash included (`http://localhost:8080/`) — a mismatch here is `Error 400: redirect_uri_mismatch`, the most common snag in this whole flow.
4. ✅ Refresh token obtained — `backend/scripts/generateRefreshToken.ts` (`google-auth-library`'s `OAuth2Client`), run interactively by the user (this step can't be done by an AI agent — it's a real browser OAuth consent tied to a personal Google account). Uses `access_type=offline` + `prompt=consent` to force Google to re-issue a token even if an earlier attempt already completed a grant (Google only issues one on the very first grant otherwise). `gads-refresh-token` and `gads-login-customer-id` are both in `.env`.
5. ✅ Account access confirmed — the Google account used for OAuth needed to be explicitly added as a user on the MCC (`Tools & Settings → Access and security`) before the API stopped returning `NOT_ADS_USER`.

No `google-ads.yaml` file — credentials load straight from `.env` via the client library's config-object constructor, keeping every secret in the one place the rest of the app already uses (see `backend/src/googleAdsClient.ts`).

## Tech Stack Decisions
- **Backend language: TypeScript / Node** (`backend/`, Express) — was Python through early development; converted once the user decided a single-language stack (frontend already Vue/JS) was worth more than keeping Google's officially-maintained Google Ads client library. That trade-off is real and explicit: Python is one of the languages Google officially maintains a client for (alongside Java/PHP/Ruby/.NET/Perl); Node/TS has no official library, so live-mode Google Ads calls now go through `google-ads-api`, a community-maintained package. Everything else — schema, agent prompts, cron cadence, cost guardrails — ported over unchanged; only the implementation language changed. Full conversion was verified end-to-end against the real Postgres DB, Sumopod AI, Google Ads API, and email delivery before the Python version was deleted.
- **Frontend:** Vue 3 + Vite + Tailwind v4 (`frontend/`), deployed on **Vercel** — calls the backend, never calls Google Ads API directly, and never holds the client secret or refresh token. No login for v1 (decided) — this boundary stays open.
- **AI layer:** takes structured performance data (JSON from stored DB, not raw API calls) and generates recommendations via prompt. Should NOT have write access to make live changes to campaigns — recommendations only, surfaced to the user for manual action, at least in v1. **Per-agent model/provider assignments live in `agents/` — see that folder for the authoritative source, not this line**, to avoid the doc drifting out of sync with itself as agents get added or reassigned.

### Sub-agents
0. **"Orca" — Orchestrator** — simple dispatch logic ("go do this")
1. **"Damon" — Data agent** — not an LLM, the backend fetch/store logic. Pulls the trailing 7-day window from the Google Ads API (or samples the Markov chain in demo mode) and upserts into the DB
2. **"Anna" — Analysis agent** — trend/anomaly detection + audience segment performance, combined since both work off the same stored data
3. **"Rico" — Recommendation agent** — turns analysis output into plain-language, actionable suggestions
4. **"Sammy" — Summary agent** — periodic/on-demand digest, invoked separately only when needed
5. **"Ciri" — Critic agent** — not a pipeline step, cuts across all above. Its job is to find holes (weak evidence, thin sample size, overconfident claims, contradictions) in each agent's output and feed that criticism back into the originating agent for revision before anything surfaces to the user. Also assigns a strict A–F grade with a documented rubric — see `backend/src/critic.ts`.
6. **"Emil" — Email delivery agent** — not an LLM either, cross-cutting like Damon and Orca. Sends the finished report (or a failure alert) to the configured recipient — Resend primary, Gmail SMTP fallback — see `backend/src/emailDelivery.ts`.

**Model/provider assignment for each is in its file under `agents/`** — not repeated here, so this list can't drift out of sync with the actual per-agent spec the way it did before.

**Ask feature (decided):** Rico and Sammy are both queryable on-demand from the frontend, not just on the 6am schedule — follow-up questions about a specific report, answered against the same underlying stored data the report was generated from. See `agents/recommendation.md` and `agents/summary.md` for detail.

Kept lean for v1 (not one agent per data type) — single-user app doesn't need finer-grained separation yet; revisit if orchestration overhead becomes a bottleneck.

### Critic feedback loop / "self-improvement" (decided)
The critic doesn't retrain any model — API-based LLMs are stateless, nothing about daily use makes GPT-5 itself smarter. What *does* improve is the system: critic critiques are already stored via `ai_outputs.critiques_id` (see `schema.sql`), and recurring patterns in that history get periodically fed back into the Analysis/Recommendation/Summary agents' prompts, sharpening their instructions over time. This is a published pattern in LLM agent research — see `research.md` §5 (Reflexion) — not a novel mechanism. Explicit non-goal: no model fine-tuning in v1 — not enough volume as a single-user app to move a model meaningfully, and it's a much heavier pipeline than this project needs.

**Trigger mechanism (decided):** an automated **weekly** job reads the past week's critic critiques from `ai_outputs`, drafts a suggested prompt patch for whichever agent(s) show a recurring pattern, and surfaces that suggestion through the existing reporting channels (frontend + email) for manual review. **Not auto-applied** — the AI never edits its own instructions unsupervised; you approve and apply the patch by hand. This keeps the same "suggestions only" principle already used everywhere else in this project, applied to prompt changes too.

### Cost guardrails (decided)
Recommendation, Summary, and Critic all run on the expensive tier daily, indefinitely, unattended — worth a floor under it:
- **Provider-level budget cap + alert** — now routed through Sumopod (OpenAI-compatible gateway, see Tech Stack Decisions) rather than OpenAI directly, so this cap needs to be set in Sumopod's own dashboard, not OpenAI's. Not yet confirmed whether Sumopod exposes an equivalent spend-cap feature — worth checking.
- **Per-run cost logging** — each pipeline run's token usage (from the API response) is logged as part of the per-run log already decided under Automation, so cost trends are visible over time, not just the monthly total
- **Hard cap on critic revision passes** (e.g. max 2 revisions per agent per run) — prevents a pathological critique↔revise loop from spiraling before the monthly budget cap would even catch it
- **Data storage:** Postgres, hosted on Sumopod/Sumobase (`PITSTOP_DB_STRING`) — was SQLite through early development, migrated once a hosted instance was provisioned. Sits behind PgBouncer (port 6432, not Postgres's native 5432) — this bit the original Python/psycopg version (server-side prepared statements don't survive PgBouncer's transaction pooling, needed `prepare_threshold=None`), but node-postgres (`pg`, now used in `backend/src/db.ts`) doesn't name/cache prepared statements for plain queries by default, so it's unaffected — verified with 10 repeated identical parameterized queries before trusting it.

## Architecture
```
Browser (frontend)
   → Node/TypeScript backend (VPS)
      → Google Ads API (dev token + OAuth + refresh token) → pulls performance + segment data
      → Database (stores historical pulls)
      → AI model (reads stored data, generates recommendations)
   ← recommendations + performance data + audience insights flow back to frontend
```

## Deployment (decided)
- **Backend:** VPS via **Sumopod** — to be provisioned later
- **Frontend:** Vercel
- **Auth on backend↔frontend boundary:** none planned — single-user (just the account owner), no multi-tenant access needed for v1
- **Domain name:** deferred — using `localhost` placeholders until closer to deploy

No VPS provisioned yet.

## Immediate Next Steps
1. ✅ Database schema — `schema.sql` (campaigns, campaign_performance, segments, segment_performance, ai_outputs, ask_log, demo_state_overrides, pipeline_runs), applied to the real hosted Postgres DB
2. ✅ Synthetic/demo dataset — Markov chain generator with the deliberate decline/spike/outperforming-segment patterns, verified working
3. ✅ AI recommendation layer built and tested against the demo dataset — real end-to-end runs confirmed, including the critic loop correctly flagging thin-data overconfidence
4. ✅ Frontend built — Reports dashboard with the Demo Mode badge, verified against the real backend
5. ✅ Refresh token obtained (see Auth / API Setup Progress)
6. ✅ Live GAQL query tested against the real API — reaches Google correctly, currently blocked only by `DEVELOPER_TOKEN_NOT_APPROVED` (Basic Access still pending)
7. ⬜ Get at least one real campaign live and spending — once available, swap into the same pipeline built for demo mode
8. ✅ Hosting decided — VPS via Sumopod (not yet provisioned; deploy scripts in `backend/deploy/` are ready for when it is)
9. ✅ Data-fetching backend logic for live mode built (`backend/src/damon.ts`'s `syncLiveWindow`) — basic campaign performance only, per this list's original step 6 scope
10. ⬜ Testing/error handling: loading states, no-data states, API failure states, expired token handling — backend has failure alerting + dead-man's-switch; frontend loading/error states exist but haven't been stress-tested
11. ⬜ Security pass before making repo public: `.gitignore` for credentials (done), environment variables instead of hardcoded secrets (done), README note on missing credentials (not written yet)
12. ⬜ Write the README with screenshots/demo walkthrough and a short "why I built this" section

## Demo / Simulated Data Mode
Since the real Google Ads account has no live campaigns yet (and won't have meaningful historical data for weeks), the app should support a **Demo Mode** alongside live mode. This is not a throwaway hack — it's a permanent, valuable part of the product.

### Why
- Unblocks building/testing the AI recommendation layer immediately, without waiting on real campaign spend
- Lets portfolio reviewers try the app without needing real Google Ads credentials
- Doubles as a safe way to demo publicly without exposing real account data

### How it should be built
- **Same data schema, same AI pipeline, same frontend** as live mode — only the data source differs. This should be a toggle ("Live Google Ads Data" vs "Demo Data"), not a separate parallel build. Designing the data layer so it's source-agnostic (DB query either way) is itself a good architecture signal.
- **Clearly labeled in the UI** — a visible "Demo Mode" badge/banner at all times when active. Transparency here builds trust; don't let it look like real data if inspected.

### What the synthetic dataset needs to contain
Random numbers won't produce interesting AI insights — the synthetic data needs deliberate, realistic patterns so the AI layer has something real to detect and the demo actually sells the recommendation feature:
- At least one campaign with a **clear declining trend** (so the AI can flag it as an anomaly/warning)
- At least one **outperforming audience segment** (e.g. mobile users in a specific city converting notably better than average)
- A **seasonal spike or dip** (e.g. a holiday period, a promo window)
- One "obvious" insight (easy pattern, sanity-check that the AI layer works) and one "subtle" insight (buried in noise, shows the AI is actually doing real analysis, not just stating the obvious)
- Enough historical date range (several weeks minimum) for trend detection to be meaningful, not just a single snapshot

### Sequencing implication
Build and refine the AI insight/recommendation engine against this synthetic dataset **now**, rather than waiting on real data. Swap in live data later once real campaigns are running — no re-architecture needed if the data layer is built source-agnostic from the start.

### Generation algorithm (decided)
Modeled as a **Markov chain**, not flat random-per-day — each day's state depends probabilistically on the previous day's, biased toward persistence, so streaks/momentum emerge naturally instead of pure noise.

**4 states**, each mapping to a distribution profile for that day's metrics:
1. **Good day** — above-baseline CTR/conversions, efficient spend
2. **Bad day** — below-baseline, e.g. cost spike or conversion drop
3. **Standstill** — flat, low variance, nothing interesting
4. **Volatile/mixed** — wide variance; sometimes one segment spikes while the overall stays flat — this is what covers "mixes it up on occasion" as its own explicit state, not noise sprinkled on the other three

Layered on top of state:
- **Weekday seasonality** — weekend vs. weekday baseline multiplier
- **Per-segment sensitivity** — each segment has its own beta to the day's state, so some segments swing harder than others on a bad/good day, making outperformance look believable rather than uniform

**Determinism** — each day's data is a pure function of `(date, seed, forced_state?)`, so a given date always reproduces the same output unless overridden. Needed for the time machine below.

### Time Machine (decided)
Lets you fast-forward the simulated calendar and pin a specific state for a target day:
- Jumping forward silently fast-forwards the Markov chain through the skipped days (cheap — it's just math, no real work) to keep history continuous
- Pins your chosen state (good/bad/standstill/volatile) for the target day
- After that, the chain resumes normal randomized transitions from wherever you pinned it — steering the simulation, not breaking its continuity

### Cron (decided)
Demo mode reuses the **same 6am cron job** as live mode — it just advances the simulated calendar by one day and samples the next state via the Markov chain, exercising the identical automation path (pull → store → agent pipeline → report) that live mode will use.

## Automation (decided)
- **Fully autonomous daily run** — a cron job on the VPS pulls data, runs the agent pipeline, and generates recommendations every day at **6am**, with no manual trigger needed.
- **Daily pull re-fetches a trailing window (last ~7 days), not just "yesterday"** — Google Ads conversions can be attributed days after the click, so a single-day pull would under-report recent days and never correct itself. Re-fetching and upserting the trailing window each run keeps historical data accurate as delayed conversions land.
- **Two report cadences, both at 6am:**
  - **Daily report** — fast feedback, generated every run
  - **Weekly report** — a rollup generated once a week, smoothing over day-to-day noise/conversion lag for a more stable trend read than the daily report alone can give
- **Reporting channels (both):**
  - A **Reports section on the frontend** — daily and weekly outputs both stored and shown there
  - **Email** via a provider — same reports pushed out at 6am
- **Failure alerting uses the same two channels** — if the pipeline fails (expired token, API error, etc.), that failure is surfaced on the frontend and via email too, not just silently skipped. This matters more once the system is unattended.
- **Per-run logging** — separate from failure alerts. Every run (success or failure) logs what was pulled, what each agent produced, and what the critic flagged, so quality issues (a bad or boring recommendation on an otherwise "successful" run) are debuggable after the fact, not just uptime issues.
- **Dead-man's-switch monitoring (decided)** — failure alerting only fires if the pipeline runs and then fails; it says nothing if the cron job never fires at all (VPS reboot, systemd misconfig, disk full). Add an external heartbeat check that expects a daily ping and alerts if one doesn't arrive, so a silently-not-running pipeline gets caught too.
- **Email provider (decided): Resend**, with Gmail SMTP using the user's own address as a simple fallback — either works fine at single-user volume.
- **Cron mechanism: plain crontab** for v1 — least moving parts, survives reboots on its own, doesn't require the backend web process to stay running. A systemd timer is a cheap upgrade later if built-in logging (`journalctl`) becomes worth the extra setup. Deploy scripts/instructions are in `backend/deploy/` — written ahead of actually provisioning the VPS, ready to use once it exists.
- **Database backup (decided, resolved the earlier Known Gap):** Sumopod/Sumobase's own backup policy for the hosted Postgres instance isn't documented anywhere findable, so this doesn't rely on it — `backend/scripts/backupDb.ts` runs `pg_dump` (custom format, `pg_restore`-compatible) daily at 5:30am, ahead of the 6am pipeline, with a 14-day local retention window. Verified against the real hosted DB: produces a valid dump covering all 8 tables, and old backups actually get pruned. Off-site upload (S3/Backblaze) isn't wired up yet — local-to-the-VPS retention only for now.
- **WhatsApp (WAHA)** — deferred to v2, see below.

## Standout Features (decided, v1)
Beyond the core pipeline — the features meant to make this demo-able, not just functional.

1. **Time Machine + Ask, combined.** The Time Machine (fast-forward the demo calendar, pin a state) and the Ask feature (Rico/Sammy queryable on-demand) aren't separate — asking Rico "what happens if next week is bad?" actually fast-forwards the simulation and generates a live projected report in the chat, right there. Composes two already-decided pieces; no new architecture needed.
2. **Visible agent pipeline trace.** Instead of a single "Generate Report" button producing a final answer, the frontend shows the pipeline running step by step: Damon pulling data → Anna analyzing → Rico drafting → Critic flagging a hole → Rico revising → Sammy summarizing. Makes the multi-agent architecture visible instead of a black box.
3. **"Why" trail on every recommendation.** `ai_outputs.critiques_id` already stores the full critic revision history (see `schema.sql`) — currently invisible. Click into any recommendation to see the original draft, what Critic flagged, and the revision. Cheapest of the three to build since the data already exists; it's what proves the critic loop is real rather than a slide in a pitch deck.
4. **Retrospective accuracy tracking.** A "track record" panel showing how past recommendations actually checked out once later data came in — did a flagged decline keep declining, did a segment bet pay off. Closes the loop the human-in-the-loop research in `research.md` §3 flags as usually missing: an AI that suggests but is never checked against outcomes. Aimed at a technical audience — proof the system is honest about its own hit rate, not just confident-sounding.
5. **System health page.** Surfaces the per-run logging already decided under Automation (cost per run, critic revision counts, dead-man's-switch status, last successful run) as an actual UI panel, not just backend logs. Shows the system is designed to run unattended, not just demoed on the happy path.
6. **Deterministic replay.** A "replay this day" button that re-runs any historical date in demo mode and reproduces the identical output, since generation is seeded (see "Generation algorithm" above). Reproducibility as a visible feature.
7. **Impact-framed recommendations.** Rico's suggestions come with an estimated impact ("could lift conversions ~15% based on similar past patterns"), carefully hedged so it doesn't violate the "don't overstate on thin data" design principle. Aimed at a non-technical audience — a number lands better than a paragraph of caveats.
8. **Guided "Story Mode" walkthrough.** The synthetic dataset already has a deliberate decline, seasonal spike, obvious insight, and subtle insight built in (see "What the synthetic dataset needs to contain") — currently invisible unless someone digs. Narrate the timeline as a business story for a non-technical viewer ("Week 3, this campaign started slipping. Anna caught it before it hit spend. Rico suggested reallocating to the SUV segment...") while every narrated beat is clickable into the pipeline trace (#2) and why-trail (#3) for a technical viewer. One experience, two depths — not two separate demos.

## Known Gaps (noted, not yet decided)
- **Frontend has no auth and is publicly deployed on Vercel.** The "no auth" decision elsewhere is about the backend↔frontend API boundary, not the Reports UI itself — anyone with the URL can currently see real ad performance data. Needs a decision (password gate vs. accepting security-through-obscurity for v1).

## V2 / Future Plans

### Full Google Ads API surface — reporting depth (decided, in progress)
See [docs/v2-backend-plan.md](docs/v2-backend-plan.md) (and its frontend counterpart) for the full staged plan — a separate initiative from "Full Google Ads API utilization" below, which is about eventually gaining *write* access. This one stays entirely read-only reporting: 9 items across two tiers (keywords/Quality Score, search terms, ads, impression share, conversion actions, PMax asset groups, Google's own Recommendations + Optimization Score, change history, demographic segments), built one vertical slice at a time. Stage 1 (ad groups + keywords + Quality Score) is live; see `dummy.md`'s "v2 Stage 1" section for the profile.

### Full Google Ads API utilization
v1 deliberately uses a thin, safe slice of the API — read-only reporting plus suggestions-only AI (see Positioning). v2's goal is to actually use the rest of what the API can do, still gated by human approval, not by re-adopting v1's blanket "no writes" rule wholesale. Candidates, roughly ordered by how well they fit the existing no-auto-apply philosophy:

1. **Offline conversion import.** Upload real outcomes (lead → actual car sale) back to Google after the fact. Not a targeting/bid/budget change — it's ground-truth data flowing in, not control flowing out — so it fits the v1 philosophy better than anything else on this list. Directly strengthens the retrospective accuracy tracking Standout Feature: `ai_outputs.outcome` could be judged against real sales instead of just later ad performance data.
2. **Change history.** Pull the account's audit log (including manual changes made outside the API) so Anna can explain *why* a shift happened ("a human changed this bid on day X"), not just that it happened.
3. **Bid strategy & budget management (with approval gate).** Actually apply Rico's suggestions — but only after explicit user approval, preserving the "suggestions surfaced, human decides" principle. This is the natural v2 evolution of "recommendations only": from read-only advice to one-click-approved action, never silent auto-apply.
4. **Conversion value rules.** Let approved adjustments (device/location/audience-based value weighting) feed Smart Bidding more precisely, once real conversion volume exists to justify it.
5. **Experiments (A/B testing).** Test a Rico suggestion against a control before fully committing — turns "trust the recommendation" into "verify the recommendation," which is an even stronger version of the critic-loop philosophy already in place.
6. **Campaign/ad group/ad/keyword creation (with approval gate).** Full CRUD, same approval-gated model as #3 — furthest from v1's scope, so last on this list.
7. **Generative AI asset creation** (`AssetGenerationService`) — Google's own API can generate ad text/images. Worth deliberately deciding whether this project's AI *writes ads* or stays scoped to *analyzing performance*, since those are different products.
8. **Not adopted, by principle:** Customer Match / audience list uploads using real customer data — conflicts with the "aggregate segments, never individual identities" design principle even in v2. Revisit only if that principle itself is revisited.

### Simulation continues in v2, not just v1
The account still won't have meaningful live campaign history by the time v2 work starts. Demo mode isn't a v1 bridge to be discarded — it needs to extend to cover whatever new write capabilities v2 adds: simulating what a bid strategy change or an approved budget shift *would* do, since there's no live account with enough traffic to safely test against yet. Same Markov-chain/Time-Machine engine, extended scope.

- **Multi-vertical demo swap.** Regenerate the same synthetic-data engine for a different business type on the fly, not just the used-car-dealer profile in `dummy.md`. Proves the engine is a generalizable product rather than a one-off script — deferred since `dummy.md` alone is enough to prove the concept for v1.
- **Distinct agent voice/personality in report text.** Since the agents are characters now (Damon, Anna, Rico, Sammy, Critic, Orca), give each a distinct tone in the actual generated text — Anna terse and clinical, Rico persuasive, Sammy concise/executive, Critic blunt and skeptical. Pure prompt engineering, no new infrastructure — deferred to v2 simply to keep v1 scope focused on the three Standout Features above.
- **WhatsApp via WAHA** — add as a third reporting/alerting channel alongside frontend + email. WAHA self-hosts a real WhatsApp Web session (via whatsapp-web.js/Baileys) behind a REST API — cheaper and faster to stand up than the official WhatsApp Business API (WABA, which needs Meta business verification and pre-approved message templates), but it's unofficial: automating a personal WhatsApp number risks the account being restricted, and the session can silently log out. Not adopted for v1 since email + frontend already cover delivery and failure alerting reliably; revisit once the core pipeline is stable. Telegram's official Bot API is a lower-risk alternative if a chat-style push is wanted sooner.

## Design Principles to Keep
- AI recommendations are **suggestions only** in v1 — no auto-applied bid/budget/targeting changes. Google Ads changes can burn budget fast if a script or AI is wrong.
- Never expose client secret or refresh token in frontend code.
- Frame all "audience" features around aggregate segments, never individual user identities.
- Wait for a couple weeks of real campaign data before trusting/relying on AI-generated recommendations — thin data produces misleading suggestions.
