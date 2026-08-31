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
-- agents/summary.md) and the Time Machine + Ask Standout Feature. Organized
-- into conversation threads (ask_conversations, below) rather than one flat
-- list per output — a thread's prior Q&A gets folded back into the prompt
-- so a follow-up actually has an antecedent.
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
    run_type       TEXT NOT NULL CHECK (run_type IN ('daily', 'weekly', 'weekly_feedback', 'backup')),
    started_at     TIMESTAMPTZ NOT NULL,
    finished_at    TIMESTAMPTZ,
    status         TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('running', 'success', 'failure', 'partial')),
    cost_usd_micros BIGINT,               -- estimated OpenAI cost this run, USD in micros
    error_message  TEXT,                  -- NULL unless status != 'success'
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Enforces at most one in-flight run at a time across BOTH processes that
-- can start one (the API server and the cron script, scripts/runDaily.ts)
-- — startRun() relies on this unique_violation (23505) to throw
-- PipelineRunInProgressError instead of racing two runs. See
-- pipelineRuns.ts's reconcileOrphanedRuns() for what clears a row stuck
-- here by a crash.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_runs_one_running ON pipeline_runs (status) WHERE (status = 'running');

-- Widen status to include 'running' — startRun() now inserts that as the
-- real in-flight state (see idx_pipeline_runs_one_running above), not
-- 'success' as a placeholder like before. No-op against a fresh DB (the
-- CREATE TABLE above already includes it); matters only for an existing DB
-- whose constraint predates this change.
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_status_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_status_check
    CHECK (status IN ('running', 'success', 'failure', 'partial'));

-- Widen run_type to include 'backup' — scripts/backupDb.ts is now tracked
-- in this table too (trackRun('backup', ...)), not just daily/weekly/
-- weekly_feedback, so a silent backup failure isn't invisible the way it
-- was before. A no-op against a fresh DB (the CREATE TABLE above already
-- includes 'backup'); this only matters for an existing DB whose
-- constraint predates this change.
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_run_type_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_run_type_check
    CHECK (run_type IN ('daily', 'weekly', 'weekly_feedback', 'backup'));

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
