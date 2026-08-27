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
  VoiceAgentType,
  AssistantAskResponse,
  AssistantAskEntry,
} from './types'

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
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }
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
    throw new Error(detail.detail || `Request failed: ${res.status}`)
  }
  return res.blob()
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
  tts: (text: string, agentType: VoiceAgentType) => requestAudio('/tts', { text, agentType }),
  stt: async (audio: Blob, filename = 'recording.webm'): Promise<{ text: string }> => {
    const form = new FormData()
    form.append('audio', audio, filename)
    const res = await fetch(`${BASE_URL}/stt`, { method: 'POST', headers: authHeaders(), body: form })
    if (!res.ok) {
      if (res.status === 401) localStorage.removeItem(TOKEN_KEY)
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Request failed: ${res.status}`)
    }
    return res.json()
  },
  assistantAskHistory: () => request<AssistantAskEntry[]>('/assistant/ask-history'),
  assistantAsk: (question: string) =>
    request<AssistantAskResponse>('/assistant/ask', { method: 'POST', body: JSON.stringify({ question }) }),
}
