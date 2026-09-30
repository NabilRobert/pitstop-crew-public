import { ref, computed } from 'vue'
import { api } from '../api/api'

// Shared singleton, same localStorage-backed pattern as theme.ts/
// consoleState.ts. Persisting the token across refreshes is fine for UX —
// a real backend restart invalidates it server-side regardless (see
// platform/auth.ts), which is what actually needs to force a fresh login.
const TOKEN_KEY = 'pitstop-auth-token'
const ROLE_KEY = 'pitstop-auth-role'
export type Role = 'owner' | 'demo'
export const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
// The demo account is read-only server-side (403 on every write); the UI uses
// this only to hide controls that would fail, never as the access check.
export const role = ref<Role>(localStorage.getItem(ROLE_KEY) === 'demo' ? 'demo' : 'owner')
export const isAuthenticated = computed(() => !!token.value)
export const isDemo = computed(() => role.value === 'demo')

function setToken(value: string | null, newRole: Role = 'owner') {
  token.value = value
  role.value = newRole
  if (value) {
    localStorage.setItem(TOKEN_KEY, value)
    localStorage.setItem(ROLE_KEY, newRole)
  } else {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(ROLE_KEY)
  }
}

export async function login(username: string, password: string) {
  const { token: newToken, role: newRole } = await api.login(username, password)
  setToken(newToken, newRole)
}

/** Re-sync the role from the server for a token restored from localStorage. */
export function setRole(newRole: Role) {
  role.value = newRole
  localStorage.setItem(ROLE_KEY, newRole)
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
