import type {
  AppConfig,
  SystemHealth,
  Campaign,
  PerformanceRow,
  SegmentPerformanceRow,
  Settings,
  FlagRateWeek,
  LearningSuggestion,
  TriggerRunResponse,
  Report,
  ReportListEntry,
  AiOutput,
  WhyTrailEntry,
  AskHistoryEntry,
  AskResponse,
  TimeMachineOverrideMap,
  ForcedState,
} from './types'

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TOKEN_KEY = 'pitstop-auth-token'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    if (res.status === 401) localStorage.removeItem(TOKEN_KEY)
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }
  return res.json()
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  verifyAuth: () => request<{ ok: true }>('/auth/verify'),
  config: () => request<AppConfig>('/config'),
  systemHealth: () => request<SystemHealth>('/system-health'),
  campaigns: () => request<Campaign[]>('/campaigns'),
  performance: (days = 30) => request<PerformanceRow[]>(`/performance?days=${days}`),
  segmentPerformance: (days = 30) => request<SegmentPerformanceRow[]>(`/segments/performance?days=${days}`),
  settings: () => request<Settings>('/settings'),
  updateSettings: (payload: Partial<Settings>) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  flagRateTrend: (weeks = 8) => request<FlagRateWeek[]>(`/learning/flag-rate?weeks=${weeks}`),
  learningSuggestions: (limit = 20) => request<LearningSuggestion[]>(`/learning/suggestions?limit=${limit}`),
  triggerRun: (period: string) =>
    request<TriggerRunResponse>('/pipeline/run', { method: 'POST', body: JSON.stringify({ period }) }),
  latestReport: (period = 'daily') => request<Report>(`/reports/latest?period=${period}`),
  reportsList: (period = 'daily') => request<ReportListEntry[]>(`/reports?period=${period}`),
  reportById: (id: number | string) => request<Report>(`/reports/${id}`),
  output: (id: number) => request<AiOutput>(`/outputs/${id}`),
  whyTrail: (id: number) => request<WhyTrailEntry[]>(`/outputs/${id}/why-trail`),
  askHistory: (outputId: number) => request<AskHistoryEntry[]>(`/outputs/${outputId}/ask-history`),
  ask: (outputId: number, question: string) =>
    request<AskResponse>('/ask', { method: 'POST', body: JSON.stringify({ output_id: outputId, question }) }),
  timeMachineOverrides: () => request<TimeMachineOverrideMap>('/time-machine/overrides'),
  setTimeMachineOverride: (date: string, forcedState: ForcedState) =>
    request<void>('/time-machine/override', {
      method: 'POST',
      body: JSON.stringify({ date, forced_state: forcedState }),
    }),
  clearTimeMachineOverride: (date: string) => request<void>(`/time-machine/override/${date}`, { method: 'DELETE' }),
}
