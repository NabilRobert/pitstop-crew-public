// Shapes returned by the backend REST API. Mirrors backend/src/reporting/outputs.ts's
// AiOutput interface and the response shapes documented in the API Reference page —
// kept here rather than shared with the backend since frontend/ and backend/ are two
// fully separate deployable units talking only over HTTP.

export interface Campaign {
  id: number
  name: string
}

export interface PerformanceRow {
  date: string
  campaign: string
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
  // v2 Stage 4 — impression share + optimization score. Populated only
  // for Search-type campaigns (Brand, Search — Used Cars Generic,
  // Search — Model + Suburb) — null for Performance Max/Display.
  // search_rank_lost_impression_share is derived server-side, not a
  // metric Google Ads reports directly. All 4 are 0-1 fractions.
  search_impression_share: number | null
  search_budget_lost_impression_share: number | null
  search_rank_lost_impression_share: number | null
  optimization_score: number | null
}

export interface SegmentPerformanceRow {
  date: string
  segment_type: string
  segment_value: string
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
}

// v2 Stage 1 — ad groups + keywords + Quality Score.
export interface AdGroupPerformanceRow {
  date: string
  ad_group_id: number
  ad_group: string
  campaign_id: number
  campaign: string
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
}

export type QsBucket = 'above_average' | 'average' | 'below_average'

export interface KeywordPerformanceRow {
  date: string
  keyword_id: number
  text: string
  match_type: 'exact' | 'phrase' | 'broad'
  ad_group_id: number
  ad_group: string
  campaign_id: number
  campaign: string
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
  quality_score: number | null
  expected_ctr: QsBucket | null
  ad_relevance: QsBucket | null
  landing_page_experience: QsBucket | null
  // Overhaul v3 (contract 3.0, section 13) — additive. Optional because an
  // older backend does not send them; treat `undefined` exactly like `null`
  // ("no data yet"), never as 0.
  cpc_bid_micros?: number | null
  search_impression_share?: number | null
  search_rank_lost_impression_share?: number | null
  conversions_value_micros?: number
}

// v2 Stage 2 — search terms. Each row is anchored to exactly one
// triggering keyword (see backend/schema.sql's search_terms table).
export interface SearchTermPerformanceRow {
  date: string
  search_term_id: number
  search_term: string
  match_flavor: 'close_variant' | 'broader'
  keyword_id: number
  keyword: string
  ad_group_id: number
  ad_group: string
  campaign_id: number
  campaign: string
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
  // Overhaul v3 (contract 3.0) — additive, optional until the backend ships.
  conversions_value_micros?: number
  /** null when the term is unclassified (contract rule; the backend returns null, not 'unknown'). */
  intent?: Intent | null
  intent_confidence?: number | null
  intent_method?: 'rule' | 'llm' | null
}

// v2 Stage 3 — ads/creatives. ad_strength is a static per-ad attribute
// (doesn't drift day to day, unlike keyword Quality Score).
export type AdStrength = 'poor' | 'average' | 'good' | 'excellent'

export interface AdPerformanceRow {
  date: string
  ad_id: number
  label: string
  headlines: string[]
  descriptions: string[]
  final_url: string
  ad_strength: AdStrength
  ad_group_id: number
  ad_group: string
  campaign_id: number
  campaign: string
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
}

// v2 Stage 5 — named conversion actions. Account-wide, aggregated over
// the requested window — no date/campaign breakdown, unlike the other
// v2 row shapes.
export interface ConversionActionRow {
  name: string
  category: string
  counting_type: 'ONE_PER_CLICK' | 'MANY_PER_CLICK'
  conversions: number
}

// v2 Stage 6 — PMax asset groups. Every row is implicitly pmax-only —
// asset_groups only exist under that campaign.
export interface AssetGroupPerformanceRow {
  date: string
  asset_group_id: number
  asset_group: string
  campaign_id: number
  campaign: string
  impressions: number
  clicks: number
  cost_micros: number
  conversions: number
  ad_strength: AdStrength
}

// v2 Stage 7 — Google Ads' own Recommendations. campaign/campaign_id are
// null for account-level recommendations.
export interface RecommendationRow {
  id: number
  generated_date: string
  campaign_id: number | null
  campaign: string | null
  recommendation_type: string
  title: string
  description: string
  impact_impressions_pct: number | null
  impact_conversions_pct: number | null
  dismissed: boolean
  applied: boolean
}

// v2 Stage 8 — change history. campaign/campaign_id are null for
// account-level changes.
export interface ChangeEventRow {
  id: number
  changed_at: string
  campaign_id: number | null
  campaign: string | null
  resource_type: string
  change_operation: 'CREATE' | 'UPDATE' | 'REMOVE'
  field_changed: string | null
  old_value: string | null
  new_value: string | null
  changed_by: string
}

export interface CriticIssue {
  quote: string
  reason: string
}

export interface AiOutput {
  id: number
  agent_type: 'analysis' | 'recommendation' | 'summary' | 'critic'
  campaign_id: number | null
  segment_id: number | null
  critiques_id: number | null
  revises_id: number | null
  report_date: string | null
  period: 'daily' | 'weekly' | null
  content: string
  status: 'draft' | 'revised' | 'approved' | 'flagged'
  outcome: 'correct' | 'incorrect' | 'inconclusive' | null
  outcome_checked_at: string | null
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null
  grade_rationale: string | null
  issues: CriticIssue[] | null
  pipeline_run_id: number | null
  created_at: string
}

/** An AiOutput with its most recent critique attached — what /reports/:id
 * and /reports/latest actually return for each of analysis/recommendation/summary. */
export interface AiOutputWithCritique extends AiOutput {
  critique: {
    grade: AiOutput['grade']
    grade_rationale: string | null
    issues: CriticIssue[] | null
    content: string
  } | null
}

export interface Report {
  analysis: AiOutputWithCritique | null
  recommendation: AiOutputWithCritique | null
  summary: AiOutputWithCritique | null
}

export interface ReportListEntry {
  id: number
  report_date: string
  status: AiOutput['status']
  created_at: string
  preview: string
}

export interface WhyTrailEntry extends AiOutput {
  critique?: AiOutput
}

export interface AskHistoryEntry {
  id: number
  question: string
  answer: string
  created_at: string
}

export interface AskConversation {
  id: number
  title: string | null
  created_at: string
  updated_at: string
}

export interface AskResponse {
  ask_id: number
  messages: AskHistoryEntry[]
}

export type VoiceAgentType = 'analysis' | 'recommendation' | 'summary' | 'assistant'

export interface AssistantAskEntry {
  id: number
  question: string
  answer: string
  created_at: string
}

export interface AssistantConversation {
  id: number
  title: string | null
  created_at: string
  updated_at: string
}

export interface AssistantAskResponse {
  ask_id: number
  messages: AssistantAskEntry[]
}

export interface PipelineRun {
  id: number
  run_type: 'daily' | 'weekly' | 'weekly_feedback' | 'backup' | 'keyword_optimizer'
  started_at: string
  finished_at: string | null
  status: 'running' | 'success' | 'failure' | 'partial'
  cost_usd_micros: number | null
  error_message: string | null
}

export interface SystemHealth {
  last_successful_daily_run: PipelineRun | null
  recent_runs: PipelineRun[]
}

export interface Settings {
  daily_run_time: string
  weekly_run_time: string
  grade_forces_revision: string
  report_recipient_email: string
  report_language: string
  auto_reports_enabled: string
  /** Empty string = disabled (no cap). Otherwise a positive number, as a string. */
  monthly_cost_cap_usd: string
  // Overhaul v3 (contract 3.0) — all strings like the rest; optional until
  // the backend ships. Never includes the inventory connection string.
  /** The automatic run's on/off switch (independent of auto_reports_enabled). */
  keyword_optimizer_enabled?: string
  /** Contract 3.5: HH:MM in WIB, default 06:00; when the optimizer runs by itself each day. */
  keyword_optimizer_run_time?: string
  keyword_test_budget_share?: string
  keyword_min_confidence_p?: string
  inventory_allowed_spend_share?: string
  inventory_lead_to_sale_rate?: string
  // Contract 3.4: whole-rupiah strings bounding a proposed campaign's daily budget; optional until the backend sends them.
  campaign_daily_budget_floor_idr?: string
  campaign_daily_budget_ceiling_idr?: string
}

export interface TriggerRunResponse {
  started: true
  period: string
  target_date: string
  runId: number
}

export type TrendAgent = 'analysis' | 'recommendation' | 'summary'

export interface GradeTrendCounts {
  outputs: number
  approved_clean: number
  approved_with_notes: number
  flagged: number
  no_review: number
  c_or_worse: number
  high_severity: number
}

export interface GradeTrendWeek {
  week: string
  agents: Record<TrendAgent, GradeTrendCounts>
}

export interface GradeTrendEvent {
  date: string
  key: string
  label: string
}

export interface GradeTrend {
  weeks: GradeTrendWeek[]
  events: GradeTrendEvent[]
}

export interface LearningSuggestion {
  id: number
  week_of: string
  content: string
}

export type ForcedState = 'good' | 'bad' | 'standstill' | 'volatile'

export interface TimeMachineOverrideMap {
  [date: string]: ForcedState
}

export interface ConsoleEvent {
  seq?: number
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
  runId?: number
}

export interface AppConfig {
  data_source: 'demo' | 'live'
}

export interface RunListItem {
  id: number
  run_type: string
  status: 'running' | 'success' | 'failure' | 'partial'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  cost_usd: number | null
  llm_calls: number | null
  tokens_in: number | null
  tokens_out: number | null
  trace_event_count: number
  error_message: string | null
}

export type TraceKind = 'run' | 'context' | 'agent' | 'llm_call' | 'critic_review' | 'decision' | 'revision' | 'email' | 'error'

export interface TraceEvent {
  id: number
  parent_id: number | null
  seq: number
  kind: TraceKind
  name: string
  status: 'ok' | 'error' | 'skipped'
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  model: string | null
  tokens_in: number | null
  tokens_out: number | null
  cost_usd: number | null
  summary: string | null
  meta: Record<string, unknown> | null
  error_message: string | null
  payload_count: number
}

export interface RunTrace {
  run: RunListItem
  events: TraceEvent[]
}

export interface TracePayload {
  id: number
  role: 'prompt' | 'response' | 'context'
  chars: number
  content: string
}

export interface EventPayloads {
  event_id: number
  expired: boolean
  retention_days: number
  payloads: TracePayload[]
}

// ---------------------------------------------------------------------------
// Overhaul v3 — keyword optimizer. Mirrors overhaul-v3.md section 13 (API
// contract, version 3.0) exactly. If the contract changes, change it there
// first, then here.
// ---------------------------------------------------------------------------

export const KEYWORD_OPTIMIZER_CONTRACT_VERSION = '3.2'

export type Intent = 'buyer' | 'researcher' | 'job_seeker' | 'student' | 'competitor' | 'consumer' | 'unknown'
export type SuggestionType =
  | 'negative_keyword'
  | 'promote_search_term'
  | 'change_match_type'
  | 'pause_keyword'
  | 'spin_out_campaign'
  | 'new_keyword'
  | 'raise_bid_candidate'
  | 'new_campaign' // contract 3.3: a whole new campaign proposal (see NewCampaignPayload)
/** 'planned' (3.3): a new_campaign proposal the owner approved but that is not in Google Ads yet. */
export type SuggestionStatus = 'open' | 'planned' | 'applied' | 'dismissed' | 'superseded'
/** 'prior' = not yet backed by this account's data; shown as "unverified". */
export type SuggestionBasis = 'evidence' | 'prior'
export type SuggestionConfidence = 'high' | 'medium' | 'low'
export type KeywordMatchType = 'exact' | 'phrase' | 'broad'
export type ValueTier = 'micro' | 'lead' | 'visit' | 'sale'

export type CampaignBasis = 'uncovered_stock' | 'aging_stock' | 'proven_cluster' | 'theme'

/** Contract 3.3. Every number here is computed in the backend; the UI shows it, never recomputes it. */
export interface NewCampaignPayload {
  kind: 'new_campaign'
  basis: CampaignBasis
  /** Suggested campaign name; also what links a planned campaign to the real one later. */
  name: string
  theme: string | null
  ad_groups: {
    name: string
    keywords: { text: string; match_type: KeywordMatchType; source: 'stock' | 'existing_keyword' | 'keyword_ideas' }[]
    vehicle_ids: number[]
  }[]
  starter_negatives: { text: string; match_type: KeywordMatchType }[]
  budget: {
    daily_micros: number
    /** 3.4: which settings bound clamped daily_micros (floor / ceiling), or null when it was not clamped. Optional until seen live. */
    bound?: 'floor' | 'ceiling' | null
    target_cpa_micros: number | null
    /** Shown to the reader: the lead-to-sale rate is a guess until real sales data exists. */
    assumptions: { allowed_spend_share: number; lead_to_sale_rate: number }
  }
  stock: {
    units: number
    avg_days_listed: number | null
    avg_margin_idr: number | null
    total_value_idr: number | null
    snapshot_on: string
  }
  /** Existing campaigns that already target some of this (cannibalisation warning). */
  overlaps: { campaign_id: number; name: string; shared_keywords: number }[]
}

export type SuggestionPayload =
  | {
      kind: 'negative_keyword'
      text: string
      match_type: KeywordMatchType
      scope: 'campaign' | 'ad_group'
      /** Converting search terms this negative would also block. */
      collisions: { search_term: string; conversions: number }[]
    }
  | { kind: 'promote_search_term'; text: string; to_match_type: 'exact'; ad_group_id: number }
  | { kind: 'change_match_type'; from: KeywordMatchType; to: KeywordMatchType }
  | { kind: 'pause_keyword' }
  | { kind: 'spin_out_campaign'; keyword_ids: number[]; suggested_name: string; make: string | null; model: string | null }
  | {
      kind: 'new_keyword'
      text: string
      match_type: KeywordMatchType
      ad_group_id: number | null
      source: 'stock' | 'search_term' | 'keyword_ideas'
      vehicle_ids: number[]
      is_test: boolean
    }
  | { kind: 'raise_bid_candidate'; current_bid_micros: number | null; rank_lost_share: number }
  | NewCampaignPayload

export interface SuggestionEvidence {
  window_start: string
  window_end: string
  clicks: number | null
  impressions: number | null
  cost_micros: number | null
  conversions: number | null
  conversions_value_micros: number | null
  /** The n_min threshold used; explains why "not enough data" applies. */
  min_clicks_required: number | null
  /** Type-specific numbers, e.g. parent_keyword_cpa_micros. */
  [extra: string]: unknown
}

export interface Suggestion {
  id: number
  pipeline_run_id: number
  type: SuggestionType
  status: SuggestionStatus
  basis: SuggestionBasis
  confidence: SuggestionConfidence
  /** 1 = most important; null until the LLM step has ranked it. */
  rank: number | null
  /** LLM text, may be null. Every NUMBER shown must come from evidence/payload, never from this. */
  explanation: string | null
  campaign: { id: number; name: string } | null
  ad_group: { id: number; name: string } | null
  keyword: { id: number; text: string; match_type: KeywordMatchType } | null
  search_term: { id: number; text: string } | null
  /** 3.3: set when a planned campaign shows up in the real data (same name); the status is then 'applied'. Optional until the backend ships 3.3. */
  linked_campaign?: { id: number; name: string } | null
  payload: SuggestionPayload
  evidence: SuggestionEvidence
  expected_impact: { wasted_spend_micros_per_week?: number; extra_conversions_per_week?: number } | null
  inventory: {
    snapshot_on: string
    stock_count: number
    avg_days_listed: number | null
    avg_margin_idr: number | null
  } | null
  created_at: string
  status_changed_at: string | null
}

export type InventorySource = 'demo' | 'connected' | 'unavailable'

export interface SuggestionsResponse {
  items: Suggestion[]
  total: number
  /** Latest keyword_optimizer run; null before the first run (a normal state, not an error). */
  run: { id: number; finished_at: string | null; status: 'running' | 'success' | 'failure' | 'partial' } | null
  inventory: { source: InventorySource; snapshot_on: string | null }
}

export interface SuggestionsQuery {
  status?: SuggestionStatus | 'all'
  type?: SuggestionType
  campaign_id?: number
  limit?: number
  offset?: number
}

export interface InventorySummary {
  source: InventorySource
  snapshot_on: string | null
  /** Short and sanitized; never the connection string. */
  error: string | null
  totals: { available: number; reserved: number; sold_last_30d: number } | null
  aging: { bucket: '0-30' | '31-60' | '61-90' | '90+'; count: number }[]
  by_model: {
    make: string
    model: string
    available: number
    avg_days_listed: number | null
    avg_price_idr: number | null
    avg_margin_idr: number | null
    linked_keyword_count: number
  }[]
}

/** One label per keyword for the cork-board view, decided in code by the backend (contract 3.1):
 * no_stock > testing > wasting > winner > needs_data > steady. The frontend never recomputes it. */
export type KeywordVerdict = 'winner' | 'wasting' | 'no_stock' | 'testing' | 'needs_data' | 'steady'

export interface KeywordSummary {
  keyword_id: number
  // Contract 3.2 (additive): identity and status, so a campaign's page can list its CURRENT keywords,
  // including paused ones and ones with no activity. Optional until the backend that ships 3.2 is deployed.
  text?: string
  match_type?: KeywordMatchType
  campaign?: { id: number; name: string }
  ad_group?: { id: number; name: string }
  status?: 'enabled' | 'paused'
  /** Optional only until the backend that ships contract 3.1 is deployed; undefined = no sticker. */
  verdict?: KeywordVerdict
  /** Spend-weighted shares summing to ~1; null if no classified terms. */
  intent_mix: Partial<Record<Intent, number>> | null
  /** Visible search-term spend / keyword spend, 0-1. */
  intent_coverage: number | null
  conversions_by_action: {
    conversion_action_id: number
    name: string
    tier: ValueTier | null
    conversions: number
    value_micros: number
  }[]
  /** null = no vehicle link, or inventory unavailable. */
  stock_count: number | null
  avg_days_listed: number | null
  /** Spend share on non-buyer intents with zero conversions, 0-1. */
  waste_exposure: number | null
}

export interface KeywordSummaryResponse {
  items: KeywordSummary[]
  /** Overall visible-search-term spend / total keyword spend. */
  coverage: number | null
}

export interface TriggerKeywordOptimizerResponse {
  run_id: number
}
