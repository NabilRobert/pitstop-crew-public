import type {
  AppConfig,
  SystemHealth,
  Campaign,
  PerformanceRow,
  SegmentPerformanceRow,
  Settings,
  GradeTrend,
  RunTrace,
  EventPayloads,
  LearningSuggestion,
  TriggerRunResponse,
  Report,
  ReportListEntry,
  AiOutput,
  WhyTrailEntry,
  AskHistoryEntry,
  AskConversation,
  AskResponse,
  TimeMachineOverrideMap,
  ForcedState,
  VoiceAgentType,
  AssistantAskResponse,
  AssistantAskEntry,
  AssistantConversation,
  AdGroupPerformanceRow,
  KeywordPerformanceRow,
  SearchTermPerformanceRow,
  AdPerformanceRow,
  ConversionActionRow,
  AssetGroupPerformanceRow,
  RecommendationRow,
  ChangeEventRow,
  Suggestion,
  SuggestionStatus,
  SuggestionsQuery,
  SuggestionsResponse,
  InventorySummary,
  KeywordSummaryResponse,
  TriggerKeywordOptimizerResponse,
} from './types'
import type { Locale } from '../../i18n/index.js'

/** An Error that also carries the HTTP status, so callers can tell "the route does not exist" (404)
 * from "the server could not be reached" without parsing the message. Still a plain Error to
 * anything that only reads `.message`. */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TOKEN_KEY = 'pitstop-auth-token'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...(options.headers as Record<string, string>),
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    if (res.status === 401) localStorage.removeItem(TOKEN_KEY)
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.detail || `Request failed: ${res.status}`, res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// TTS returns raw audio bytes, not JSON — bypasses request()'s res.json().
async function requestAudio(path: string, body: unknown): Promise<Blob> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    if (res.status === 401) localStorage.removeItem(TOKEN_KEY)
    const detail = await res.json().catch(() => ({}))
    throw new ApiError(detail.detail || `Request failed: ${res.status}`, res.status)
  }
  return res.blob()
}

// The negatives export is a file download (CSV/TXT), not JSON, and needs the
// auth header — so it can't be a plain <a href>. Returns the raw Blob.
async function requestBlob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    if (res.status === 401) localStorage.removeItem(TOKEN_KEY)
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.detail || `Request failed: ${res.status}`, res.status)
  }
  return res.blob()
}

function queryString(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; role: 'owner' | 'demo' }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  verifyAuth: () => request<{ ok: true; role: 'owner' | 'demo' }>('/auth/verify'),
  config: () => request<AppConfig>('/config'),
  systemHealth: () => request<SystemHealth>('/system-health'),
  campaigns: () => request<Campaign[]>('/campaigns'),
  performance: (days = 30) => request<PerformanceRow[]>(`/performance?days=${days}`),
  adGroupPerformance: (days = 30, campaignId?: number) =>
    request<AdGroupPerformanceRow[]>(`/ad-groups/performance?days=${days}${campaignId ? `&campaignId=${campaignId}` : ''}`),
  keywordPerformance: (days = 30, adGroupId?: number) =>
    request<KeywordPerformanceRow[]>(`/keywords/performance?days=${days}${adGroupId ? `&adGroupId=${adGroupId}` : ''}`),
  searchTermPerformance: (days = 30, keywordId?: number) =>
    request<SearchTermPerformanceRow[]>(`/search-terms/performance?days=${days}${keywordId ? `&keywordId=${keywordId}` : ''}`),
  adPerformance: (days = 30, adGroupId?: number) =>
    request<AdPerformanceRow[]>(`/ads/performance?days=${days}${adGroupId ? `&adGroupId=${adGroupId}` : ''}`),
  conversionActionBreakdown: (days = 30) =>
    request<ConversionActionRow[]>(`/conversion-actions/performance?days=${days}`),
  assetGroupPerformance: (days = 30) =>
    request<AssetGroupPerformanceRow[]>(`/asset-groups/performance?days=${days}`),
  recommendations: (days = 30) => request<RecommendationRow[]>(`/recommendations?days=${days}`),
  changeEvents: (days = 30) => request<ChangeEventRow[]>(`/change-events?days=${days}`),
  segmentPerformance: (days = 30) => request<SegmentPerformanceRow[]>(`/segments/performance?days=${days}`),
  settings: () => request<Settings>('/settings'),
  updateSettings: (payload: Partial<Settings>) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  gradeTrend: (weeks = 8) => request<GradeTrend>(`/learning/grade-trend?weeks=${weeks}`),
  runTrace: (id: number | string) => request<RunTrace>(`/pipeline/runs/${id}/trace`),
  eventPayloads: (id: number) => request<EventPayloads>(`/trace/events/${id}/payloads`),
  learningSuggestions: (limit = 20) => request<LearningSuggestion[]>(`/learning/suggestions?limit=${limit}`),
  triggerRun: (period: string) =>
    request<TriggerRunResponse>('/pipeline/run', { method: 'POST', body: JSON.stringify({ period }) }),
  latestReport: (period = 'daily') => request<Report>(`/reports/latest?period=${period}`),
  reportsList: (period = 'daily') => request<ReportListEntry[]>(`/reports?period=${period}`),
  reportById: (id: number | string) => request<Report>(`/reports/${id}`),
  output: (id: number) => request<AiOutput>(`/outputs/${id}`),
  whyTrail: (id: number) => request<WhyTrailEntry[]>(`/outputs/${id}/why-trail`),
  askConversations: (outputId: number) => request<AskConversation[]>(`/outputs/${outputId}/ask-conversations`),
  startAskConversation: (outputId: number) =>
    request<{ id: number }>(`/outputs/${outputId}/ask-conversations`, { method: 'POST' }),
  askConversationMessages: (conversationId: number) =>
    request<AskHistoryEntry[]>(`/ask-conversations/${conversationId}/messages`),
  ask: (outputId: number, conversationId: number, question: string, language?: Locale) =>
    request<AskResponse>('/ask', {
      method: 'POST',
      body: JSON.stringify({ output_id: outputId, conversation_id: conversationId, question, language }),
    }),
  timeMachineOverrides: () => request<TimeMachineOverrideMap>('/time-machine/overrides'),
  setTimeMachineOverride: (date: string, forcedState: ForcedState) =>
    request<void>('/time-machine/override', {
      method: 'POST',
      body: JSON.stringify({ date, forced_state: forcedState }),
    }),
  clearTimeMachineOverride: (date: string) => request<void>(`/time-machine/override/${date}`, { method: 'DELETE' }),
  tts: (text: string, agentType: VoiceAgentType) => requestAudio('/tts', { text, agentType }),
  stt: async (audio: Blob, language?: Locale, filename = 'recording.webm'): Promise<{ text: string }> => {
    const form = new FormData()
    form.append('audio', audio, filename)
    if (language) form.append('language', language)
    const res = await fetch(`${BASE_URL}/stt`, { method: 'POST', headers: authHeaders(), body: form })
    if (!res.ok) {
      if (res.status === 401) localStorage.removeItem(TOKEN_KEY)
      const body = await res.json().catch(() => ({}))
      throw new ApiError(body.detail || `Request failed: ${res.status}`, res.status)
    }
    return res.json()
  },
  assistantConversations: () => request<AssistantConversation[]>('/assistant/conversations'),
  startAssistantConversation: () => request<{ id: number }>('/assistant/conversations', { method: 'POST' }),
  assistantConversationMessages: (conversationId: number) =>
    request<AssistantAskEntry[]>(`/assistant/conversations/${conversationId}/messages`),
  assistantAsk: (conversationId: number, question: string, language?: Locale) =>
    request<AssistantAskResponse>('/assistant/ask', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId, question, language }),
    }),
  deleteAssistantConversation: (conversationId: number) =>
    request<void>(`/assistant/conversations/${conversationId}`, { method: 'DELETE' }),
  renameAssistantConversation: (conversationId: number, title: string) =>
    request<AssistantConversation>(`/assistant/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  // Overhaul v3 — keyword optimizer (overhaul-v3.md section 13, contract 3.0).
  keywordSuggestions: (query: SuggestionsQuery = {}) =>
    request<SuggestionsResponse>(`/keyword-suggestions${queryString({ ...query })}`),
  updateKeywordSuggestion: (id: number, status: Exclude<SuggestionStatus, 'superseded'>) =>
    request<Suggestion>(`/keyword-suggestions/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  exportCampaignBrief: (id: number, format: 'csv' | 'txt' = 'csv') =>
    requestBlob(`/keyword-suggestions/${id}/brief${queryString({ format })}`),
  exportKeywordSuggestions: (format: 'csv' | 'txt' = 'csv', status: SuggestionStatus | 'all' = 'open') =>
    requestBlob(`/keyword-suggestions/export${queryString({ type: 'negative_keyword', status, format })}`),
  keywordSummary: (days = 30, adGroupId?: number) =>
    request<KeywordSummaryResponse>(`/keywords/summary${queryString({ days, adGroupId })}`),
  inventorySummary: () => request<InventorySummary>('/inventory/summary'),
  triggerKeywordOptimizer: () =>
    request<TriggerKeywordOptimizerResponse>('/keyword-optimizer/run', { method: 'POST' }),
}
