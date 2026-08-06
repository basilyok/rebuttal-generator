# Password Accounts + Primary Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Username-password sign-up/sign-in where one secret both authenticates and unlocks the zero-knowledge vault (spec: `docs/superpowers/specs/2026-08-05-password-accounts-design.md`), plus the cutover to `rebut.m36x.com` as the primary domain.

**Architecture:** The browser derives two values from the password (Bitwarden-style split derivation): `masterKey` (never transmitted, becomes the device vault key) and `authHash` (the only secret sent, re-hashed server-side before storage). Server endpoints are Cloudflare Pages Functions over the existing `ACCOUNTS` KV, reusing `session.js` cookie sessions, the `gate.js` same-origin check, and a newly-extracted flood-brake factory. The Google OAuth flow and the passphrase vault for Google users are untouched.

**Tech Stack:** React 18 + TypeScript (Vite), WebCrypto PBKDF2/AES-GCM, Cloudflare Pages Functions (plain JS), KV, `node --test` + `tsx`.

**The invariant every task must preserve:** the server never holds anything that can decrypt a user's API keys or history. `authHash` is a one-way function of `masterKey`; no code path may send the password or `masterKey` to any endpoint.

---

## File structure

| File | Status | One responsibility |
|---|---|---|
| `src/account.ts` | create | Split derivation + register/login HTTP calls + typed errors. Knows nothing about IndexedDB or CryptoKeys. |
| `src/AuthDialog.tsx` | create | The sign-in/sign-up card (two modes, one component), styled after `VaultDialog`. |
| `src/vault.ts` | modify | Accept an externally-derived key: `adoptKey()`, `unlockWithKey()`. Nothing else changes. |
| `src/AccountBar.tsx` | modify | Button relabel + benefits popover. |
| `src/App.tsx` | modify | Wiring: dialog state, login-is-unlock flow, local-account branches in the vault lifecycle. |
| `src/index.css` | modify | `.signin-cluster`, `.account-benefits`, `.auth-divider`, `.auth-google`. |
| `src/i18n/locales/*.ts` (12) | modify | 27 new `account.*` keys; `account.signInWithGoogle` removed. |
| `functions/_lib/password.js` | create | Server-side hash/verify of `authHash`. Constant-time compare. |
| `functions/_lib/ratelimit.js` | create | `makeFloodBrake()` factory (extracted from the two existing copies). |
| `functions/_lib/session.js` | modify | Add `passwordKey()`. |
| `functions/api/auth/register.js` | create | Validate → claim username → store credential → mint session. |
| `functions/api/auth/login.js` | create | Verify credential → mint session. Timing-flat, oracle-free. |
| `functions/api/auth/me.js` | modify | Report `local` as an available provider whenever `ACCOUNTS` is bound. |
| `functions/api/share.js`, `functions/api/generate.ts` | modify | Swap their inline flood brakes for the factory (behavior identical). |
| `tests/account.test.ts` | create | Derivation invariants + vault round-trip. |
| `tests/password.test.mjs` | create | Server hash/verify unit tests. |
| `tests/auth-endpoints.test.mjs` | create | HTTP tests against `wrangler pages dev`. |
| `tests/i18n-account.test.mjs` | create | Locale key-parity check for the new strings. |
| `functions/api/generate.ts:159`, `src/providers.ts`, `src/turnstile.ts`, `README.md`, `DEPLOYMENT_GUIDE.md`, `PROJECT_SUMMARY.md`, `wrangler.toml` | modify | Domain cutover + docs. |

Two deliberate deviations from the spec, both narrowings:

1. **No separate `username:<name>` index row.** User ids are `local:<lowercased-username>`, so the user record's own key IS the uniqueness index; a second row would be a redundant write that can drift. The ship task amends the spec with one line saying so.
2. **No `upsertLocalUser()` wrapper.** The existing `upsertUser` already does everything needed once handed `provider: 'local'` — register passes the display-case name, login passes only the subject (after credential verification, the exact call the Google callback makes), and field discipline stays in one place instead of two.

---

### Task 1: Client derivation core (`src/account.ts`, `src/vault.ts`) with unit tests

**Goal:** The split derivation exists, is proven deterministic/sensitive/normalized, and a vault sealed under a derived master key round-trips through a simulated fresh login.

**Files:**
- Create: `src/account.ts`
- Modify: `src/vault.ts` (two new exports at the end of the crypto section, after `openJson`)
- Test: `tests/account.test.ts`

**Acceptance Criteria:**
- [x] `deriveCredentials` is deterministic, and changes with either username or password
- [x] Username case/whitespace do not change the derived values
- [x] `authHash` ≠ base64 of `masterKeyBytes`
- [x] Vault sealed via `adoptKey` + `sealJson` opens after re-derivation, fails with wrong password
- [x] `npm run build` passes (tsc + vite)

**Verify:** `node --import tsx --test tests/account.test.ts` → all pass (expect a few seconds: each derivation really runs 600k PBKDF2 rounds)

**Steps:**

- [x] **Step 1: Write the failing test**

Create `tests/account.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveCredentials, normalizeUsername } from '../src/account'
import { adoptKey, unlockWithKey, sealJson } from '../src/vault'

// Node ships WebCrypto on globalThis.crypto (Node 20+), so the exact browser
// derivation runs here unmodified. Each deriveCredentials call really performs
// the 600k PBKDF2 rounds — a few hundred ms each is the price of testing the
// real construction instead of a knob-turned imitation.

test('derivation is deterministic and sensitive to both inputs', async () => {
  const a = await deriveCredentials('basil', 'correct horse battery')
  const b = await deriveCredentials('basil', 'correct horse battery')
  assert.equal(a.authHash, b.authHash)
  assert.deepEqual(a.masterKeyBytes, b.masterKeyBytes)

  const otherPassword = await deriveCredentials('basil', 'correct horse battery!')
  assert.notEqual(otherPassword.authHash, a.authHash)

  const otherUser = await deriveCredentials('sage', 'correct horse battery')
  assert.notEqual(otherUser.authHash, a.authHash)
  assert.notDeepEqual(otherUser.masterKeyBytes, a.masterKeyBytes)
})

test('username case and whitespace do not change the key', async () => {
  const lower = await deriveCredentials('basil', 'correct horse battery')
  const shouty = await deriveCredentials('  BASIL ', 'correct horse battery')
  assert.equal(shouty.authHash, lower.authHash)
  assert.deepEqual(shouty.masterKeyBytes, lower.masterKeyBytes)
})

test('authHash is not the master key', async () => {
  const { masterKeyBytes, authHash } = await deriveCredentials('basil', 'correct horse battery')
  assert.notEqual(authHash, Buffer.from(masterKeyBytes).toString('base64'))
})

test('vault sealed under the master key opens after a fresh login, not with the wrong password', async () => {
  const first = await deriveCredentials('basil', 'correct horse battery')
  const key = await adoptKey(first.masterKeyBytes)
  const blob = await sealJson(key, { openrouter: 'sk-or-test' })

  // Same username+password on a "new device" derives the same key
  const again = await deriveCredentials('basil', 'correct horse battery')
  const rederived = await adoptKey(again.masterKeyBytes)
  assert.deepEqual(await unlockWithKey(blob, rederived), { openrouter: 'sk-or-test' })

  const wrong = await deriveCredentials('basil', 'wrong password entirely')
  const wrongKey = await adoptKey(wrong.masterKeyBytes)
  await assert.rejects(() => unlockWithKey(blob, wrongKey))
})

test('normalizeUsername lowercases and trims', () => {
  assert.equal(normalizeUsername('  Basil '), 'basil')
  assert.equal(normalizeUsername('a_b-C'), 'a_b-c')
})
```

- [x] **Step 2: Run it to see it fail**

Run: `node --import tsx --test tests/account.test.ts`
Expected: FAIL — cannot resolve `../src/account`.

- [x] **Step 3: Create `src/account.ts`**

```ts
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
```

- [x] **Step 4: Add the two vault exports**

In `src/vault.ts`, directly after the `openJson` function (line ~244), add:

```ts
/**
 * Adopt an externally-derived key (a password account's masterKey) as this
 * device's vault key. Imported non-extractable — the same property a
 * passphrase-derived key has — and cached so it survives a reload. For
 * password accounts, logging in IS unlocking: there is no passphrase here.
 */
export async function adoptKey(rawKey: Uint8Array): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey(
    'raw',
    rawKey as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
  await cacheKey(key)
  return key
}

/** Decrypt with a caller-held key (a just-adopted one) rather than the IndexedDB cache. */
export async function unlockWithKey(blob: VaultBlob, key: CryptoKey): Promise<KeyBundle> {
  return decryptWith(key, blob)
}
```

(`cacheKey` degrades to a no-op where IndexedDB is blocked — `idb()` already swallows that — so `adoptKey` still returns a usable key for the session.)

- [x] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test tests/account.test.ts`
Expected: 5 pass, 0 fail. (Extended in code review to 13 pass, 0 fail — see the known-answer, wire-safety, and non-extractability tests added to `tests/account.test.ts`.)

Run: `npm run build`
Expected: clean tsc + vite build.

- [x] **Step 6: Commit**

```bash
git add src/account.ts src/vault.ts tests/account.test.ts
git commit -m "feat: split key derivation for password accounts (masterKey never leaves the browser)"
```

---

### Task 2: Server credential store (`password.js`, `ratelimit.js`, `session.js`) with unit tests

**Goal:** The server can store and verify an `authHash` without ever being able to replay it from a KV dump, and the per-IP flood brake becomes a shared factory instead of a third copy-paste.

**Files:**
- Create: `functions/_lib/password.js`
- Create: `functions/_lib/ratelimit.js`
- Modify: `functions/_lib/session.js` (one line), `functions/api/share.js` (swap brake), `functions/api/generate.ts` (swap brake), `wrangler.toml` (comment)
- Test: `tests/password.test.mjs`

**Acceptance Criteria:**
- [ ] `hashAuth`/`verifyAuth` round-trip; wrong hash and malformed records verify `false`, never throw
- [ ] Fresh salt per `hashAuth` call
- [ ] `share.js` and `generate.ts` behave identically through the factory (same window, same max)
- [ ] `npm run build` passes

**Verify:** `node --import tsx --test tests/password.test.mjs` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `tests/password.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { hashAuth, verifyAuth, fromBase64 } from '../functions/_lib/password.js'

const AUTH_HASH = crypto.getRandomValues(new Uint8Array(32))

test('hash then verify round-trips', async () => {
  const record = await hashAuth(AUTH_HASH)
  assert.equal(await verifyAuth(record, AUTH_HASH), true)
})

test('a different authHash fails verification', async () => {
  const record = await hashAuth(AUTH_HASH)
  const other = crypto.getRandomValues(new Uint8Array(32))
  assert.equal(await verifyAuth(record, other), false)
})

test('each hash gets a fresh salt (and therefore a fresh digest)', async () => {
  const a = await hashAuth(AUTH_HASH)
  const b = await hashAuth(AUTH_HASH)
  assert.notEqual(a.salt, b.salt)
  assert.notEqual(a.hash, b.hash)
})

test('malformed stored records verify false, never throw', async () => {
  assert.equal(await verifyAuth(null, AUTH_HASH), false)
  assert.equal(await verifyAuth({}, AUTH_HASH), false)
  assert.equal(await verifyAuth({ salt: '!!!', hash: 'AAAA', iterations: 1000 }, AUTH_HASH), false)
  assert.equal(await verifyAuth({ salt: 'AAAA', hash: 'AAAA', iterations: 0 }, AUTH_HASH), false)
})

test('fromBase64 rejects junk and accepts real base64', () => {
  assert.equal(fromBase64('not base64!!'), null)
  assert.equal(fromBase64(42), null)
  assert.deepEqual(fromBase64('AAECAw=='), new Uint8Array([0, 1, 2, 3]))
})
```

Run: `node --import tsx --test tests/password.test.mjs`
Expected: FAIL — cannot resolve `../functions/_lib/password.js`.

- [ ] **Step 2: Create `functions/_lib/password.js`**

```js
// Server-side storage of a password account's authentication hash.
//
// What arrives is never the password: the browser sends authHash, itself the
// output of 600,000 PBKDF2 rounds over the password (see src/account.ts). This
// module's job is therefore narrower than a normal password hasher's — the
// input is already a uniform 256-bit value that cannot be dictionary-attacked,
// so the re-hash here exists to make a KV dump non-REPLAYABLE, not to slow
// guessing. That is why SERVER_ITERATIONS is small: 1,000 rounds is structure
// and upgrade agility (the count is stored per record), not stretching, and it
// stays well inside the Workers CPU budget.
//
// The vault invariant holds here too: authHash is one-way derived from the
// vault key, so nothing in this file — or in a dump of what it stores — can
// decrypt anyone's keys or history.

const SERVER_ITERATIONS = 1_000
export const PASSWORD_RECORD_VERSION = 1

const toBase64 = (bytes) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Strict inverse of toBase64. Returns null (never throws) on anything malformed. */
export function fromBase64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(value)) return null
  try {
    return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0))
  } catch {
    return null
  }
}

async function pbkdf2(secretBytes, saltBytes, iterations) {
  const material = await crypto.subtle.importKey('raw', secretBytes, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    material,
    256
  )
  return new Uint8Array(bits)
}

/** Hash a just-received authHash for storage, under a fresh per-user salt. */
export async function hashAuth(authHashBytes) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(authHashBytes, salt, SERVER_ITERATIONS)
  return {
    salt: toBase64(salt),
    hash: toBase64(hash),
    iterations: SERVER_ITERATIONS,
    version: PASSWORD_RECORD_VERSION,
  }
}

/**
 * Byte-wise comparison without an early exit — an early exit would leak how
 * much of the digest matched. Length mismatch returns immediately: both sides
 * are fixed-length digests, so length is not secret.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Verify a login attempt against a stored record. False (never a throw) on any malformed input. */
export async function verifyAuth(record, authHashBytes) {
  const salt = fromBase64(record?.salt)
  const expected = fromBase64(record?.hash)
  const iterations = Number.isInteger(record?.iterations) ? record.iterations : 0
  if (!salt || !expected || iterations < 1) return false
  const actual = await pbkdf2(authHashBytes, salt, iterations)
  return timingSafeEqual(actual, expected)
}
```

Run the test again → 5 pass.

- [ ] **Step 3: Create `functions/_lib/ratelimit.js`**

```js
// Best-effort per-IP flood brake, shared by every endpoint that needs one.
// Per-isolate and per-colo, so a determined distributed attacker walks around
// it — the point is to cap what any single address can do to the KV write
// budget or the upstream spend, not to authenticate anyone. Each endpoint
// makes its own brake so tuning one never loosens another.
export function makeFloodBrake({ windowMs, max }) {
  const recentHits = new Map()
  return function overLimit(request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const now = Date.now()
    const hits = (recentHits.get(ip) || []).filter((t) => now - t < windowMs)
    hits.push(now)
    recentHits.set(ip, hits)
    // Bound the map itself: drop addresses whose whole window has passed
    if (recentHits.size > 5000) {
      for (const [key, stamps] of recentHits) {
        if (now - stamps[stamps.length - 1] >= windowMs) recentHits.delete(key)
      }
    }
    return hits.length > max
  }
}
```

- [ ] **Step 4: Swap the two inline brakes for the factory**

In `functions/api/share.js`: add `import { makeFloodBrake } from '../_lib/ratelimit.js'` under the gate import, then replace the whole block from `const RATE_WINDOW_MS = 60_000` through the closing `}` of `function overRateLimit` (lines 35–50) with:

```js
const overRateLimit = makeFloodBrake({ windowMs: 60_000, max: 6 }) // shares are a deliberate click; nobody legitimate does 7/min
```

Keep the two comment paragraphs above it (gate + flood-brake rationale); trim the flood-brake comment's last sentence if it now repeats what `ratelimit.js` says. Call sites don't change.

In `functions/api/generate.ts`: add `import { makeFloodBrake } from '../_lib/ratelimit.js'` next to the existing `gate.js` import, then replace the block from `const RATE_WINDOW_MS = 60_000` through the closing `}` of `function overRateLimit` (lines 43–58) with:

```ts
const overRateLimit = makeFloodBrake({ windowMs: 60_000, max: 5 })
```

Keep the long comment above it (device-cookie-stripping rationale, "stricter than share.js because this endpoint spends real money"). Call sites don't change.

- [ ] **Step 5: Add `passwordKey` to `functions/_lib/session.js`**

After `export const historyKey = ...` (line 20):

```js
export const passwordKey = (id) => `password:${id}`
```

(With `id = 'local:basil'` this yields `password:local:basil` — the spec's shape.) Also extend the `ACCOUNTS` comment in `wrangler.toml` line 14 to read:

```toml
# Keys are prefixed — session:<id>, user:<id>, vault:<id>, oauth:<state>, password:<id>.
```

- [ ] **Step 6: Verify nothing regressed**

Run: `node --import tsx --test tests/password.test.mjs tests/prompts.test.ts tests/history.test.ts tests/instant.test.mjs tests/generate.unit.test.mjs`
Expected: all pass (the HTTP suites need a dev server and run in Task 3).

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/password.js functions/_lib/ratelimit.js functions/_lib/session.js functions/api/share.js functions/api/generate.ts wrangler.toml tests/password.test.mjs
git commit -m "feat: server credential store for password accounts; extract the shared flood brake"
```

---

### Task 3: Auth endpoints (`register.js`, `login.js`, `me.js`) with HTTP tests

**Goal:** `/api/auth/register` and `/api/auth/login` work end-to-end against dev KV, and `/api/auth/me` advertises `local` so the client can show the right buttons.

**Files:**
- Create: `functions/api/auth/register.js`, `functions/api/auth/login.js`
- Modify: `functions/api/auth/me.js`
- Test: `tests/auth-endpoints.test.mjs`

**Acceptance Criteria:**
- [ ] Register: 200 + `rb_session` HttpOnly cookie + `publicUser` shape; duplicate (any case) → 409 `username-taken`; reserved → 409; bad username/authHash/email → 400
- [ ] Login: 200 on match; wrong password and unknown user return byte-identical 401 bodies
- [ ] Cross-site requests → 403; `me` lists `local` in `providers` with no Google secrets configured
- [ ] Logout still works for local sessions

**Verify:** with `npx wrangler pages dev dist` running: `node --import tsx --test tests/auth-endpoints.test.mjs` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `tests/auth-endpoints.test.mjs`:

```js
// Runs against `npx wrangler pages dev dist` (default http://127.0.0.1:8788).
// The ACCOUNTS KV binding comes from wrangler.toml; no secrets are needed —
// password accounts working without any Google credentials is the point.
//
// Note on re-runs: the register endpoint's flood brake allows 5 registrations
// per 10 minutes per IP, and this suite performs 2. A third consecutive run
// against the same long-lived dev server can trip it; restart the dev server
// or wait out the window.
import test from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.PAGES_URL || 'http://127.0.0.1:8788'
const ORIGIN = { Origin: BASE.replace(/\/$/, ''), 'Content-Type': 'application/json' }

// Fresh username per run: dev KV persists in .wrangler/state, so a fixed name
// would collide with the previous run's registration.
const NAME = `tester-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

// Any 32 bytes, base64 — shaped like what a real client sends. The derivation
// itself is unit-tested in tests/account.test.ts.
const authHash = (seed) => Buffer.from(new Uint8Array(32).fill(seed)).toString('base64')

const post = (path, body) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: ORIGIN, body: JSON.stringify(body) })

test('cross-site registration is refused', async () => {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: NAME, authHash: authHash(1) }),
  })
  assert.equal(res.status, 403)
})

test('register → cookie session → me sees the user; duplicates are refused case-insensitively', async () => {
  const res = await post('/api/auth/register', { username: NAME, authHash: authHash(1) })
  assert.equal(res.status, 200)
  const setCookie = res.headers.get('set-cookie') || ''
  assert.match(setCookie, /rb_session=/)
  assert.match(setCookie, /HttpOnly/i)
  const data = await res.json()
  assert.equal(data.user.provider, 'local')
  assert.equal(data.user.id, `local:${NAME}`)
  assert.equal(data.user.name, NAME)

  const cookie = setCookie.split(';')[0]
  const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie } })
  const meData = await me.json()
  assert.equal(meData.user?.id, `local:${NAME}`)
  assert.ok(meData.providers.includes('local'))

  const dup = await post('/api/auth/register', { username: NAME.toUpperCase(), authHash: authHash(2) })
  assert.equal(dup.status, 409)
  assert.equal((await dup.json()).code, 'username-taken')
})

test('login: match succeeds; wrong password and unknown user are indistinguishable', async () => {
  const ok = await post('/api/auth/login', { username: NAME, authHash: authHash(1) })
  assert.equal(ok.status, 200)
  assert.match(ok.headers.get('set-cookie') || '', /rb_session=/)

  const wrong = await post('/api/auth/login', { username: NAME, authHash: authHash(9) })
  assert.equal(wrong.status, 401)
  const ghost = await post('/api/auth/login', { username: `no-such-${NAME}`, authHash: authHash(9) })
  assert.equal(ghost.status, 401)
  // Identical bodies: the endpoint must not reveal which of the two was wrong
  assert.deepEqual(await wrong.json(), await ghost.json())
})

test('validation: bad usernames, reserved names, malformed authHash and email', async () => {
  assert.equal((await post('/api/auth/register', { username: 'ab', authHash: authHash(1) })).status, 400)
  assert.equal((await post('/api/auth/register', { username: 'has space', authHash: authHash(1) })).status, 400)
  assert.equal((await post('/api/auth/register', { username: 'admin', authHash: authHash(1) })).status, 409)
  assert.equal((await post('/api/auth/register', { username: `x${NAME}`, authHash: 'tooshort' })).status, 400)
  assert.equal((await post('/api/auth/register', { username: `x${NAME}`, authHash: 'not base64!!!' })).status, 400)
  assert.equal((await post('/api/auth/register', { username: `x${NAME}`, authHash: authHash(1), email: 'nope' })).status, 400)
  assert.equal((await post('/api/auth/login', { username: NAME, authHash: 'tooshort' })).status, 400)
})

test('me without a cookie reports local as available', async () => {
  const res = await fetch(`${BASE}/api/auth/me`)
  const data = await res.json()
  assert.equal(data.configured, true)
  assert.ok(data.providers.includes('local'))
  assert.equal(data.user, null)
})

test('logout clears a local session', async () => {
  const login = await post('/api/auth/login', { username: NAME, authHash: authHash(1) })
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0]
  const out = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })
  assert.equal(out.status, 200)
  const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie } })
  assert.equal((await me.json()).user, null)
})
```

- [ ] **Step 2: Run to see it fail**

```bash
npm run build
```

Then in a second terminal: `npx wrangler pages dev dist` (leave running).

Run: `node --import tsx --test tests/auth-endpoints.test.mjs`
Expected: FAIL — register/login return 404 (routes don't exist yet); the `me` test fails (`providers` lacks `local`).

- [ ] **Step 3: Create `functions/api/auth/register.js`**

```js
// Create a password account: validate, claim the username, store the re-hashed
// credential, mint a session.
//
// The server never sees the password — only authHash, already 600,000 PBKDF2
// rounds downstream of it (src/account.ts). Password rules beyond "authHash is
// 32 bytes" cannot be enforced here; they are the client's job, by design.

import {
  createSession,
  jsonResponse,
  passwordKey,
  publicUser,
  requireAccounts,
  setSessionCookie,
  upsertUser,
  userKey,
} from '../../_lib/session.js'
import { isSameOriginBrowserRequest } from '../../_lib/gate.js'
import { makeFloodBrake } from '../../_lib/ratelimit.js'
import { fromBase64, hashAuth } from '../../_lib/password.js'

const MAX_BODY_BYTES = 4_096
const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}$/

// Names that would confuse ("admin" answering someone in a thread) or collide
// with app surfaces. Checked against the lowercased name.
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'staff', 'official', 'moderator', 'mod',
  'support', 'help', 'info', 'contact', 'about', 'security', 'abuse', 'postmaster', 'webmaster',
  'api', 'www', 'mail', 'account', 'accounts', 'login', 'logout', 'register', 'signin', 'signup',
  'settings', 'me', 'user', 'users', 'google', 'rebuttal', 'anonymous', 'null', 'undefined', 'deleted',
])

// Registering writes three KV rows (credential, user, session) and the free
// plan's write budget is 1000/day — this brake is about that budget, not about
// guessing (there is nothing to guess here). It sits AFTER validation so a
// stream of malformed junk cannot lock humans out of the only path that
// actually writes. 5 per 10 minutes is generous for a household NAT and
// useless for a single-address bot.
const overRateLimit = makeFloodBrake({ windowMs: 600_000, max: 5 })

export async function onRequestPost({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  if (!isSameOriginBrowserRequest(request)) {
    return jsonResponse({ error: 'This endpoint only serves the Rebuttal Generator app.' }, 403)
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return jsonResponse({ error: 'Malformed request.' }, 400)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  const displayName = typeof body?.username === 'string' ? body.username.trim() : ''
  const username = displayName.toLowerCase()
  if (!USERNAME_PATTERN.test(username)) {
    return jsonResponse(
      { error: 'Usernames are 3–32 characters: letters, numbers, - or _.', code: 'username-invalid' },
      400
    )
  }
  if (RESERVED.has(username)) {
    // Same code as a taken name: reserved names ARE taken, by the app itself
    return jsonResponse({ error: 'That username is taken.', code: 'username-taken' }, 409)
  }

  const authHash = fromBase64(body?.authHash)
  if (!authHash || authHash.length !== 32) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (email && (email.length > 320 || !EMAIL_PATTERN.test(email))) {
    return jsonResponse({ error: 'That email address does not look right.', code: 'email-invalid' }, 400)
  }

  if (overRateLimit(request)) {
    return jsonResponse({ error: 'Too many attempts — wait a few minutes and try again.', code: 'rate-limited' }, 429)
  }

  // Claim check. The user record's key doubles as the uniqueness index — ids
  // are derived from the lowercased name, so no second row is needed. KV has
  // no transactions: two simultaneous registrations of one name have a
  // milliseconds-wide race, the brake above keeps that unfarmable, and losing
  // it means one of the two immediately fails to log in — annoying, not
  // dangerous. A Durable Object reservation is the v2 fix if it ever matters.
  const userId = `local:${username}`
  if (await env.ACCOUNTS.get(userKey(userId))) {
    return jsonResponse({ error: 'That username is taken.', code: 'username-taken' }, 409)
  }

  const credential = await hashAuth(authHash)
  await env.ACCOUNTS.put(passwordKey(userId), JSON.stringify(credential))
  const user = await upsertUser(env, {
    provider: 'local',
    subject: username,
    email,
    // The name keeps the case the user typed; the id is lowercased so Basil
    // and basil can never become two accounts (or two different vault keys).
    name: displayName,
  })

  const sessionId = await createSession(env, user.id)
  return jsonResponse({ user: publicUser(user) }, 200, { 'Set-Cookie': setSessionCookie(sessionId) })
}
```

- [ ] **Step 4: Create `functions/api/auth/login.js`**

```js
// Password login: verify the authHash, mint a session. Login IS unlock — the
// client derived its vault key from the same password before calling here, and
// this endpoint never learns anything that could reproduce that key.

import {
  createSession,
  jsonResponse,
  passwordKey,
  publicUser,
  requireAccounts,
  setSessionCookie,
  upsertUser,
} from '../../_lib/session.js'
import { isSameOriginBrowserRequest } from '../../_lib/gate.js'
import { makeFloodBrake } from '../../_lib/ratelimit.js'
import { fromBase64, verifyAuth } from '../../_lib/password.js'

const MAX_BODY_BYTES = 4_096

// Per IP, deliberately NOT per username: a per-username throttle would let
// anyone lock a victim out by failing logins on their behalf. 10/minute
// absorbs fat-fingered retries without opening a guessing window that matters
// against a 600k-round derivation.
const overRateLimit = makeFloodBrake({ windowMs: 60_000, max: 10 })

// A syntactically-valid record to verify against when the username does not
// exist, so both failure paths cost one PBKDF2 run — otherwise the fast
// "no such user" path would be a username oracle by timing.
const DUMMY_RECORD = {
  salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
  hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  iterations: 1_000,
}

const failure = () =>
  // One message for "no such user" and "wrong password": anything more
  // specific turns this endpoint into a username oracle.
  jsonResponse({ error: 'That username and password did not match.', code: 'bad-credentials' }, 401)

export async function onRequestPost({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  if (!isSameOriginBrowserRequest(request)) {
    return jsonResponse({ error: 'This endpoint only serves the Rebuttal Generator app.' }, 403)
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return jsonResponse({ error: 'Malformed request.' }, 400)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : ''
  const authHash = fromBase64(body?.authHash)
  if (!username || !authHash || authHash.length !== 32) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  if (overRateLimit(request)) {
    return jsonResponse({ error: 'Too many attempts — wait a minute and try again.', code: 'rate-limited' }, 429)
  }

  const userId = `local:${username}`
  const recordRaw = await env.ACCOUNTS.get(passwordKey(userId))
  let record = DUMMY_RECORD
  if (recordRaw) {
    try {
      record = JSON.parse(recordRaw)
    } catch {
      record = DUMMY_RECORD
    }
  }

  const valid = await verifyAuth(record, authHash)
  if (!valid || !recordRaw) return failure()

  // The same call the Google callback makes on every sign-in: refreshes
  // lastSeenAt and preserves everything else (name, email, language) through
  // upsertUser's existing-field discipline.
  const user = await upsertUser(env, { provider: 'local', subject: username })

  const sessionId = await createSession(env, user.id)
  return jsonResponse({ user: publicUser(user) }, 200, { 'Set-Cookie': setSessionCookie(sessionId) })
}
```

- [ ] **Step 5: Update `functions/api/auth/me.js`**

Replace the body of `onRequestGet` so `providers` includes `local`:

```js
export async function onRequestGet({ request, env }) {
  const providers = []
  if (googleConfigured(env)) providers.push('google')
  // Password accounts need only the KV binding — no third-party credentials
  if (env.ACCOUNTS) providers.push('local')
  const session = await getSession(request, env)
  return jsonResponse({
    configured: providers.length > 0,
    providers,
    user: publicUser(session?.user),
  })
}
```

- [ ] **Step 6: Run the suite to green**

With the dev server still running (wrangler auto-reloads Functions; if in doubt, restart it):

Run: `node --import tsx --test tests/auth-endpoints.test.mjs`
Expected: 6 pass, 0 fail.

Also run the neighbours to prove no session regression:
`node --import tsx --test tests/generate.test.mjs tests/share-page.test.mjs`
Expected: pass (needs the limiter dev session for generate — same setup as tests/generate.test.mjs's header comment describes; skip that file if the limiter isn't up, and say so in the task report).

- [ ] **Step 7: Commit**

```bash
git add functions/api/auth/register.js functions/api/auth/login.js functions/api/auth/me.js tests/auth-endpoints.test.mjs
git commit -m "feat: register and login endpoints for password accounts (oracle-free, per-IP braked)"
```

---

### Task 4: Client UI — AuthDialog, benefits popover, App wiring, English strings

**Goal:** The bar says "Sign in / Sign up" with a benefits popover; the dialog offers Google and username/password; registering or logging in with a password adopts the derived key so the vault opens with no passphrase dialog, and the Google + passphrase path behaves exactly as before.

**Files:**
- Create: `src/AuthDialog.tsx`
- Modify: `src/AccountBar.tsx`, `src/App.tsx`, `src/index.css`, `src/i18n/locales/en.ts`

**Acceptance Criteria:**
- [ ] Signed out: one "Sign in / Sign up" button + ⓘ popover listing the four benefits (keys, history, 6-vs-3 Instant quota, language)
- [ ] Dialog: Google button + divider shown only when `providers` includes `google`; sign-up has username/password/confirm/optional email + no-email warning; sign-in has username/password; modes switch in place
- [ ] Password register/login → vault seals/opens silently (no passphrase dialog anywhere on the local path); Google path unchanged
- [ ] Signed-in-but-locked local account (blocked IndexedDB + reload): "Unlock" opens the sign-in dialog, not the passphrase dialog
- [ ] `npm run build` clean; all existing tests still pass

**Verify:** `npm run build`, then against `npx wrangler pages dev dist`: register a throwaway user in the browser, save an API key, confirm 🔓 Keys synced appears with no passphrase prompt; sign out; sign back in; confirm the key returns.

**Steps:**

- [ ] **Step 1: English strings**

In `src/i18n/locales/en.ts`, in the `--- account ---` block: **delete** the `'account.signInWithGoogle'` line (its only consumer is replaced this task) and add:

```ts
  'account.signInOrUp': 'Sign in / Sign up',
  'account.benefitsTitle': 'Why sign in?',
  'account.benefitsKeys': 'Your API keys follow you to any device — encrypted so only you can read them.',
  'account.benefitsHistory': 'Your reply history syncs too, sealed the same way.',
  'account.benefitsQuota': 'Six free Instant replies a day instead of three.',
  'account.benefitsLanguage': 'Your language choice sticks everywhere you sign in.',
  'account.signUpTitle': 'Create your account',
  'account.signInTitle': 'Sign in',
  'account.continueWithGoogle': 'Continue with Google',
  'account.orDivider': 'or',
  'account.username': 'Username',
  'account.usernamePlaceholder': '3–32 letters, numbers, - or _',
  'account.password': 'Password',
  'account.confirmPassword': 'Confirm password',
  'account.emailOptional': 'Email (optional)',
  'account.noEmailWarning':
    'No email means no way back in if you ever forget this password — there is nothing to reset with. Write it down somewhere safe.',
  'account.createAccount': 'Create account',
  'account.signInAction': 'Sign in',
  'account.switchToSignIn': 'Already have an account? Sign in',
  'account.switchToSignUp': 'New here? Create one',
  'account.passwordShort': 'Use at least 10 characters.',
  'account.passwordMismatch': 'The two passwords do not match.',
  'account.usernameInvalid': 'Usernames are 3–32 characters: letters, numbers, - or _.',
  'account.usernameTaken': 'That username is taken — try another.',
  'account.badCredentials': 'That username and password did not match.',
  'account.rateLimited': 'Too many attempts — wait a minute and try again.',
  'account.authError': 'Sign-in did not complete. Please try again.',
```

- [ ] **Step 2: Create `src/AuthDialog.tsx`**

```tsx
// Sign in / sign up: one card, two modes — styled after VaultDialog, the app's
// existing pattern for a focused form that appears in flow (no overlay, no
// focus trap, aria-modal false).
//
// The password feeds the derivation in src/account.ts and never leaves this
// component except through onSubmit. Google stays a plain full-page redirect.

import { useState } from 'react'
import type { TFunction } from './i18n'
import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from './account'

export type AuthMode = 'signin' | 'signup'

interface AuthDialogProps {
  t: TFunction
  mode: AuthMode
  /** Whether this deployment also offers Google (from /api/auth/me providers). */
  hasGoogle: boolean
  busy: boolean
  error: string
  onModeChange: (mode: AuthMode) => void
  onGoogle: () => void
  onSubmit: (username: string, password: string, email: string) => void
  onDismiss: () => void
}

export function AuthDialog({
  t,
  mode,
  hasGoogle,
  busy,
  error,
  onModeChange,
  onGoogle,
  onSubmit,
  onDismiss,
}: AuthDialogProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [email, setEmail] = useState('')
  const [localError, setLocalError] = useState('')

  const isSignup = mode === 'signup'

  const submit = () => {
    setLocalError('')
    const name = username.trim()
    if (!name || !password) return
    if (!USERNAME_PATTERN.test(name)) {
      setLocalError(t('account.usernameInvalid'))
      return
    }
    if (isSignup) {
      if (password.length < PASSWORD_MIN_LENGTH) {
        setLocalError(t('account.passwordShort'))
        return
      }
      if (password !== confirmation) {
        setLocalError(t('account.passwordMismatch'))
        return
      }
    }
    onSubmit(name, password, isSignup ? email : '')
  }

  return (
    <div className="vault-dialog auth-dialog" role="dialog" aria-modal="false" aria-labelledby="auth-title">
      <h3 id="auth-title" className="vault-title">
        {isSignup ? t('account.signUpTitle') : t('account.signInTitle')}
      </h3>

      {hasGoogle && (
        <>
          <button className="button button-secondary auth-google" onClick={onGoogle} disabled={busy}>
            {t('account.continueWithGoogle')}
          </button>
          <div className="auth-divider" role="separator">
            {t('account.orDivider')}
          </div>
        </>
      )}

      <label className="label" htmlFor="auth-username">
        {t('account.username')}
      </label>
      <input
        id="auth-username"
        className="text-input"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder={t('account.usernamePlaceholder')}
        disabled={busy}
      />

      <label className="label" htmlFor="auth-password">
        {t('account.password')}
      </label>
      <input
        id="auth-password"
        className="text-input"
        type="password"
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !isSignup && submit()}
        disabled={busy}
      />

      {isSignup && (
        <>
          <label className="label" htmlFor="auth-confirm">
            {t('account.confirmPassword')}
          </label>
          <input
            id="auth-confirm"
            className="text-input"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={busy}
          />

          <label className="label" htmlFor="auth-email">
            {t('account.emailOptional')}
          </label>
          <input
            id="auth-email"
            className="text-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={busy}
          />
          {!email.trim() && <p className="vault-warning">⚠️ {t('account.noEmailWarning')}</p>}
        </>
      )}

      {(localError || error) && (
        <div className="error" role="alert">
          ⚠️ {localError || error}
        </div>
      )}

      <div className="controls vault-actions">
        <button className="button button-primary" onClick={submit} disabled={busy || !username.trim() || !password}>
          {busy ? t('account.syncing') : isSignup ? t('account.createAccount') : t('account.signInAction')}
        </button>
        <button className="button button-secondary" onClick={onDismiss} disabled={busy}>
          {t('account.notNow')}
        </button>
        <button
          className="link-button subtle"
          onClick={() => onModeChange(isSignup ? 'signin' : 'signup')}
          disabled={busy}
        >
          {isSignup ? t('account.switchToSignIn') : t('account.switchToSignUp')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: AccountBar — relabel + popover**

In `src/AccountBar.tsx`:

1. In `BarProps`, rename `onSignIn: () => void` to `onSignInClick: () => void` (it now opens a dialog rather than starting OAuth). Update the destructuring in the `AccountBar` signature.
2. Add popover state at the top of `AccountBar`: `const [showBenefits, setShowBenefits] = useState(false)`.
3. Replace the signed-out branch (the `sign-in-button` button, lines 87–91) with:

```tsx
          ) : (
            <div
              className="signin-cluster"
              onMouseEnter={() => setShowBenefits(true)}
              onMouseLeave={() => setShowBenefits(false)}
            >
              <button className="button button-secondary sign-in-button" onClick={onSignInClick}>
                {t('account.signInOrUp')}
              </button>
              <button
                className="link-button benefits-toggle"
                aria-expanded={showBenefits}
                aria-controls="account-benefits"
                onClick={() => setShowBenefits((v) => !v)}
                title={t('account.benefitsTitle')}
              >
                ⓘ
              </button>
              {showBenefits && (
                <div id="account-benefits" className="account-benefits" role="note">
                  <strong>{t('account.benefitsTitle')}</strong>
                  <ul>
                    <li>{t('account.benefitsKeys')}</li>
                    <li>{t('account.benefitsHistory')}</li>
                    <li>{t('account.benefitsQuota')}</li>
                    <li>{t('account.benefitsLanguage')}</li>
                  </ul>
                </div>
              )}
            </div>
          )}
```

(Hover opens it for mouse users; the ⓘ click-toggle is the keyboard/touch path.)

- [ ] **Step 4: CSS**

Append to `src/index.css` after the `.vault-actions` rule (line ~1002):

```css
/* Sign-in cluster: the button, its ⓘ toggle, and the benefits popover. */
.signin-cluster {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.benefits-toggle {
  font-size: 15px;
  line-height: 1;
  padding: 4px;
  color: #6366f1;
}

.account-benefits {
  position: absolute;
  top: calc(100% + 8px);
  inset-inline-end: 0;
  z-index: 30;
  width: min(320px, 86vw);
  padding: 12px 14px;
  border: 1px solid #c7d2fe;
  border-radius: 10px;
  background: #f5f7ff;
  box-shadow: 0 8px 24px rgba(49, 46, 129, 0.12);
  font-size: 13px;
  color: #374151;
  text-align: start;
}

.account-benefits strong {
  display: block;
  margin-bottom: 6px;
  color: #312e81;
}

.account-benefits ul {
  margin: 0;
  padding-inline-start: 18px;
  display: grid;
  gap: 4px;
}

/* Auth dialog: mostly VaultDialog's clothes; only the divider is new. */
.auth-google {
  width: 100%;
  margin-bottom: 4px;
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
  color: #6b7280;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid #c7d2fe;
}
```

- [ ] **Step 5: App wiring**

All edits in `src/App.tsx`:

**5a — imports.** Extend the vault import with `adoptKey`, `unlockWithKey`, `sealJson`, `cachedKey`; add below it:

```tsx
import { AuthDialog, type AuthMode } from './AuthDialog'
import {
  register as registerAccount,
  loginLocal,
  UsernameTakenError,
  BadCredentialsError,
  RateLimitedError,
} from './account'
```

**5b — state.** After the `vaultError` state (line ~240):

```tsx
  const [authDialog, setAuthDialog] = useState<AuthMode | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  // A password account's vault key, held for this session — still works where
  // IndexedDB is blocked and the persistent cache is a no-op. Cleared on sign-out.
  const localKeyRef = useRef<CryptoKey | null>(null)
```

**5c — one unlock path.** Add above the vault effect:

```tsx
  /** A decrypted bundle just arrived: apply keys and pull history. One path for every unlock. */
  const onVaultOpened = (bundle: KeyBundle) => {
    applyKeyBundle(bundle)
    setApiKey(loadStoredKey(providerId))
    setTavilyDraft(loadTavilyKey())
    setShowApiKeyInput(getProvider(providerId).requiresKey && !loadStoredKey(providerId))
    setVaultState('unlocked')
    void pullAndMergeHistory().then((merged) => {
      if (!merged) return
      setHistoryEntries(merged)
      // Sign-in uploads the device backlog: entries generated while signed
      // out are already in the merge, so pushing it completes the sync.
      void pushHistory(merged)
    })
  }

  /** The password account's vault key: this session's, or the device cache. */
  const localVaultKey = async (): Promise<CryptoKey | null> => localKeyRef.current ?? (await cachedKey())

  /**
   * First seal for a password account — no passphrase dialog, the
   * login-derived key IS the vault key. Quietly does nothing when there are no
   * keys to save yet or no key survived (blocked IndexedDB + reload); the next
   * key change or sign-in repairs both.
   */
  const setupLocalVault = async () => {
    const key = await localVaultKey()
    const bundle = collectKeyBundle()
    if (!key || !Object.keys(bundle).length) {
      setVaultState('none')
      return
    }
    try {
      const sealed = await sealJson(key, bundle)
      await saveVault(sealed)
      setVaultBlob(sealed)
      setVaultState('unlocked')
    } catch {
      setVaultState('none')
    }
  }
```

**5d — vault effect.** Inside the `auth.user?.id` effect, replace the body of the `.then(async (blob) => { ... })` from `if (!blob) {` through the `else { setVaultState('locked') }` with:

```tsx
        if (cancelled) return
        setVaultBlob(blob)
        if (!blob) {
          // A password account seals silently: login already produced the key,
          // so the passphrase-setup dialog would be a second secret for nothing.
          if (auth.user?.provider === 'local') void setupLocalVault()
          else setVaultState('none')
          return
        }
        let bundle: KeyBundle | null = null
        if (auth.user?.provider === 'local' && localKeyRef.current) {
          try {
            bundle = await unlockWithKey(blob, localKeyRef.current)
          } catch {
            bundle = null
          }
        }
        if (!bundle) bundle = await unlockWithDeviceKey(blob)
        if (cancelled) return
        if (bundle) onVaultOpened(bundle)
        else setVaultState('locked')
```

(This replaces the effect's previous inline apply-and-pull block with `onVaultOpened` — the same statements, now shared.)

**5e — auth submit.** Add near `handleSignOut`:

```tsx
  const handleAuthSubmit = async (username: string, password: string, email: string) => {
    setAuthBusy(true)
    setAuthError('')
    try {
      const result =
        authDialog === 'signup'
          ? await registerAccount(username, password, email)
          : await loginLocal(username, password)
      // Login IS unlock: the derived master key becomes this device's vault key
      localKeyRef.current = await adoptKey(result.masterKeyBytes)
      // Signed-in-but-locked (key lost to a blocked IndexedDB + reload): the
      // effect keys on auth.user.id and will not refire for the same user, so
      // open the vault directly here.
      if (vaultBlob && vaultState === 'locked') {
        try {
          onVaultOpened(await unlockWithKey(vaultBlob, localKeyRef.current))
        } catch {
          // A blob this account's key cannot open — leave it locked
        }
      }
      setAuthDialog(null)
      // Refetch rather than trusting the response: one source of truth for auth
      // state, and the change of auth.user.id is what fires the vault effect.
      setAuth(await fetchAuthState())
    } catch (err) {
      if (err instanceof UsernameTakenError) setAuthError(t('account.usernameTaken'))
      else if (err instanceof BadCredentialsError) setAuthError(t('account.badCredentials'))
      else if (err instanceof RateLimitedError) setAuthError(t('account.rateLimited'))
      else setAuthError(t('account.authError'))
    } finally {
      setAuthBusy(false)
    }
  }
```

**5f — sign-out.** In `handleSignOut`, after `await forgetDeviceKey()`, add:

```tsx
    localKeyRef.current = null
    setAuthDialog(null)
    setAuthError('')
```

**5g — key-change hook.** Replace `afterKeyChange` with:

```tsx
  const afterKeyChange = () => {
    if (vaultState === 'unlocked') void syncVault()
    else if (auth.user?.provider === 'local' && vaultState === 'none' && !vaultBlob) void setupLocalVault()
    else if (auth.user && vaultState === 'none' && !vaultBlob) setVaultPrompt('setup')
  }
```

**5h — syncVault.** Replace the two lines that seal (`const sealed = await resealWithDeviceKey(bundle, vaultBlob)` and its surrounding `if (sealed)`) so local accounts prefer the session key:

```tsx
      const localKey = auth.user.provider === 'local' ? await localVaultKey() : null
      const sealed = localKey ? await sealJson(localKey, bundle) : await resealWithDeviceKey(bundle, vaultBlob)
      if (sealed) {
        await saveVault(sealed)
        setVaultBlob(sealed)
      }
```

**5i — handleVaultSubmit.** In the unlock branch (`} else if (vaultBlob) {`), replace the apply-and-pull block after `const bundle = await unlock(vaultBlob, passphrase)` with a single `onVaultOpened(bundle)` call. (The setup branch keeps its own history pull — it seals rather than opens.)

**5j — AccountBar call site and dialog mount.** Change the `<AccountBar />` props:

```tsx
        onSignInClick={() => {
          setAuthError('')
          setAuthDialog('signin')
        }}
        onSignOut={handleSignOut}
        onUnlockClick={() =>
          auth.user?.provider === 'local' ? setAuthDialog('signin') : setVaultPrompt('unlock')
        }
```

(A password user's "unlock" is re-entering their password — the same secret — never a vault passphrase they don't have.) Then mount the dialog directly above the `{vaultPrompt && (` block:

```tsx
      {authDialog && (
        <AuthDialog
          t={t}
          mode={authDialog}
          hasGoogle={auth.providers.includes('google')}
          busy={authBusy}
          error={authError}
          onModeChange={(m) => {
            setAuthError('')
            setAuthDialog(m)
          }}
          onGoogle={() => signIn('google')}
          onSubmit={handleAuthSubmit}
          onDismiss={() => {
            setAuthDialog(null)
            setAuthError('')
          }}
        />
      )}
```

- [ ] **Step 6: Build, test, and walk the flow**

Run: `npm run build` → clean.
Run: `node --import tsx --test tests/account.test.ts tests/history.test.ts tests/prompts.test.ts` → pass.

With `npx wrangler pages dev dist` (rebuilt) running, in a browser:
1. ⓘ shows the four benefits; "Sign in / Sign up" opens the dialog in sign-in mode; switch to sign-up.
2. Register `flowtest-<random>` / a 10+ char password, no email → warning visible pre-submit, then signed in, name in the bar.
3. Save an OpenRouter API key → "🔓 Keys synced" appears with **no passphrase dialog**.
4. Sign out (bar empties), sign back in with the same password → key is back, History intact.
5. Wrong password → single generic error. Username `ab` → inline validity error.
6. If Google creds are configured in `.dev.vars`, confirm the Google button still redirects; otherwise confirm the dialog shows no Google button and no divider.

- [ ] **Step 7: Commit**

```bash
git add src/AuthDialog.tsx src/AccountBar.tsx src/App.tsx src/account.ts src/index.css src/i18n/locales/en.ts
git commit -m "feat: sign in / sign up dialog — password login doubles as vault unlock"
```

---

### Task 5: Locale translations (11 files) with a parity test

**Goal:** All 11 non-English locales carry the 27 new `account.*` keys, translated to match each file's existing tone, and none still carries `account.signInWithGoogle`.

**Files:**
- Modify: `src/i18n/locales/{es,fr,de,pt-BR,it,ja,ko,zh-Hans,ar,hi,el}.ts`
- Test: `tests/i18n-account.test.mjs`

**Acceptance Criteria:**
- [ ] Parity test passes: every locale defines all 27 keys, none defines the removed key
- [ ] Translations are real translations (not English copies), keeping `-` / `_` / digit literals intact in `usernamePlaceholder`/`usernameInvalid`
- [ ] `npm run build` clean

**Verify:** `node --import tsx --test tests/i18n-account.test.mjs` → pass

**Steps:**

- [ ] **Step 1: Write the failing parity test**

Create `tests/i18n-account.test.mjs`:

```js
// Every locale must carry the account.* keys added for password sign-in.
// English fallback would keep the UI functional without them, but a sign-in
// form that suddenly switches language mid-flow reads as phishing — these
// specific strings must exist everywhere.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales')

const REQUIRED = [
  'account.signInOrUp', 'account.benefitsTitle', 'account.benefitsKeys', 'account.benefitsHistory',
  'account.benefitsQuota', 'account.benefitsLanguage', 'account.signUpTitle', 'account.signInTitle',
  'account.continueWithGoogle', 'account.orDivider', 'account.username', 'account.usernamePlaceholder',
  'account.password', 'account.confirmPassword', 'account.emailOptional', 'account.noEmailWarning',
  'account.createAccount', 'account.signInAction', 'account.switchToSignIn', 'account.switchToSignUp',
  'account.passwordShort', 'account.passwordMismatch', 'account.usernameInvalid', 'account.usernameTaken',
  'account.badCredentials', 'account.rateLimited', 'account.authError',
]

for (const file of readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.ts'))) {
  test(`${file} carries the password-account strings`, () => {
    const text = readFileSync(join(LOCALES_DIR, file), 'utf8')
    for (const key of REQUIRED) {
      assert.ok(text.includes(`'${key}'`), `${file} is missing ${key}`)
    }
    assert.ok(!text.includes(`'account.signInWithGoogle'`), `${file} still defines the removed signInWithGoogle key`)
  })
}
```

Run: `node --import tsx --test tests/i18n-account.test.mjs`
Expected: `en.ts` passes (Task 4 added its strings); the other 11 FAIL.

- [ ] **Step 2: Translate**

For each of the 11 files, add the 27 keys in the file's `--- account ---` section and delete its `account.signInWithGoogle` line. Translate from the English strings in Task 4 Step 1, with these constraints:

- Match the file's existing register (each locale already has translated `account.*` strings to imitate for tone and formality — e.g. formal-you vs informal-you must match what the file already uses).
- Keep `3–32`, the literal characters `-` and `_`, and "Google" untranslated.
- `account.orDivider` is a tiny connective ("o", "ou", "oder", "または", "或", "أو", "ή", …) — not a sentence.
- RTL (`ar`) needs no markup changes; CSS logical properties handle direction.

This step is well-suited to parallel subagents (one per locale, or small groups), each given the en block + that locale's current file.

- [ ] **Step 3: Verify**

Run: `node --import tsx --test tests/i18n-account.test.mjs` → 12 pass.
Run: `npm run build` → clean.
Spot-check two locales by switching languages in the dev preview and opening the dialog.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales tests/i18n-account.test.mjs
git commit -m "feat: translate the sign-in/sign-up strings across all 11 locales"
```

---

### Task 6: Domain cutover — code and docs for rebut.m36x.com

**Goal:** Every code-level and documentation reference to the primary domain points at `rebut.m36x.com`; the deployment guide gains the exact operator runbook for the switch; the README documents password accounts.

**Files:**
- Modify: `functions/api/generate.ts` (line 159), `src/providers.ts` (comment, line ~13), `src/turnstile.ts` (comment, line 6), `README.md`, `DEPLOYMENT_GUIDE.md`, `PROJECT_SUMMARY.md`

**Acceptance Criteria:**
- [ ] `grep -rn "rebuttal\.m36x\.com" src functions` → zero matches
- [ ] Remaining `rebuttal.m36x.com` mentions in docs exist only as "the old domain 301s" statements or in historical plan/spec files under `docs/superpowers/`
- [ ] README's sign-in section documents password accounts (work with only the `ACCOUNTS` binding; login = vault unlock; no reset without email)
- [ ] `npm run build` clean

**Verify:** `grep -rn "rebuttal.m36x.com" --include="*.ts" --include="*.js" --include="*.toml" .` (excluding `node_modules`, `dist`, `docs/superpowers`) → empty

**Steps:**

- [ ] **Step 1: The one functional change**

`functions/api/generate.ts:159`:

```ts
      'HTTP-Referer': 'https://rebut.m36x.com',
```

(OpenRouter uses this only for attribution/rankings; it does not affect routing, so it can land before the domain is attached.)

- [ ] **Step 2: Stale comments**

- `src/providers.ts` line ~13: change the example header value to `https://rebut.m36x.com`.
- `src/turnstile.ts` line 6: `// The public sitekey for the rebut.m36x.com managed widget. Public and` (same sitekey — the widget gains the new hostname in the dashboard, Task 7).

- [ ] **Step 3: README**

- Line 14 and line ~640: live-at URL becomes `https://rebut.m36x.com/` (link text `rebut.m36x.com`).
- In "Enabling sign-in on your own deployment": retitle intro to cover both methods, and before the Google steps add:

```markdown
**Password accounts** need only step 1 — with the `ACCOUNTS` KV namespace bound,
"Sign in / Sign up" appears and username-password accounts work with no Google
credentials at all. The password does double duty: the browser derives the
vault key and the login proof from it separately (`src/account.ts`), so signing
in unlocks your synced keys and history with no second passphrase — and the
server still cannot read either. There is no password reset in this version:
an account with no email on file and a forgotten password is gone for good,
which the sign-up form says out loud.

**Google sign-in** additionally needs steps 2–4:
```

- In "Your reply history" (line ~286): change "Sign in, unlock your vault, and it syncs." to "Sign in and unlock your vault — with a password account that is one step, with Google it is the passphrase — and it syncs."

- [ ] **Step 4: DEPLOYMENT_GUIDE.md**

- Lines 4, 80, 164: primary domain becomes `rebut.m36x.com` (Turnstile hostname line lists both hostnames).
- Add a "Primary domain" subsection near the custom-domain text (line ~164):

```markdown
### Primary domain

The canonical domain is **rebut.m36x.com**. `rebuttal.m36x.com` remains
attached and 301-redirects (path and query preserved) via a zone-level
Redirect Rule, because distributed share links point there. The four
dashboard pieces that must all know about a domain:

1. **Pages → m36x-rebuttal → Custom domains** — both domains attached.
2. **Turnstile → widget → Hostname management** — both hostnames listed;
   a missing hostname fails the widget silently and every Instant reply 403s.
3. **Google OAuth client → Authorised redirect URIs** — both
   `https://<domain>/api/auth/google/callback` entries.
4. **m36x.com zone → Rules → Redirect Rules** — "rebuttal-to-rebut":
   when hostname equals `rebuttal.m36x.com`, 301 to dynamic
   `concat("https://rebut.m36x.com", http.request.uri.path)`,
   "Preserve query string" checked.
```

- [ ] **Step 5: PROJECT_SUMMARY.md**

Lines 124 and 218: `https://rebut.m36x.com/` (keep the project name `m36x-rebuttal`).

- [ ] **Step 6: Verify and commit**

Run the acceptance grep and `npm run build`, then:

```bash
git add functions/api/generate.ts src/providers.ts src/turnstile.ts README.md DEPLOYMENT_GUIDE.md PROJECT_SUMMARY.md
git commit -m "feat: make rebut.m36x.com the primary domain in code and docs"
```

---

### Task 7: Ship — deploy, operator dashboard steps, production verification, spec amendment

**Goal:** Password accounts and the new domain are live and verified in production; the spec records the one data-model simplification.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-05-password-accounts-design.md` (one amendment)

**Acceptance Criteria:**
- [ ] Production deploy of `main` serving on `rebut.m36x.com`
- [ ] Old domain 301s with path+query preserved
- [ ] Register/login live: gate 403s cross-site, malformed 400s, wrong password 401s — verified without creating junk accounts
- [ ] The user has signed up with a real account and their key survives a second sign-in
- [ ] Instant mode works on the new domain (proves the Turnstile hostname)
- [ ] Spec amendment committed

**Verify:** the curl checks in Step 4 all return the expected statuses against `https://rebut.m36x.com`

**Steps:**

- [ ] **Step 1: Spec amendment**

In the spec's Data model section, replace the `username:<lowercased-username>` line with:

```
(uniqueness index: none needed — the user-record key above IS the index,
 since ids derive from the lowercased name; amended at implementation)
```

Commit: `git add docs/superpowers/specs/2026-08-05-password-accounts-design.md && git commit -m "docs: amend spec — user-record key doubles as the username index"`

- [ ] **Step 2: Operator dashboard steps** (user-performed; nothing here is scriptable)

1. **Pages custom domain:** Cloudflare dashboard → Workers & Pages → `m36x-rebuttal` → Custom domains → *Set up a custom domain* → `rebut.m36x.com` (DNS record is created automatically; wait for Active).
2. **Turnstile hostname:** Turnstile → the site with key `0x4AAAAAAEE1TV8KH-Jmmpr5` → Settings → Hostname management → add `rebut.m36x.com` (keep `rebuttal.m36x.com`).
3. **Google OAuth:** console.cloud.google.com → APIs & Services → Credentials → the OAuth client → Authorised redirect URIs → add `https://rebut.m36x.com/api/auth/google/callback` (keep the old one).
4. **Redirect rule:** m36x.com zone → Rules → Redirect Rules → Create rule `rebuttal-to-rebut`: custom filter `Hostname equals rebuttal.m36x.com`; then URL redirect → Dynamic → `concat("https://rebut.m36x.com", http.request.uri.path)` → status 301 → check *Preserve query string*.

- [ ] **Step 3: Deploy** (user-performed)

```bash
npm run build
```

```bash
npx wrangler pages deploy dist --project-name=m36x-rebuttal --branch=main
```

- [ ] **Step 4: Production verification** (safe: none of these create accounts)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://rebut.m36x.com/
```
Expected: `200`

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "https://rebuttal.m36x.com/s/abc?x=1"
```
Expected: `301 https://rebut.m36x.com/s/abc?x=1`

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://rebut.m36x.com/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"probe\",\"authHash\":\"x\"}"
```
Expected: `403` (no browser origin — the gate, before anything else)

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://rebut.m36x.com/api/auth/login -H "Content-Type: application/json" -H "Origin: https://rebut.m36x.com" -d "{\"username\":\"probe\",\"authHash\":\"x\"}"
```
Expected: `400` (malformed authHash — validation, no account touched)

```bash
curl -s https://rebut.m36x.com/api/auth/me
```
Expected: JSON with `"configured":true` and `"providers":["google","local"]`

- [ ] **Step 5: Live walkthrough** (user-performed, in a browser on rebut.m36x.com)

1. Sign up with a real username+password (with or without email — your call), save an API key, watch "Keys synced" appear without a passphrase prompt.
2. Sign out, sign back in — the key returns. If a second device is handy, sign in there too: same key, same history.
3. Run one Instant-mode generate signed out (private window) to confirm Turnstile passes on the new hostname.
4. Confirm the Google button still completes sign-in from the new domain.

- [ ] **Step 6: Merge/push per repo practice**

```bash
git push origin main
```

---

## Explicitly not in this plan (matching the spec's out-of-scope list)

Password change/rotation, account linking, email verification, password reset, and any change to Instant caps. The spec states these plainly; the sign-up form's no-email warning is the user-facing honesty about the reset gap.
