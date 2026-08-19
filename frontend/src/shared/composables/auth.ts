import { ref, computed } from 'vue'
import { api } from '../api/api'

// Shared singleton, same localStorage-backed pattern as theme.ts/
// consoleState.ts. Persisting the token across refreshes is fine for UX —
// a real backend restart invalidates it server-side regardless (see
// platform/auth.ts), which is what actually needs to force a fresh login.
const TOKEN_KEY = 'pitstop-auth-token'
export const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
export const isAuthenticated = computed(() => !!token.value)

function setToken(value: string | null) {
  token.value = value
  if (value) {
    localStorage.setItem(TOKEN_KEY, value)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export async function login(username: string, password: string) {
  const { token: newToken } = await api.login(username, password)
  setToken(newToken)
}

export async function logout() {
  try {
    await api.logout()
  } catch {
    // best-effort — the token is being cleared client-side regardless
  }
  setToken(null)
}

export function clearToken() {
  setToken(null)
}
