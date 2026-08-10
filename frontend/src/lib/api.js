export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }
  return res.json()
}

export const api = {
  config: () => request('/config'),
  systemHealth: () => request('/system-health'),
  campaigns: () => request('/campaigns'),
  performance: (days = 30) => request(`/performance?days=${days}`),
  segmentPerformance: (days = 30) => request(`/segments/performance?days=${days}`),
  settings: () => request('/settings'),
  updateSettings: (payload) => request('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  flagRateTrend: (weeks = 8) => request(`/learning/flag-rate?weeks=${weeks}`),
  learningSuggestions: (limit = 20) => request(`/learning/suggestions?limit=${limit}`),
  triggerRun: (period) => request('/pipeline/run', { method: 'POST', body: JSON.stringify({ period }) }),
  latestReport: (period = 'daily') => request(`/reports/latest?period=${period}`),
  reportsList: (period = 'daily') => request(`/reports?period=${period}`),
  reportByDate: (period, date) => request(`/reports/${date}?period=${period}`),
  output: (id) => request(`/outputs/${id}`),
  whyTrail: (id) => request(`/outputs/${id}/why-trail`),
  askHistory: (outputId) => request(`/outputs/${outputId}/ask-history`),
  ask: (outputId, question) =>
    request('/ask', { method: 'POST', body: JSON.stringify({ output_id: outputId, question }) }),
  timeMachineOverrides: () => request('/time-machine/overrides'),
  setTimeMachineOverride: (date, forcedState) =>
    request('/time-machine/override', {
      method: 'POST',
      body: JSON.stringify({ date, forced_state: forcedState }),
    }),
  clearTimeMachineOverride: (date) =>
    request(`/time-machine/override/${date}`, { method: 'DELETE' }),
}
