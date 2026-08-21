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
import type { VaultBlob } from './vault'

/**
 * Frozen, not tunable. This value is baked into every stored authHash and every
 * sealed vault blob the moment an account is created. Raising it later — even
 * to track future OWASP guidance — does not take effect for existing accounts;
 * it silently produces a different masterKey than the one the server verified
 * against, locking the account out with no password reset to recover with.
 * Changing it for real means a migration: re-derive under the new value at a
 * known point (e.g. next successful login) and re-seal the vault, not a
 * one-line bump here.
 */
const CLIENT_ITERATIONS = 600_000
/**
 * The "v1" is not decorative: it is the version of this exact derivation
 * (this salt shape + CLIENT_ITERATIONS + the authHash construction below). A
 * "v2" would derive a different masterKey for every current user, so shipping
 * one requires the same migration as changing CLIENT_ITERATIONS — re-derive
 * and re-seal — not a find-and-replace of the string.
 */
const SALT_PREFIX = 'rebuttal|v1|'

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,32}$/
export const PASSWORD_MIN_LENGTH = 10

/**
 * Case and stray whitespace must not change the derived key: the username sits
 * inside the KDF salt, so "Basil" and "basil" would otherwise derive different
 * keys and the vault would silently fail to open. Normalise once, everywhere.
 */
export const normalizeUsername = (username: string) => username.trim().toLowerCase()

/**
 * Every error in this family carries a stable machine code as its `message`,
 * never a sentence — the same contract src/instant.ts uses. The UI renders
 * twelve locales, so a human-readable `message` would be an English string
 * that no translation could reach. Callers switch on the type (or the code)
 * and look up their own copy; nothing here is ever shown to a user verbatim.
 */
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
/**
 * The email field is the one input the dialog does NOT pre-validate (the
 * server owns the shape), so this is reached by ordinary typos, not just by
 * callers bypassing the UI.
 */
export class EmailInvalidError extends AccountError {
  constructor() {
    super('email-invalid')
  }
}
/**
 * Should be unreachable from the dialog, which tests USERNAME_PATTERN before
 * submitting. Mapped anyway: an unmapped code falls through to the server's
 * English sentence, and "unreachable" is a claim about today's callers.
 */
export class UsernameInvalidError extends AccountError {
  constructor() {
    super('username-invalid')
  }
}
/** A KV or crypto failure the server caught and shaped (register.js / login.js). */
export class AuthServerError extends AccountError {
  constructor() {
    super('server-error')
  }
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Exported for src/recovery.ts, which derives its own credentials with the
 * same construction. Shared rather than copied on purpose: this is the one
 * helper where a future hardening (a different hash, a wider output) must
 * reach both paths at once. A second copy would let the recovery derivation
 * drift quietly out of step with the password one, and the only symptom would
 * be a docblock that claims equal strength while no longer delivering it.
 */
export async function pbkdf2(secret: BufferSource, salt: BufferSource, iterations: number): Promise<ArrayBuffer> {
  const material = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, 256)
}

export interface DerivedCredentials {
  /**
   * Becomes this device's vault key. Never leaves the browser. Deliberately
   * left un-zeroed after use: by the time a caller could `.fill(0)` it, the
   * runtime (String/TypedArray internals, GC copies, JIT temporaries) may
   * already hold copies script has no way to reach, so scrubbing this one
   * array is theatre, not a guarantee. The real mitigation is keeping the
   * window this exists as plain bytes short — adoptKey() in src/vault.ts
   * immediately imports it as a non-extractable CryptoKey and nothing should
   * hold a reference to these bytes past that call.
   */
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

/**
 * user is a plain loggable record; masterKeyBytes is the raw secret that opens
 * the vault. This type carries both together for caller convenience, but that
 * means it must never be logged, serialized, or persisted as a whole — only
 * masterKeyBytes' single intended trip is into adoptKey().
 */
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
  // Every code the endpoints emit gets a type. The alternative — falling
  // through to `data.error` — surfaces the server's hardcoded English sentence
  // in a twelve-locale app, which is worse than a generic translated message.
  switch (data?.code) {
    case 'username-taken':
      throw new UsernameTakenError()
    case 'bad-credentials':
      throw new BadCredentialsError()
    case 'email-invalid':
      throw new EmailInvalidError()
    case 'username-invalid':
      throw new UsernameInvalidError()
    case 'server-error':
      throw new AuthServerError()
  }
  // Matched on status, not data?.code === 'rate-limited': a 429 thrown by an
  // edge proxy or CDN in front of the API may carry no JSON body at all (or
  // an HTML one), so data?.code would simply be undefined and this case
  // would fall through to a generic AccountError instead of RateLimitedError.
  if (response.status === 429) throw new RateLimitedError()
  // Deliberately NOT data.error: the codeless failures (a 400 'Malformed
  // request.', the 403 same-origin gate, the 501 unconfigured answer) all
  // carry English prose, and none of them is something a user can act on
  // differently from any other unexpected failure.
  throw new AccountError('auth-failed')
}

export async function register(username: string, password: string, email: string): Promise<AuthSuccess> {
  const { masterKeyBytes, authHash } = await deriveCredentials(username, password)
  // Sends the display-case username (only trimmed, not lowercased): the server
  // wants to preserve what the user actually typed for display purposes and
  // normalizes independently for the lookup/uniqueness check. Asymmetric with
  // loginLocal below on purpose.
  const body: Record<string, string> = { username: username.trim(), authHash }
  if (email.trim()) body.email = email.trim()
  const user = await postAuth('/api/auth/register', body)
  return { user, masterKeyBytes }
}

export async function loginLocal(username: string, password: string): Promise<AuthSuccess> {
  const { masterKeyBytes, authHash } = await deriveCredentials(username, password)
  // normalizeUsername(), not .trim(): login has no display purpose, so this
  // makes the helper the single source of the normalization contract rather
  // than re-deriving "trim + lowercase" ad hoc at each call site.
  const user = await postAuth('/api/auth/login', { username: normalizeUsername(username), authHash })
  return { user, masterKeyBytes }
}

// --- password reset by recovery code ----------------------------------------
//
// Two calls, and the split is the safety property. `begin` writes nothing: it
// only proves possession of the code and hands back the DEK copy that code
// opens, so every failure up to and including it leaves the account exactly as
// it was — the old password still signs in, the old code still verifies.
// `complete` is where anything changes, and it changes everything at once.
//
// Neither the code nor the new password appears here. What crosses the wire is
// `recoveryAuth` (a one-way function of the code), `authHash` (a one-way
// function of the new password) and ciphertext this server cannot open.

/**
 * The account is not in a state a reset can safely rewrite — some blob is still
 * sealed under the master key this reset is about to replace.
 *
 * Client-side only, and deliberately so: see the "not-fully-migrated guard"
 * note in the plan. Nothing on the server refuses a v1 account, so posting to
 * /api/auth/recover/complete directly bypasses this. The cost of bypassing it
 * is your own v1 blobs and nobody else's, and the endpoint is already
 * possession-gated by the recovery code.
 */
export class RecoveryBlockedError extends AccountError {
  constructor() {
    super('recovery-blocked')
  }
}

/**
 * Both generations of the recovery-wrapped DEK copy, exactly as begin serves
 * them.
 *
 * `previousByRecovery` is not an optimisation and callers may not drop it. A
 * reset interrupted between complete's first and second writes leaves the
 * CURRENT byRecovery sealed under a code whose verifier never landed — so the
 * code the caller just proved possession of can only open the previous copy.
 * A caller that reads only `byRecovery` hands that user ciphertext they cannot
 * open and calls their correct code wrong. See unwrapDekWithPrevious().
 */
export interface RecoveredDek {
  byRecovery: VaultBlob
  previousByRecovery: VaultBlob | null
}

/** Step one: prove the code and receive the DEK copies it may open. */
export async function recoverBegin(username: string, recoveryAuth: string): Promise<RecoveredDek> {
  const response = await fetch('/api/auth/recover/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username: normalizeUsername(username), recoveryAuth }),
  })
  const data = await response.json().catch(() => null)
  if (response.ok && data?.byRecovery) {
    return {
      byRecovery: data.byRecovery as VaultBlob,
      // `?? null` rather than a presence check: an older deployment that does
      // not serve the field at all and one with no previous generation are the
      // same thing to the caller — no fallback available.
      previousByRecovery: (data.previousByRecovery ?? null) as VaultBlob | null,
    }
  }
  if (response.status === 429) throw new RateLimitedError()
  // One error for a wrong code, an unknown username, and an account with no DEK
  // record — matching the endpoint, which answers all three identically on
  // purpose. Mapping them apart here would invent a distinction the response
  // does not carry.
  throw new BadCredentialsError()
}

/** Step two: install the new password, the re-wrapped DEK, and the rotated code. */
export async function recoverComplete(args: {
  username: string
  recoveryAuth: string
  authHash: string
  recoveryAuthNext: string
  dek: { byPassword: VaultBlob; byRecovery: VaultBlob }
}): Promise<void> {
  const response = await fetch('/api/auth/recover/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...args, username: normalizeUsername(args.username) }),
  })
  if (response.ok) return
  if (response.status === 429) throw new RateLimitedError()
  // Anything else — including the 500 for a verified code against an account
  // with no user record — is "the reset did not happen". That is the only fact
  // the caller needs, and it is true of every non-2xx: the endpoint's writes
  // begin only after both credential checks have passed.
  throw new BadCredentialsError()
}
