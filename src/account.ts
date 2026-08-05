// Password-account client: key derivation and the register/login calls.
//
// The one secret a password user types must do two jobs — prove who they are to
// the server, and unlock a vault the server must never be able to read. Sending
// the password would hand the server both. Instead the browser derives two
// values (the Bitwarden/1Password construction):
//
//   masterKey = PBKDF2(password, salt = "rebuttal|v1|" + username, 600k rounds)
//   authHash  = PBKDF2(masterKey, salt = password, 1 round)
//
// Only authHash crosses the wire. It is a one-way function of masterKey, so
// nothing the server stores, logs, or leaks walks back to the key that opens
// the vault. masterKey becomes this device's vault key (src/vault.ts adoptKey)
// — which is why logging in IS unlocking, with no second passphrase.
//
// This module knows nothing about IndexedDB or CryptoKeys: it derives bytes
// and talks HTTP. Handing the key to the vault is App's job, which keeps "who
// am I" (here) and "what can decrypt" (vault.ts) separable concerns.

import type { AccountUser } from './auth'

/** Matches PBKDF2_ITERATIONS in src/vault.ts — same OWASP guidance, same trade. */
const CLIENT_ITERATIONS = 600_000
const SALT_PREFIX = 'rebuttal|v1|'

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,32}$/
export const PASSWORD_MIN_LENGTH = 10

/**
 * Case and stray whitespace must not change the derived key: the username sits
 * inside the KDF salt, so "Basil" and "basil" would otherwise derive different
 * keys and the vault would silently fail to open. Normalise once, everywhere.
 */
export const normalizeUsername = (username: string) => username.trim().toLowerCase()

export class AccountError extends Error {}
export class UsernameTakenError extends AccountError {
  constructor() {
    super('username-taken')
  }
}
export class BadCredentialsError extends AccountError {
  constructor() {
    super('bad-credentials')
  }
}
export class RateLimitedError extends AccountError {
  constructor() {
    super('rate-limited')
  }
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function pbkdf2(secret: BufferSource, salt: BufferSource, iterations: number): Promise<ArrayBuffer> {
  const material = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, 256)
}

export interface DerivedCredentials {
  /** Becomes this device's vault key. Never leaves the browser. */
  masterKeyBytes: Uint8Array
  /** The only secret sent to the server. A one-way function of masterKey. */
  authHash: string
}

export async function deriveCredentials(username: string, password: string): Promise<DerivedCredentials> {
  const encoder = new TextEncoder()
  const masterKey = await pbkdf2(
    encoder.encode(password) as unknown as BufferSource,
    encoder.encode(SALT_PREFIX + normalizeUsername(username)) as unknown as BufferSource,
    CLIENT_ITERATIONS
  )
  // One round: this hash exists to be one-way, not slow — the 600k rounds above
  // already made its input expensive to guess. Salting with the password binds
  // the hash to both values without transmitting either.
  const authBits = await pbkdf2(masterKey, encoder.encode(password) as unknown as BufferSource, 1)
  return { masterKeyBytes: new Uint8Array(masterKey), authHash: toBase64(new Uint8Array(authBits)) }
}

// --- server transport -------------------------------------------------------

export interface AuthSuccess {
  user: AccountUser
  masterKeyBytes: Uint8Array
}

/** POST to an auth endpoint, mapping error codes to typed errors the dialog can render. */
async function postAuth(path: string, body: Record<string, string>): Promise<AccountUser> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (response.ok) {
    if (data?.user) return data.user as AccountUser
    throw new AccountError('malformed-response')
  }
  if (data?.code === 'username-taken') throw new UsernameTakenError()
  if (data?.code === 'bad-credentials') throw new BadCredentialsError()
  if (response.status === 429) throw new RateLimitedError()
  throw new AccountError(typeof data?.error === 'string' ? data.error : 'auth-failed')
}

export async function register(username: string, password: string, email: string): Promise<AuthSuccess> {
  const { masterKeyBytes, authHash } = await deriveCredentials(username, password)
  const body: Record<string, string> = { username: username.trim(), authHash }
  if (email.trim()) body.email = email.trim()
  const user = await postAuth('/api/auth/register', body)
  return { user, masterKeyBytes }
}

export async function loginLocal(username: string, password: string): Promise<AuthSuccess> {
  const { masterKeyBytes, authHash } = await deriveCredentials(username, password)
  const user = await postAuth('/api/auth/login', { username: username.trim(), authHash })
  return { user, masterKeyBytes }
}
