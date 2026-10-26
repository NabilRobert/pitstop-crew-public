-- Google Ads AI Performance Dashboard — Postgres schema (v1), hosted on
-- Sumopod/Sumobase. Was SQLite through early development; migrated once a
-- hosted Postgres instance (PITSTOP_DB_STRING) was provisioned.
-- Source-agnostic: `data_source` on campaigns lets the same tables serve
-- both live and demo data, switched by the UI toggle described in PROJECT.md.

CREATE TABLE IF NOT EXISTS campaigns (
    id                SERIAL PRIMARY KEY,
    google_campaign_id TEXT,                 -- NULL for demo campaigns
    name              TEXT NOT NULL,
    status            TEXT,                  -- e.g. 'enabled', 'paused', 'removed'
    data_source       TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Daily campaign-level performance (impressions, clicks, cost, conversions).
CREATE TABLE IF NOT EXISTS campaign_performance (
    id             SERIAL PRIMARY KEY,
    campaign_id    INTEGER NOT NULL REFERENCES campaigns(id),
    date           DATE NOT NULL,
    impressions    INTEGER NOT NULL DEFAULT 0,
    clicks         INTEGER NOT NULL DEFAULT 0,
    cost_micros    BIGINT NOT NULL DEFAULT 0,   -- Google Ads API convention: currency in micros
    conversions    REAL NOT NULL DEFAULT 0,
    UNIQUE (campaign_id, date)
);

-- Dimension table: one row per distinct segment value (device, geography,
-- demographic bucket, in-market/affinity/custom audience).
CREATE TABLE IF NOT EXISTS segments (
    id            SERIAL PRIMARY KEY,
    segment_type  TEXT NOT NULL CHECK (segment_type IN (
                      'age_range', 'gender', 'household_income',
                      'device', 'geography', 'in_market', 'affinity', 'custom'
                  )),
    segment_value TEXT NOT NULL,               -- e.g. 'Mobile', '18-24', 'Jakarta, ID'
    UNIQUE (segment_type, segment_value)
);

-- Daily performance broken out by segment, per campaign.
CREATE TABLE IF NOT EXISTS segment_performance (
    id             SERIAL PRIMARY KEY,
    campaign_id    INTEGER NOT NULL REFERENCES campaigns(id),
    segment_id     INTEGER NOT NULL REFERENCES segments(id),
    date           DATE NOT NULL,
    impressions    INTEGER NOT NULL DEFAULT 0,
    clicks         INTEGER NOT NULL DEFAULT 0,
    cost_micros    BIGINT NOT NULL DEFAULT 0,
    conversions    REAL NOT NULL DEFAULT 0,
    UNIQUE (campaign_id, segment_id, date)
);

-- Output from every AI sub-agent (Anna/analysis, Rico/recommendation,
-- Sammy/summary, critic). Critic rows link back to the output they
-- critiqued via `critiques_id`; a revised draft links back to the draft
-- it revised via `revises_id` — the two are distinct so the full chain
-- (original draft -> critique -> revision) is reconstructable for the
-- "why trail" Standout Feature, not just the latest content overwritten
-- in place. `status` tracks where a row sits in that chain.
-- `outcome`/`outcome_checked_at` back the retrospective accuracy
-- tracking Standout Feature — set later, once real outcome data exists,
-- not at generation time.
CREATE TABLE IF NOT EXISTS ai_outputs (
    id                  SERIAL PRIMARY KEY,
    agent_type          TEXT NOT NULL CHECK (agent_type IN (
                            'analysis', 'recommendation', 'summary', 'critic'
                        )),
    campaign_id         INTEGER REFERENCES campaigns(id),   -- NULL if account-wide
    segment_id          INTEGER REFERENCES segments(id),    -- NULL if not segment-specific
    critiques_id        INTEGER REFERENCES ai_outputs(id),  -- set only on critic rows
    revises_id          INTEGER REFERENCES ai_outputs(id),  -- set only on revised drafts -> the draft it revised
    report_date         DATE,                  -- the demo/live "as-of" date this output concerns —
                                                 -- NOT the same as created_at, which is wall-clock
                                                 -- insert time and can drift from report_date once
                                                 -- Time Machine fast-forwards demo mode ahead of "today"
    period              TEXT CHECK (period IN ('daily', 'weekly')),  -- which cadence produced this row;
                                                 -- NULL was possible pre-migration, always set going forward
    content             TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                            'draft', 'revised', 'approved', 'flagged'
                        )),
    outcome             TEXT CHECK (outcome IN ('correct', 'incorrect', 'inconclusive')),
    outcome_checked_at  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Strict A-F grading + structured per-issue quotes, set only on critic
-- rows (parallel to critiques_id/revises_id above) — backs the grade
-- badge and the inline highlight-on-hover UI. See backend/src/critic.ts
-- for the rubric these are graded against.
ALTER TABLE ai_outputs ADD COLUMN IF NOT EXISTS grade TEXT CHECK (grade IN ('A', 'B', 'C', 'D', 'F'));
ALTER TABLE ai_outputs ADD COLUMN IF NOT EXISTS grade_rationale TEXT;
ALTER TABLE ai_outputs ADD COLUMN IF NOT EXISTS issues JSONB;

-- Weekly critic-pattern -> suggested-prompt-patch drafts (weeklyFeedback.ts).
-- Previously only ever emailed and discarded; persisted now so the
-- Learning page can show a history of what's actually been suggested,
-- alongside the flag-rate trend (backend/src/learning.ts).
CREATE TABLE IF NOT EXISTS weekly_feedback_suggestions (
    id         SERIAL PRIMARY KEY,
    week_of    DATE NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- On-demand Q&A against Anna, Rico, or Sammy, tied to the report being asked
-- about. Backs the Ask feature (agents/analysis.md, agents/recommendation.md,
-- agents/summary.md) and the Time Machine + Ask Standout Feature.
CREATE TABLE IF NOT EXISTS ask_log (
    id          SERIAL PRIMARY KEY,
    output_id   INTEGER NOT NULL REFERENCES ai_outputs(id),
    agent_type  TEXT NOT NULL CHECK (agent_type IN ('analysis', 'recommendation', 'summary')),
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Conversation threads for the Ask feature — a report can have several,
-- picked/started from the Ask panel; ask_log.conversation_id (below) ties
-- each Q&A row to the thread it belongs to, which is what lets a
-- follow-up question ("how does that compare to Brand?") be answered with
-- the rest of its own thread folded back into the prompt. title is NULL
-- until the thread's first question lands (see ask() in reporting/ask.ts),
-- which becomes the title verbatim.
CREATE TABLE IF NOT EXISTS ask_conversations (
    id          SERIAL PRIMARY KEY,
    output_id   INTEGER NOT NULL REFERENCES ai_outputs(id),
    title       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ask_conversations_output ON ask_conversations(output_id);

-- output_id is kept on ask_log as-is (harmless redundancy with the join
-- through conversation_id) rather than removed, since nothing forces a
-- migration to touch it.
ALTER TABLE ask_log ADD COLUMN IF NOT EXISTS conversation_id INTEGER REFERENCES ask_conversations(id);

-- One-time backfill for ask_log rows that predate the conversation concept
-- (conversation_id IS NULL) — groups each output_id's pre-existing rows
-- into one "legacy" thread per output, rather than orphaning that history.
-- Idempotent: after the first run, no ask_log row is left with
-- conversation_id IS NULL, so both statements become no-ops on any later
-- run of this file.
WITH legacy AS (
    INSERT INTO ask_conversations (output_id, title, created_at, updated_at)
    SELECT output_id, 'Earlier questions', MIN(created_at), MAX(created_at)
    FROM ask_log
    WHERE conversation_id IS NULL
    GROUP BY output_id
    RETURNING id, output_id
)
UPDATE ask_log al
SET conversation_id = legacy.id
FROM legacy
WHERE al.output_id = legacy.output_id
  AND al.conversation_id IS NULL;

-- General "Ask Aska" Q&A (docs/VOICE_ASSISTANT.md), not scoped to one
-- report output the way ask_log is — separate table rather than a
-- nullable ask_log.output_id, since a nullable FK there would need its
-- own discriminator to tell "general question" apart from "an ask_log
-- row that just hasn't been linked yet."
CREATE TABLE IF NOT EXISTS assistant_ask_log (
    id         SERIAL PRIMARY KEY,
    question   TEXT NOT NULL,
    answer     TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assistant_ask_log_created ON assistant_ask_log(created_at);

-- Conversation threads for Ask Aska — mirrors ask_conversations above, but
-- with no output_id to scope by, since Aska isn't tied to a single report:
-- just one flat list of threads instead of one list per output.
CREATE TABLE IF NOT EXISTS assistant_conversations (
    id          SERIAL PRIMARY KEY,
    title       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE assistant_ask_log ADD COLUMN IF NOT EXISTS conversation_id INTEGER REFERENCES assistant_conversations(id);

-- One-time backfill, mirroring ask_log's — but no GROUP BY output_id
-- needed, since there's only ever one flat list here: it collapses into a
-- single legacy thread. The HAVING COUNT(*) > 0 guard is load-bearing for
-- idempotency, unlike ask_log's version: a bare aggregate with no GROUP BY
-- always produces exactly one output row (MIN/MAX as NULL) even when zero
-- input rows match the WHERE clause, unlike a grouped aggregate, which
-- correctly produces zero rows for zero groups. Without this guard, every
-- re-run of this file after the first would insert a fresh spurious
-- "Earlier questions" thread with NULL timestamps.
WITH legacy AS (
    INSERT INTO assistant_conversations (title, created_at, updated_at)
    SELECT 'Earlier questions', MIN(created_at), MAX(created_at)
    FROM assistant_ask_log
    WHERE conversation_id IS NULL
    HAVING COUNT(*) > 0
    RETURNING id
)
UPDATE assistant_ask_log
SET conversation_id = (SELECT id FROM legacy)
WHERE conversation_id IS NULL;

-- Time Machine pins for demo mode: forcing a specific state for a future
-- date. Generation stays a pure function of (date, seed, forced_state),
-- so this table is the only place state gets overridden from the default
-- Markov-chain draw.
CREATE TABLE IF NOT EXISTS demo_state_overrides (
    date          DATE PRIMARY KEY,
    forced_state  TEXT NOT NULL CHECK (forced_state IN ('good', 'bad', 'standstill', 'volatile')),
    set_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per cron run (daily pipeline, weekly report, or weekly feedback
-- job). Backs per-run logging, the system health page, dead-man's-switch
-- checks (MAX(finished_at) WHERE status='success'), and cost guardrails.
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id             SERIAL PRIMARY KEY,
    run_type       TEXT NOT NULL CHECK (run_type IN ('daily', 'weekly', 'weekly_feedback')),
    started_at     TIMESTAMPTZ NOT NULL,
    finished_at    TIMESTAMPTZ,
    status         TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure', 'partial')),
    cost_usd_micros BIGINT,               -- estimated OpenAI cost this run, USD in micros
    error_message  TEXT,                  -- NULL unless status != 'success'
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Widen status to include the in-flight state — closes the pre-existing bug
-- where a fresh run was inserted as status='success' before any work
-- happened. Constraint name matches Postgres's own default name for the
-- original unnamed inline CHECK, so DROP/ADD is safe to re-run.
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_status_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_status_check
    CHECK (status IN ('running', 'success', 'failure', 'partial'));

-- Widen run_type to include 'backup' — scripts/backupDb.ts is now tracked
-- in this table too (trackRun('backup', ...)), not just daily/weekly/
-- weekly_feedback, so a silent backup failure isn't invisible the way it
-- was before. Same DROP/ADD-is-safe-to-re-run pattern as
-- pipeline_runs_status_check above.
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_run_type_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_run_type_check
    CHECK (run_type IN ('daily', 'weekly', 'weekly_feedback', 'backup'));

-- At most one row can be 'running' at a time, enforced by Postgres itself so
-- it holds across processes — closes the race between a manual
-- POST /pipeline/run and the cron script (scripts/runDaily.ts), both of
-- which hit this same DB.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_runs_one_running
    ON pipeline_runs (status) WHERE status = 'running';

-- Which pipeline_runs row produced a given ai_outputs row — lets a report
-- be looked up by the exact generation it came from instead of just
-- report_date, so two runs generated on the same calendar date (e.g. a
-- manual re-run after the scheduled one already fired) are each their own
-- reachable report rather than one silently shadowing the other in the
-- Reports list. NULL on rows from before this column existed. See
-- backend/src/reporting.ts. Declared here, after pipeline_runs exists,
-- since it references that table.
ALTER TABLE ai_outputs ADD COLUMN IF NOT EXISTS pipeline_run_id INTEGER REFERENCES pipeline_runs(id);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_pipeline_run ON ai_outputs(pipeline_run_id);

-- "The critic row(s) for this output" (getLatestCritique, attachCritique, the
-- Learning grade trend) filters on critiques_id and takes the newest by
-- created_at; without this it seq-scans the whole table once per lookup.
CREATE INDEX IF NOT EXISTS idx_ai_outputs_critiques ON ai_outputs(critiques_id, created_at DESC);

-- App-wide config, key/value. Currently just the pipeline's daily/weekly
-- run times (HH:MM, server-local) — see backend/src/settings.ts and the
-- Settings page. runDaily.ts polls these instead of the run time being
-- baked into the crontab line.
CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT INTO app_settings (key, value) VALUES ('daily_run_time', '06:00') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('weekly_run_time', '06:00') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('grade_forces_revision', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('report_language', 'en') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('auto_reports_enabled', 'true') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('monthly_cost_cap_usd', '20') ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_campaign_performance_date ON campaign_performance(date);
CREATE INDEX IF NOT EXISTS idx_segment_performance_date ON segment_performance(date);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_campaign ON ai_outputs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_period_agent ON ai_outputs(period, agent_type, report_date);
CREATE INDEX IF NOT EXISTS idx_ask_log_output ON ask_log(output_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_type_status ON pipeline_runs(run_type, status);

-- v2 Stage 1 — ad groups + keywords + Quality Score. See docs/v2-*-plan.md.
-- Genuinely new fact tables, not segment-like rows: ad group -> keyword is a
-- strict containment hierarchy (every keyword belongs to exactly one ad
-- group), unlike segments/segment_performance's optional orthogonal cuts of
-- a campaign's totals (device, geography). Matches how the real Google Ads
-- API also models these as distinct resources, not segments of `campaign`.
CREATE TABLE IF NOT EXISTS ad_groups (
    id                 SERIAL PRIMARY KEY,
    campaign_id        INTEGER NOT NULL REFERENCES campaigns(id),
    google_ad_group_id TEXT,                 -- NULL for demo ad groups, populated once live-mode covers this level
    name               TEXT NOT NULL,
    status             TEXT,
    data_source        TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, name)
);

CREATE TABLE IF NOT EXISTS ad_group_performance (
    id           SERIAL PRIMARY KEY,
    ad_group_id  INTEGER NOT NULL REFERENCES ad_groups(id),
    date         DATE NOT NULL,
    impressions  INTEGER NOT NULL DEFAULT 0,
    clicks       INTEGER NOT NULL DEFAULT 0,
    cost_micros  BIGINT NOT NULL DEFAULT 0,
    conversions  REAL NOT NULL DEFAULT 0,
    UNIQUE (ad_group_id, date)
);

CREATE TABLE IF NOT EXISTS keywords (
    id                 SERIAL PRIMARY KEY,
    ad_group_id        INTEGER NOT NULL REFERENCES ad_groups(id),
    google_keyword_id  TEXT,
    text               TEXT NOT NULL,
    match_type         TEXT NOT NULL CHECK (match_type IN ('exact', 'phrase', 'broad')),
    status             TEXT,
    data_source        TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ad_group_id, text, match_type)
);

-- Quality Score (full score + all 3 diagnostic sub-scores) is stored PER DAY
-- here, not as a static attribute on `keywords` — lets QS visibly drift
-- across the demo window (see profile.ts's decline-correlated erosion for
-- search_model's keywords), matching how Google Ads itself recomputes QS
-- continuously rather than fixing it once.
CREATE TABLE IF NOT EXISTS keyword_performance (
    id                       SERIAL PRIMARY KEY,
    keyword_id               INTEGER NOT NULL REFERENCES keywords(id),
    date                     DATE NOT NULL,
    impressions              INTEGER NOT NULL DEFAULT 0,
    clicks                   INTEGER NOT NULL DEFAULT 0,
    cost_micros              BIGINT NOT NULL DEFAULT 0,
    conversions              REAL NOT NULL DEFAULT 0,
    quality_score            INTEGER CHECK (quality_score BETWEEN 1 AND 10),
    expected_ctr             TEXT CHECK (expected_ctr IN ('above_average', 'average', 'below_average')),
    ad_relevance             TEXT CHECK (ad_relevance IN ('above_average', 'average', 'below_average')),
    landing_page_experience  TEXT CHECK (landing_page_experience IN ('above_average', 'average', 'below_average')),
    UNIQUE (keyword_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ad_group_performance_date ON ad_group_performance(date);
CREATE INDEX IF NOT EXISTS idx_keyword_performance_date ON keyword_performance(date);

-- v2 Stage 2 — search terms. See docs/v2-backend-plan.md. Anchored to
-- exactly one triggering keyword (keyword_id) — a deliberate simplification
-- vs. the real API's looser attribution (a search term can technically
-- surface under more than one keyword's auction).
CREATE TABLE IF NOT EXISTS search_terms (
    id             SERIAL PRIMARY KEY,
    ad_group_id    INTEGER NOT NULL REFERENCES ad_groups(id),
    keyword_id     INTEGER REFERENCES keywords(id),
    text           TEXT NOT NULL,
    match_flavor   TEXT NOT NULL CHECK (match_flavor IN ('close_variant', 'broader')),
    data_source    TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ad_group_id, text)
);

CREATE TABLE IF NOT EXISTS search_term_performance (
    id               SERIAL PRIMARY KEY,
    search_term_id   INTEGER NOT NULL REFERENCES search_terms(id),
    date             DATE NOT NULL,
    impressions      INTEGER NOT NULL DEFAULT 0,
    clicks           INTEGER NOT NULL DEFAULT 0,
    cost_micros      BIGINT NOT NULL DEFAULT 0,
    conversions      REAL NOT NULL DEFAULT 0,
    UNIQUE (search_term_id, date)
);

CREATE INDEX IF NOT EXISTS idx_search_term_performance_date ON search_term_performance(date);

-- v2 Stage 3 — ads/creatives. See docs/v2-backend-plan.md. ad_strength
-- lives here on `ads`, not `ad_performance` — unlike Quality Score, it's
-- treated as a static per-ad attribute (correlated once with the ad's
-- profile share in profile.ts), not something that drifts day to day.
CREATE TABLE IF NOT EXISTS ads (
    id             SERIAL PRIMARY KEY,
    ad_group_id    INTEGER NOT NULL REFERENCES ad_groups(id),
    google_ad_id   TEXT,
    label          TEXT NOT NULL,
    ad_type        TEXT NOT NULL DEFAULT 'responsive_search_ad',
    headlines      JSONB NOT NULL,
    descriptions   JSONB NOT NULL,
    final_url      TEXT,
    status         TEXT,
    ad_strength    TEXT CHECK (ad_strength IN ('poor', 'average', 'good', 'excellent')),
    data_source    TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ad_group_id, label)
);

CREATE TABLE IF NOT EXISTS ad_performance (
    id           SERIAL PRIMARY KEY,
    ad_id        INTEGER NOT NULL REFERENCES ads(id),
    date         DATE NOT NULL,
    impressions  INTEGER NOT NULL DEFAULT 0,
    clicks       INTEGER NOT NULL DEFAULT 0,
    cost_micros  BIGINT NOT NULL DEFAULT 0,
    conversions  REAL NOT NULL DEFAULT 0,
    UNIQUE (ad_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ad_performance_date ON ad_performance(date);

-- v2 Stage 4 — impression share + optimization score. See docs/v2-backend-plan.md.
-- New nullable columns on campaign_performance, not a new table — a
-- per-day-driftable snapshot like the rest of this table's columns.
-- Deliberately storing only the 2 independent numbers Google Ads itself
-- reports; rank-lost is derived at read time as
-- 1 - search_impression_share - search_budget_lost_impression_share
-- (clamped >= 0) rather than stored as a 3rd number that could drift out
-- of sync with the two it's computed from. Populated only for the 3
-- Search-type campaigns (Brand, Search — Used Cars Generic, Search —
-- Model + Suburb) — real Google Ads doesn't expose impression share for
-- PMax at all, and Display uses a different metric family entirely;
-- leaving those NULL is itself a realistic detail. optimization_score
-- follows the same scope for consistency (see profile.ts).
ALTER TABLE campaign_performance ADD COLUMN IF NOT EXISTS search_impression_share REAL;
ALTER TABLE campaign_performance ADD COLUMN IF NOT EXISTS search_budget_lost_impression_share REAL;
ALTER TABLE campaign_performance ADD COLUMN IF NOT EXISTS optimization_score REAL;

-- v2 Stage 5 — named conversion actions. See docs/v2-backend-plan.md.
-- First-class table + join-fact table, not folded into segments — these
-- need richer attributes (category, counting_type) than a bare segment
-- string, and Tier 1 wants them treated as first-class named entities
-- the LLM reasons about directly (e.g. "Phone Call conversions are up",
-- not "a segment called Phone Call"). Account-wide (no ad_group_id/
-- campaign scoping on conversion_actions itself) — every campaign's
-- daily conversions total is split across the same 4 named actions; see
-- profile.ts's CONVERSION_ACTIONS.
CREATE TABLE IF NOT EXISTS conversion_actions (
    id                          SERIAL PRIMARY KEY,
    google_conversion_action_id TEXT,
    name                        TEXT NOT NULL,
    category                    TEXT,
    counting_type               TEXT,
    status                      TEXT,
    data_source                 TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, data_source)
);

CREATE TABLE IF NOT EXISTS conversion_action_performance (
    id                    SERIAL PRIMARY KEY,
    campaign_id           INTEGER NOT NULL REFERENCES campaigns(id),
    conversion_action_id  INTEGER NOT NULL REFERENCES conversion_actions(id),
    date                  DATE NOT NULL,
    conversions           REAL NOT NULL DEFAULT 0,
    UNIQUE (campaign_id, conversion_action_id, date)
);

CREATE INDEX IF NOT EXISTS idx_conversion_action_performance_date ON conversion_action_performance(date);

-- v2 Stage 6 — PMax asset groups. See docs/v2-backend-plan.md. Scoped to
-- the `pmax` campaign only — Performance Max is asset-group based
-- instead of ad-group based (see Stage 1's comment on why Search's
-- ad_groups table doesn't cover PMax). ad_strength lives on the per-day
-- performance table here, unlike Stage 3's ads.ad_strength (a static
-- column on `ads` itself) — this demo profile still treats each asset
-- group's rating as static day-to-day (see profile.ts), matching Stage
-- 3's simplification; only Quality Score is designed to actually drift.
CREATE TABLE IF NOT EXISTS asset_groups (
    id                     SERIAL PRIMARY KEY,
    campaign_id            INTEGER NOT NULL REFERENCES campaigns(id),
    google_asset_group_id  TEXT,
    name                   TEXT NOT NULL,
    status                 TEXT,
    data_source            TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, name)
);

CREATE TABLE IF NOT EXISTS asset_group_performance (
    id             SERIAL PRIMARY KEY,
    asset_group_id INTEGER NOT NULL REFERENCES asset_groups(id),
    date           DATE NOT NULL,
    impressions    INTEGER NOT NULL DEFAULT 0,
    clicks         INTEGER NOT NULL DEFAULT 0,
    cost_micros    BIGINT NOT NULL DEFAULT 0,
    conversions    REAL NOT NULL DEFAULT 0,
    ad_strength    TEXT CHECK (ad_strength IN ('poor', 'average', 'good', 'excellent')),
    UNIQUE (asset_group_id, date)
);

CREATE INDEX IF NOT EXISTS idx_asset_group_performance_date ON asset_group_performance(date);

-- v2 Stage 7 — Google Ads' own Recommendations. See docs/v2-backend-plan.md.
-- Episodic/scripted, not generated inside the daily Markov loop: a
-- static, hand-authored list in profile.ts (src/data/demo/scriptedEvents.ts
-- resolves its dayOffsets to absolute dates), upserted idempotently once
-- rather than derived fresh from (date, seed) on every call — matches
-- the existing DECLINE_START_DAY/SEASONAL_SPIKE_START_DAY scripted-moment
-- pattern. campaign_id NULL means an account-level recommendation.
CREATE TABLE IF NOT EXISTS recommendations (
    id                        SERIAL PRIMARY KEY,
    campaign_id               INTEGER REFERENCES campaigns(id),
    google_recommendation_id  TEXT,
    recommendation_type       TEXT NOT NULL,
    title                     TEXT NOT NULL,
    description               TEXT,
    impact_impressions_pct    REAL,
    impact_conversions_pct    REAL,
    dismissed                 BOOLEAN NOT NULL DEFAULT false,
    applied                   BOOLEAN NOT NULL DEFAULT false,
    generated_date            DATE NOT NULL,
    data_source               TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, generated_date, recommendation_type, title)
);

-- v2 Stage 8 — change history. See docs/v2-backend-plan.md. Episodic/
-- scripted, same pattern as Stage 7's recommendations (static list in
-- profile.ts, resolved by scriptedEvents.ts, idempotently upserted).
-- field_changed/old_value/new_value are deliberately flattened text vs.
-- the real API's full protobuf resource snapshots — far more directly
-- quotable by Anna, and there's no UI need for a full diff. campaign_id
-- NULL means an account-level change (e.g. a portfolio bid strategy not
-- tied to one campaign). One change event lands exactly at
-- DECLINE_START_DAY on search_model (a budget cut) — see profile.ts.
CREATE TABLE IF NOT EXISTS change_events (
    id                      SERIAL PRIMARY KEY,
    campaign_id             INTEGER REFERENCES campaigns(id),
    google_change_event_id  TEXT,
    changed_at              TIMESTAMPTZ NOT NULL,
    resource_type           TEXT NOT NULL, -- CAMPAIGN, CAMPAIGN_BUDGET, AD_GROUP, AD, KEYWORD, BIDDING_STRATEGY
    change_operation        TEXT NOT NULL CHECK (change_operation IN ('CREATE', 'UPDATE', 'REMOVE')),
    field_changed           TEXT,
    old_value               TEXT,
    new_value               TEXT,
    changed_by              TEXT,
    data_source             TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, changed_at, field_changed)
);

CREATE INDEX IF NOT EXISTS idx_change_events_changed_at ON change_events(changed_at);

-- Per-run LLM usage. cost_usd_micros (declared with pipeline_runs above) was
-- never populated — llm.ts discarded response.usage. Now every run records
-- per-model token counts here, keyed by the model name passed to the API:
--   {"gpt-5.4": {"calls": 15, "input_tokens": ..., "cached_input_tokens": ...,
--                "output_tokens": ..., "reasoning_tokens": ..., "cost_usd_micros": 123 | null}}
-- output_tokens already includes reasoning_tokens (providers bill them as
-- output). cost_usd_micros is null per model when LLM_PRICES_JSON has no rate
-- for it, and the run-level cost_usd_micros is then null too rather than a
-- partial total. See src/platform/llmUsage.ts.
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS llm_usage JSONB;

-- Run Inspector (src/platform/trace.ts). One row per step of a pipeline run:
-- the run itself, data-context builds, agents, LLM calls, critic reviews,
-- approval decisions, revisions, the email send, and errors — nested via
-- parent_id (NULL = the run's root event) and ordered by seq (assigned in start
-- order, so ascending seq is a depth-first walk of the tree). Listing a run
-- stays cheap because the bulky text lives in trace_payloads instead.
CREATE TABLE IF NOT EXISTS trace_events (
    id             BIGSERIAL PRIMARY KEY,
    run_id         INTEGER NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    parent_id      BIGINT REFERENCES trace_events(id) ON DELETE CASCADE,
    seq            INTEGER NOT NULL,
    kind           TEXT NOT NULL CHECK (kind IN (
                       'run', 'context', 'agent', 'llm_call', 'critic_review',
                       'decision', 'revision', 'email', 'error'
                   )),
    name           TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'skipped')),
    started_at     TIMESTAMPTZ NOT NULL,
    ended_at       TIMESTAMPTZ,           -- NULL while running, or if the process died mid-step
    duration_ms    INTEGER,
    model          TEXT,
    tokens_in      INTEGER,
    tokens_out     INTEGER,
    cost_usd       NUMERIC(12, 6),        -- NULL = no price configured (never 0 for "unknown")
    summary        TEXT,                  -- short, <= ~500 chars
    meta           JSONB,
    error_message  TEXT
);
CREATE INDEX IF NOT EXISTS idx_trace_events_run_seq ON trace_events(run_id, seq);

-- Full prompts, responses and built context. Kept 30 days (pruneTracePayloads,
-- called from the cron script); the lightweight trace_events rows stay.
CREATE TABLE IF NOT EXISTS trace_payloads (
    id        BIGSERIAL PRIMARY KEY,
    event_id  BIGINT NOT NULL REFERENCES trace_events(id) ON DELETE CASCADE,
    role      TEXT NOT NULL CHECK (role IN ('prompt', 'response', 'context')),
    content   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trace_payloads_event ON trace_payloads(event_id);

-- v3 Stage 1 — keyword optimizer. See docs/overhaul-v3*.md (section 6).
-- Additive only: new nullable/defaulted columns on existing tables, new
-- tables for negatives, per-keyword conversions by action, the intent and
-- vehicle-parse caches, the demo inventory, and the engine's suggestions.
-- Every API-mirroring table keeps a nullable google_*_id; money stays in
-- micros except the inventory's *_idr columns (whole rupiah, as the
-- dealer's own system stores them).

-- NULL = automated bidding / unknown, never 0.
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS cpc_bid_micros BIGINT;
-- Keyword-level impression share is NULL (not 0) until a keyword has served,
-- so the UI can say "no data yet". search_budget_lost_impression_share is
-- deliberately absent: Google documents it as campaign-level only.
ALTER TABLE keyword_performance ADD COLUMN IF NOT EXISTS search_impression_share REAL;
ALTER TABLE keyword_performance ADD COLUMN IF NOT EXISTS search_rank_lost_impression_share REAL;
ALTER TABLE keyword_performance ADD COLUMN IF NOT EXISTS conversions_value_micros BIGINT NOT NULL DEFAULT 0;
ALTER TABLE search_term_performance ADD COLUMN IF NOT EXISTS conversions_value_micros BIGINT NOT NULL DEFAULT 0;
ALTER TABLE conversion_actions ADD COLUMN IF NOT EXISTS default_value_micros BIGINT;
ALTER TABLE conversion_actions ADD COLUMN IF NOT EXISTS always_use_default_value BOOLEAN;
-- Our own label, not a Google field.
ALTER TABLE conversion_actions ADD COLUMN IF NOT EXISTS value_tier TEXT
    CHECK (value_tier IN ('micro', 'lead', 'visit', 'sale'));

-- Mirrors campaign_criterion / ad_group_criterion / shared_criterion with
-- negative = TRUE.
CREATE TABLE IF NOT EXISTS negative_keywords (
    id                   SERIAL PRIMARY KEY,
    scope                TEXT NOT NULL CHECK (scope IN ('campaign', 'ad_group', 'shared_set')),
    campaign_id          INTEGER REFERENCES campaigns(id),
    ad_group_id          INTEGER REFERENCES ad_groups(id),
    text                 TEXT NOT NULL,
    match_type           TEXT NOT NULL CHECK (match_type IN ('exact', 'phrase', 'broad')),
    source               TEXT NOT NULL CHECK (source IN ('existing', 'applied_suggestion')),
    google_criterion_id  TEXT,
    data_source          TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Per-keyword, per-day, per-conversion-action. Non-zero rows only. The real
-- API returns only conversion metrics when segmented by conversion_action,
-- which is why this is its own table rather than columns on
-- keyword_performance.
CREATE TABLE IF NOT EXISTS keyword_conversion_action_performance (
    id                        SERIAL PRIMARY KEY,
    keyword_id                INTEGER NOT NULL REFERENCES keywords(id),
    conversion_action_id      INTEGER NOT NULL REFERENCES conversion_actions(id),
    date                      DATE NOT NULL,
    conversions               REAL NOT NULL DEFAULT 0,
    conversions_value_micros  BIGINT NOT NULL DEFAULT 0,
    UNIQUE (keyword_id, conversion_action_id, date)
);

-- One row per unique normalized search-term text, shared across ad groups.
-- classifier_version is bumped to force reclassification.
CREATE TABLE IF NOT EXISTS search_term_intents (
    normalized_text     TEXT PRIMARY KEY,
    intent              TEXT NOT NULL CHECK (intent IN (
                            'buyer', 'researcher', 'job_seeker', 'student', 'competitor', 'consumer', 'unknown'
                        )),
    confidence          REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    method              TEXT NOT NULL CHECK (method IN ('rule', 'llm')),
    rule_id             TEXT,                -- which rule fired, for auditing
    classifier_version  INTEGER NOT NULL,
    classified_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Keyword text parsed once into make / model / year (cache).
CREATE TABLE IF NOT EXISTS keyword_vehicle_parse (
    keyword_id      INTEGER PRIMARY KEY REFERENCES keywords(id),
    make            TEXT,
    model           TEXT,
    year_from       INTEGER,
    year_to         INTEGER,
    method          TEXT NOT NULL CHECK (method IN ('rule', 'llm')),
    parser_version  INTEGER NOT NULL,
    parsed_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Demo inventory only. A real source (INVENTORY_DB_STRING) is read through
-- the inventory adapter instead and never copied into these tables.
CREATE TABLE IF NOT EXISTS vehicles (
    id                    SERIAL PRIMARY KEY,
    external_id           TEXT,
    make                  TEXT NOT NULL,
    model                 TEXT NOT NULL,
    year                  INTEGER NOT NULL,
    mileage_km            INTEGER,
    price_idr             BIGINT NOT NULL,
    acquisition_cost_idr  BIGINT,
    status                TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'sold')),
    listed_on             DATE NOT NULL,
    sold_on               DATE
);

CREATE TABLE IF NOT EXISTS vehicle_events (
    id             SERIAL PRIMARY KEY,
    vehicle_id     INTEGER NOT NULL REFERENCES vehicles(id),
    event_type     TEXT NOT NULL CHECK (event_type IN ('listed', 'price_change', 'reserved', 'sold')),
    event_date     DATE NOT NULL,
    old_price_idr  BIGINT,
    new_price_idr  BIGINT
);

-- The deterministic engine's output. payload/evidence are computed in code;
-- rank/explanation are the only fields the LLM step sets. fingerprint is a
-- hash of (type + target), used to dedupe across weekly runs and to keep a
-- dismissed idea from coming back every week.
CREATE TABLE IF NOT EXISTS keyword_suggestions (
    id                     SERIAL PRIMARY KEY,
    pipeline_run_id        INTEGER NOT NULL REFERENCES pipeline_runs(id),
    suggestion_type        TEXT NOT NULL CHECK (suggestion_type IN (
                               'negative_keyword', 'promote_search_term', 'change_match_type', 'pause_keyword',
                               'spin_out_campaign', 'new_keyword', 'raise_bid_candidate'
                           )),
    campaign_id            INTEGER REFERENCES campaigns(id),
    ad_group_id            INTEGER REFERENCES ad_groups(id),
    keyword_id             INTEGER REFERENCES keywords(id),
    search_term_id         INTEGER REFERENCES search_terms(id),
    payload                JSONB NOT NULL,
    evidence               JSONB NOT NULL,
    basis                  TEXT NOT NULL CHECK (basis IN ('evidence', 'prior')),
    confidence             TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    expected_impact        JSONB,
    rank                   INTEGER,
    explanation            TEXT,
    inventory_snapshot_on  DATE,
    fingerprint            TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'dismissed', 'superseded')),
    status_changed_at      TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_keyword_suggestions_status ON keyword_suggestions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_suggestions_fingerprint ON keyword_suggestions(fingerprint);

-- Keyword optimizer settings — see src/platform/settings.ts for validators.
INSERT INTO app_settings (key, value) VALUES ('keyword_optimizer_enabled', 'true') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('keyword_test_budget_share', '0.2') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('keyword_min_confidence_p', '0.05') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('inventory_allowed_spend_share', '0.2') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('inventory_lead_to_sale_rate', '0.02') ON CONFLICT (key) DO NOTHING;

-- v3 step 7 — the keyword optimizer's weekly run and Kai's ranked,
-- explained output (graded by Ciri through runWithCritic). Same
-- DROP/ADD-is-safe-to-re-run pattern as the constraints above;
-- ai_outputs_agent_type_check is Postgres's default name for the original
-- inline CHECK.
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_run_type_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_run_type_check
    CHECK (run_type IN ('daily', 'weekly', 'weekly_feedback', 'backup', 'keyword_optimizer'));
ALTER TABLE ai_outputs DROP CONSTRAINT IF EXISTS ai_outputs_agent_type_check;
ALTER TABLE ai_outputs ADD CONSTRAINT ai_outputs_agent_type_check
    CHECK (agent_type IN ('analysis', 'recommendation', 'summary', 'critic', 'keyword_optimizer'));

-- v3 contract 3.3 — campaign proposals: the new_campaign suggestion type,
-- the 'planned' status (new_campaign only, enforced in the API), and the
-- real campaign a planned proposal turned into once it shows up in the
-- synced data (same name). Postgres's default names for the inline CHECKs.
ALTER TABLE keyword_suggestions DROP CONSTRAINT IF EXISTS keyword_suggestions_suggestion_type_check;
ALTER TABLE keyword_suggestions ADD CONSTRAINT keyword_suggestions_suggestion_type_check
    CHECK (suggestion_type IN (
        'negative_keyword', 'promote_search_term', 'change_match_type', 'pause_keyword',
        'spin_out_campaign', 'new_keyword', 'raise_bid_candidate', 'new_campaign'
    ));
ALTER TABLE keyword_suggestions DROP CONSTRAINT IF EXISTS keyword_suggestions_status_check;
ALTER TABLE keyword_suggestions ADD CONSTRAINT keyword_suggestions_status_check
    CHECK (status IN ('open', 'planned', 'applied', 'dismissed', 'superseded'));
ALTER TABLE keyword_suggestions ADD COLUMN IF NOT EXISTS linked_campaign_id INTEGER REFERENCES campaigns(id);

-- Contract 3.3 — bounds on a proposed campaign's daily budget (whole rupiah).
INSERT INTO app_settings (key, value) VALUES ('campaign_daily_budget_floor_idr', '20000') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('campaign_daily_budget_ceiling_idr', '100000') ON CONFLICT (key) DO NOTHING;

-- Contract 3.5 — Kai's automatic daily run: its time (HH:MM, WIB), next to
-- the existing keyword_optimizer_enabled switch, which now turns that run
-- on and off independently of auto_reports_enabled.
INSERT INTO app_settings (key, value) VALUES ('keyword_optimizer_run_time', '06:00') ON CONFLICT (key) DO NOTHING;

-- Contract 3.6 — the dealer facts ad copy may use, the claims it may make,
-- and the launch kill switch (OFF by default) and writer mode ('simulated'
-- is the only writer). Validators in src/platform/settings.ts.
INSERT INTO app_settings (key, value) VALUES ('dealer_name', 'Pitstop Used Cars') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('dealer_city', 'Tangerang') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('dealer_area', 'Gading Serpong') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('dealer_whatsapp', '0812-5550-0123') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('dealer_landing_url', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('ads_claim_installments', 'true') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('ads_claim_trade_in', 'true') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('ads_claim_test_drive', 'true') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('ads_claim_inspection', 'true') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('ads_inspection_wording', 'Unit sudah melalui pemeriksaan') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('ads_write_enabled', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('ads_write_mode', 'simulated') ON CONFLICT (key) DO NOTHING;

-- Contract 3.6 — the new_ad suggestion type ('planned' is valid for it, as
-- for new_campaign; enforced in the API). Same DROP/ADD as 3.3.
ALTER TABLE keyword_suggestions DROP CONSTRAINT IF EXISTS keyword_suggestions_suggestion_type_check;
ALTER TABLE keyword_suggestions ADD CONSTRAINT keyword_suggestions_suggestion_type_check
    CHECK (suggestion_type IN (
        'negative_keyword', 'promote_search_term', 'change_match_type', 'pause_keyword',
        'spin_out_campaign', 'new_keyword', 'raise_bid_candidate', 'new_campaign', 'new_ad'
    ));

-- Contract 3.6 — the simulated launch (docs/overhaul-v3-backend.md 11.9).
-- A campaign a simulated launch created: in this app's tables only, never
-- sent to Google Ads, no performance rows.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS simulated BOOLEAN NOT NULL DEFAULT FALSE;

-- One row per POST /launches call, refusals and failures included (the
-- audit log). suggestion_id has no foreign key on purpose: a call naming an
-- unknown suggestion (404) is audited with the id it asked for.
CREATE TABLE IF NOT EXISTS launches (
    id             SERIAL PRIMARY KEY,
    suggestion_id  INTEGER,
    campaign_name  TEXT,
    mode           TEXT NOT NULL,
    validate_only  BOOLEAN NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('validated', 'created', 'rejected', 'failed')),
    http_status    INTEGER NOT NULL,
    problems       JSONB NOT NULL DEFAULT '[]',
    plan           JSONB,
    created        JSONB,
    requested_by   TEXT NOT NULL CHECK (requested_by IN ('owner', 'demo')),
    requested_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_launches_suggestion ON launches(suggestion_id);
-- A proposal is launched at most once, even under concurrent calls.
CREATE UNIQUE INDEX IF NOT EXISTS uq_launches_one_created ON launches(suggestion_id) WHERE status = 'created';

-- Contract 3.6 master text: the simulated campaign's daily budget, and the
-- launches columns the master names (campaign_id, request, result). Additive:
-- the earlier columns stay; `result` holds the Launch the API returned.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS daily_budget_micros BIGINT;
ALTER TABLE launches ADD COLUMN IF NOT EXISTS campaign_id INTEGER;
ALTER TABLE launches ADD COLUMN IF NOT EXISTS request JSONB;
ALTER TABLE launches ADD COLUMN IF NOT EXISTS result JSONB;
