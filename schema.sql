-- Google Ads AI Performance Dashboard — SQLite schema (v1 draft)
-- Source-agnostic: `data_source` on campaigns lets the same tables serve
-- both live and demo data, switched by the UI toggle described in PROJECT.md.

CREATE TABLE IF NOT EXISTS campaigns (
    id                INTEGER PRIMARY KEY,
    google_campaign_id TEXT,                 -- NULL for demo campaigns
    name              TEXT NOT NULL,
    status            TEXT,                  -- e.g. 'enabled', 'paused', 'removed'
    data_source       TEXT NOT NULL CHECK (data_source IN ('live', 'demo')),
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Daily campaign-level performance (impressions, clicks, cost, conversions).
CREATE TABLE IF NOT EXISTS campaign_performance (
    id             INTEGER PRIMARY KEY,
    campaign_id    INTEGER NOT NULL REFERENCES campaigns(id),
    date           DATE NOT NULL,
    impressions    INTEGER NOT NULL DEFAULT 0,
    clicks         INTEGER NOT NULL DEFAULT 0,
    cost_micros    INTEGER NOT NULL DEFAULT 0,   -- Google Ads API convention: currency in micros
    conversions    REAL NOT NULL DEFAULT 0,
    UNIQUE (campaign_id, date)
);

-- Dimension table: one row per distinct segment value (device, geography,
-- demographic bucket, in-market/affinity/custom audience).
CREATE TABLE IF NOT EXISTS segments (
    id            INTEGER PRIMARY KEY,
    segment_type  TEXT NOT NULL CHECK (segment_type IN (
                      'age_range', 'gender', 'household_income',
                      'device', 'geography', 'in_market', 'affinity', 'custom'
                  )),
    segment_value TEXT NOT NULL,               -- e.g. 'Mobile', '18-24', 'Jakarta, ID'
    UNIQUE (segment_type, segment_value)
);

-- Daily performance broken out by segment, per campaign.
CREATE TABLE IF NOT EXISTS segment_performance (
    id             INTEGER PRIMARY KEY,
    campaign_id    INTEGER NOT NULL REFERENCES campaigns(id),
    segment_id     INTEGER NOT NULL REFERENCES segments(id),
    date           DATE NOT NULL,
    impressions    INTEGER NOT NULL DEFAULT 0,
    clicks         INTEGER NOT NULL DEFAULT 0,
    cost_micros    INTEGER NOT NULL DEFAULT 0,
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
    id                  INTEGER PRIMARY KEY,
    agent_type          TEXT NOT NULL CHECK (agent_type IN (
                            'analysis', 'recommendation', 'summary', 'critic'
                        )),
    campaign_id         INTEGER REFERENCES campaigns(id),   -- NULL if account-wide
    segment_id          INTEGER REFERENCES segments(id),    -- NULL if not segment-specific
    critiques_id        INTEGER REFERENCES ai_outputs(id),  -- set only on critic rows
    revises_id          INTEGER REFERENCES ai_outputs(id),  -- set only on revised drafts -> the draft it revised
    content             TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                            'draft', 'revised', 'approved', 'flagged'
                        )),
    outcome             TEXT CHECK (outcome IN ('correct', 'incorrect', 'inconclusive')),
    outcome_checked_at  TIMESTAMP,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- On-demand Q&A against Rico or Sammy, tied to the report being asked
-- about. Backs the Ask feature (agents/recommendation.md, agents/summary.md)
-- and the Time Machine + Ask Standout Feature.
CREATE TABLE IF NOT EXISTS ask_log (
    id          INTEGER PRIMARY KEY,
    output_id   INTEGER NOT NULL REFERENCES ai_outputs(id),
    agent_type  TEXT NOT NULL CHECK (agent_type IN ('recommendation', 'summary')),
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Time Machine pins for demo mode: forcing a specific state for a future
-- date. Generation stays a pure function of (date, seed, forced_state),
-- so this table is the only place state gets overridden from the default
-- Markov-chain draw.
CREATE TABLE IF NOT EXISTS demo_state_overrides (
    date          DATE PRIMARY KEY,
    forced_state  TEXT NOT NULL CHECK (forced_state IN ('good', 'bad', 'standstill', 'volatile')),
    set_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per cron run (daily pipeline, weekly report, or weekly feedback
-- job). Backs per-run logging, the system health page, dead-man's-switch
-- checks (MAX(finished_at) WHERE status='success'), and cost guardrails.
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id             INTEGER PRIMARY KEY,
    run_type       TEXT NOT NULL CHECK (run_type IN ('daily', 'weekly', 'weekly_feedback')),
    started_at     TIMESTAMP NOT NULL,
    finished_at    TIMESTAMP,
    status         TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure', 'partial')),
    cost_usd_micros INTEGER,              -- estimated OpenAI cost this run, USD in micros
    error_message  TEXT,                  -- NULL unless status != 'success'
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaign_performance_date ON campaign_performance(date);
CREATE INDEX IF NOT EXISTS idx_segment_performance_date ON segment_performance(date);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_campaign ON ai_outputs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ask_log_output ON ask_log(output_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_type_status ON pipeline_runs(run_type, status);
