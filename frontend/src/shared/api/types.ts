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
  run_type: 'daily' | 'weekly' | 'weekly_feedback'
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
}

export interface TriggerRunResponse {
  started: true
  period: string
  target_date: string
  runId: number
}

export interface FlagRateWeek {
  week: string
  flagged: number
  total: number
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
