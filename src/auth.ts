// Sign-in client. Thin by design — the session lives in an HttpOnly cookie the
// browser manages, so there is no token for this file to hold or leak.

export interface AccountUser {
  id: string
  provider: string
  email: string
  name: string
  picture: string
  language: string
}

export interface AuthState {
  /** Whether this deployment has any sign-in method configured at all */
  configured: boolean
  providers: string[]
  user: AccountUser | null
}

export const SIGNED_OUT: AuthState = { configured: false, providers: [], user: null }

export async function fetchAuthState(): Promise<AuthState> {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (!response.ok) return SIGNED_OUT
    const data = await response.json()
    return {
      configured: !!data?.configured,
      providers: Array.isArray(data?.providers) ? data.providers : [],
      user: data?.user ?? null,
    }
  } catch {
    // Offline, or running without Functions (plain `vite dev`) — sign-in simply hides
    return SIGNED_OUT
  }
}

/** Full-page redirect: OAuth cannot complete inside fetch. */
export function signIn(provider: string, next: string = window.location.pathname + window.location.search) {
  window.location.href = `/api/auth/${provider}/start?next=${encodeURIComponent(next)}`
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
}

export async function saveLanguagePreference(language: string): Promise<void> {
  await fetch('/api/prefs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ language }),
  }).catch(() => {})
}

/** Human-readable reason for a failed sign-in, from the ?auth_error= redirect. */
export function authErrorMessage(code: string): string {
  switch (code) {
    case 'cancelled':
      return ''
    case 'expired':
      return 'That sign-in link expired. Please try again.'
    case 'exchange_failed':
      return 'Could not complete sign-in with the provider. Please try again.'
    case 'invalid_token':
      return 'The sign-in response could not be verified. Please try again.'
    default:
      return 'Sign-in did not complete. Please try again.'
  }
}
