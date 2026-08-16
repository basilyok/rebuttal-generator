# Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved recovery-code design (spec: `docs/superpowers/specs/2026-08-13-password-recovery-design.md`) so a password account can be reset without destroying its vault and history.

**Architecture:** A random per-account `DEK` becomes the only key that encrypts data. It is wrapped twice — under `masterKey` (from the password) and under `recoveryKey` (from a 120-bit recovery code) — and both wrapped copies live in one KV record the server cannot open. Reset rewrites that record instead of re-encrypting anything. Blobs carry a version tag so existing accounts migrate incrementally and a half-migrated account stays fully readable.

**Tech Stack:** WebCrypto (PBKDF2-SHA256, AES-GCM), Cloudflare Pages Functions, Workers KV, the existing `LIMITER` Durable Object brakes, React 18 + TypeScript, `node --test` + `tsx`.

**Invariants to hold in every task:**
- The server never receives the password, the recovery code, `masterKey`, `recoveryKey`, or `DEK` in any openable form.
- `recover/begin` and `recover/complete` must be indistinguishable between "no such user" and "wrong code," in both response and timing.
- Write order in `complete` is `dek:` → `recovery:` → `password:`. The password record lands last.
- The new recovery code is displayed only after `complete` returns success.
- Reset refuses to run while any blob is still `version: 1`.
- Recovery applies to `provider: 'local'` accounts only.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/recovery.ts` | create | Code generation, `recoveryKey`/`recoveryAuth` derivation, DEK wrap/unwrap, transport |
| `src/vault.ts` | modify | Export `toBase64`/`fromBase64`/`cachedKey`; add DEK-aware blob helpers |
| `functions/_lib/session.js` | modify | Add `dekKey()`, `recoveryKey()` builders; stamp/compare `credentialVersion` |
| `functions/api/dek.js` | create | Authenticated GET/PUT of the wrapped-DEK record |
| `functions/api/auth/recover/begin.js` | create | Verify `recoveryAuth`, release `byRecovery` |
| `functions/api/auth/recover/complete.js` | create | Re-verify, then write `dek:` → `recovery:` → `password:` |
| `src/account.ts` | modify | `deriveRecoveryCredentials`, reset transport, new error types |
| `src/App.tsx` | modify | Setup/migration orchestration, reset entry, prompt state |
| `src/RecoveryDialog.tsx` | create | Code display, setup prompt, three-step reset flow |
| `src/index.css` | modify | Code display and prompt styles |
| `src/i18n/locales/*.ts` (12) | modify | ~20 new `recovery.*` keys each |
| `tests/recovery.test.ts` | create | Derivation, wrap/unwrap, code format |
| `tests/recover-endpoints.test.mjs` | create | Endpoint gating, verification, write order |
| `tests/migration.test.ts` | create | Version-tagged read/write and self-heal |

---

## Task 1: Recovery code generation and derivation

**Goal:** `src/recovery.ts` can mint a recovery code, derive `recoveryKey` and `recoveryAuth` from it, and wrap/unwrap a DEK under any key.

**Files:**
- Create: `src/recovery.ts`
- Modify: `src/vault.ts` (export three currently-private helpers)
- Create: `tests/recovery.test.ts`
- Modify: `package.json` (add the test file to `test:offline`)

**Context you need:** `src/vault.ts` defines `toBase64`/`fromBase64` as module-private consts (around lines 56-62) and `cachedKey()` around line 100. `sealJson(key, value)` and `openJson(key, blob)` are already exported and return/consume `VaultBlob` (`{salt, iv, ciphertext, version?, updatedAt?}`). `src/account.ts` exports `normalizeUsername` and uses `SALT_PREFIX = "rebuttal|v1|"`; the recovery path uses a *different* prefix so the two derivations can never collide.

**Acceptance Criteria:**
- [ ] `generateRecoveryCode()` returns 24 Crockford base32 characters — six dash-separated groups of four, 120 bits — drawn from `crypto.getRandomValues`
- [ ] The alphabet excludes I, L, O and U
- [ ] `deriveRecoveryCredentials(username, code)` returns `{ recoveryKeyBytes, recoveryAuth }`, using 600,000 PBKDF2 rounds and salt `"rebuttal|recovery|v1|" + normalizeUsername(username)`
- [ ] The derivation is case- and dash-insensitive on the code, so a user typing it back in any reasonable form succeeds
- [ ] `wrapDek(key, dekBytes)` / `unwrapDek(key, blob)` round-trip, and a wrong key throws rather than returning garbage
- [ ] `recoveryAuth` differs from the `authHash` produced by the same string as a password (different salt prefix)
- [ ] `npm run build` passes

**Verify:** `node --import tsx --test tests/recovery.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Export the three helpers from `src/vault.ts`**

Change the two consts near line 56 and `cachedKey` near line 100 to be exported. They are currently:

```ts
const toBase64 = (bytes: Uint8Array): string => {
```
```ts
const fromBase64 = (value: string): Uint8Array => Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0))
```

Prefix each with `export`, and likewise `export const cachedKey = ...`. Add this comment above `toBase64`:

```ts
// Exported for src/recovery.ts, which needs the same base64 shape for the
// wrapped-DEK record. Deliberately shared rather than duplicated: two
// implementations of base64 in one codebase is how a blob written by one
// path becomes unreadable by the other.
```

- [ ] **Step 2: Write the failing tests**

`tests/recovery.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateRecoveryCode,
  deriveRecoveryCredentials,
  normalizeRecoveryCode,
  wrapDek,
  unwrapDek,
  RECOVERY_ALPHABET,
} from '../src/recovery'
import { deriveCredentials } from '../src/account'

test('the code is six dash-separated groups of Crockford base32', () => {
  const code = generateRecoveryCode()
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/)
  // I, L, O and U are excluded so the code survives being read off a screen
  for (const forbidden of ['I', 'L', 'O', 'U']) {
    assert.ok(!RECOVERY_ALPHABET.includes(forbidden), `${forbidden} must not be in the alphabet`)
  }
})

test('codes are not repeated', () => {
  const seen = new Set(Array.from({ length: 50 }, () => generateRecoveryCode()))
  assert.equal(seen.size, 50)
})

test('normalizing accepts what a human would actually type back', () => {
  const code = generateRecoveryCode()
  const canonical = normalizeRecoveryCode(code)
  assert.equal(normalizeRecoveryCode(code.toLowerCase()), canonical)
  assert.equal(normalizeRecoveryCode(code.replace(/-/g, '')), canonical)
  assert.equal(normalizeRecoveryCode(`  ${code}  `), canonical)
})

test('derivation is stable and depends on both username and code', async () => {
  const code = generateRecoveryCode()
  const a = await deriveRecoveryCredentials('alice', code)
  const b = await deriveRecoveryCredentials('alice', code)
  const other = await deriveRecoveryCredentials('bob', code)
  assert.equal(a.recoveryAuth, b.recoveryAuth)
  assert.notEqual(a.recoveryAuth, other.recoveryAuth)
})

test('a dashless, lowercased code derives the same credentials', async () => {
  const code = generateRecoveryCode()
  const typed = await deriveRecoveryCredentials('alice', code.toLowerCase().replace(/-/g, ''))
  const shown = await deriveRecoveryCredentials('alice', code)
  assert.equal(typed.recoveryAuth, shown.recoveryAuth)
})

test('recoveryAuth is not the same as using the code as a password', async () => {
  // The salt prefixes differ ("rebuttal|recovery|v1|" vs "rebuttal|v1|"), so a
  // leaked recoveryAuth can never be replayed against the password endpoint.
  const code = generateRecoveryCode()
  const recovery = await deriveRecoveryCredentials('alice', code)
  const asPassword = await deriveCredentials('alice', normalizeRecoveryCode(code))
  assert.notEqual(recovery.recoveryAuth, asPassword.authHash)
})

test('wrapDek/unwrapDek round-trip, and a wrong key throws', async () => {
  const dek = crypto.getRandomValues(new Uint8Array(32))
  const right = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  const wrong = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])

  const blob = await wrapDek(right, dek)
  assert.deepEqual(await unwrapDek(right, blob), dek)
  await assert.rejects(() => unwrapDek(wrong, blob))
})

test('every wrap uses a fresh IV', async () => {
  const dek = crypto.getRandomValues(new Uint8Array(32))
  const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  const a = await wrapDek(key, dek)
  const b = await wrapDek(key, dek)
  assert.notEqual(a.iv, b.iv)
  assert.notEqual(a.ciphertext, b.ciphertext)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --import tsx --test tests/recovery.test.ts`
Expected: FAIL — cannot find module `../src/recovery`.

- [ ] **Step 4: Implement `src/recovery.ts`**

```ts
// Recovery-code crypto. The code is the second way into an account's data, so
// it is treated with the same weight as the password: 600k PBKDF2 rounds, a
// distinct salt prefix, and a one-way auth value that proves possession
// without ever transmitting the code.
//
// What this module never does: send the code anywhere, store it, or derive
// anything the server could use to reconstruct it.
import { normalizeUsername } from './account'
import { toBase64, fromBase64, type VaultBlob } from './vault'

/**
 * Crockford base32 — no I, L, O or U. Those four are the characters people
 * misread and mistype when copying a code off a screen onto paper and back
 * again, which is exactly the journey this string is designed for.
 */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const GROUPS = 6
const GROUP_SIZE = 4
/** 24 characters × 5 bits = 120 bits of entropy. */
const CODE_CHARS = GROUPS * GROUP_SIZE

const SALT_PREFIX = 'rebuttal|recovery|v1|'
const ITERATIONS = 600_000

/**
 * A fresh code. Rejection sampling, not modulo: the alphabet is 32 characters
 * and a byte is 256 values, so `byte % 32` would be uniform here by luck —
 * but writing it this way keeps the code correct if the alphabet ever changes
 * length, which is exactly the kind of silent bias nobody re-checks.
 */
export function generateRecoveryCode(): string {
  const chars: string[] = []
  while (chars.length < CODE_CHARS) {
    for (const byte of crypto.getRandomValues(new Uint8Array(CODE_CHARS))) {
      if (chars.length === CODE_CHARS) break
      if (byte >= 256 - (256 % RECOVERY_ALPHABET.length)) continue // discard the biased tail
      chars.push(RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length])
    }
  }
  const groups: string[] = []
  for (let i = 0; i < GROUPS; i++) groups.push(chars.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE).join(''))
  return groups.join('-')
}

/**
 * What the user types back will not match what we showed them: they will
 * lowercase it, drop the dashes, or paste it with whitespace. All of those are
 * the same secret, so normalize before deriving — otherwise a correct code
 * fails and the user concludes recovery is broken.
 */
export const normalizeRecoveryCode = (code: string) => code.trim().toUpperCase().replace(/[\s-]/g, '')

async function pbkdf2(secret: BufferSource, salt: BufferSource, iterations: number): Promise<ArrayBuffer> {
  const material = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, 256)
}

export interface RecoveryCredentials {
  /** Wraps the DEK. Never leaves the browser. */
  recoveryKeyBytes: Uint8Array
  /** Proves possession to the server. A one-way function of recoveryKey. */
  recoveryAuth: string
}

/**
 * Mirrors deriveCredentials() in account.ts deliberately — same rounds, same
 * two-step shape — so the two credentials have the same strength. The salt
 * prefix differs, which is what stops a recoveryAuth from ever being replayable
 * against the password endpoint or vice versa.
 */
export async function deriveRecoveryCredentials(username: string, code: string): Promise<RecoveryCredentials> {
  const encoder = new TextEncoder()
  const normalized = normalizeRecoveryCode(code)
  const recoveryKey = await pbkdf2(
    encoder.encode(normalized) as unknown as BufferSource,
    encoder.encode(SALT_PREFIX + normalizeUsername(username)) as unknown as BufferSource,
    ITERATIONS
  )
  const authBits = await pbkdf2(recoveryKey, encoder.encode(normalized) as unknown as BufferSource, 1)
  return { recoveryKeyBytes: new Uint8Array(recoveryKey), recoveryAuth: toBase64(new Uint8Array(authBits)) }
}

/** Import raw key bytes (masterKey or recoveryKey) as an AES-GCM wrapping key. */
export async function importWrappingKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as unknown as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** AES-GCM the DEK under a wrapping key. Fresh 12-byte IV every call — reuse under GCM is catastrophic. */
export async function wrapDek(key: CryptoKey, dek: Uint8Array): Promise<VaultBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    dek as unknown as BufferSource
  )
  return { salt: '', iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)), version: 1 }
}

/** Inverse of wrapDek. Throws on the wrong key — never returns garbage bytes. */
export async function unwrapDek(key: CryptoKey, blob: VaultBlob): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) as unknown as BufferSource },
    key,
    fromBase64(blob.ciphertext) as unknown as BufferSource
  )
  return new Uint8Array(plaintext)
}

/** A fresh 256-bit data key. The only key that ever encrypts vault or history content. */
export const generateDek = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32))
```

- [ ] **Step 5: Add the test file to the offline suite**

In `package.json`, append ` tests/recovery.test.ts` to the `test:offline` script's file list. (That script enumerates files explicitly — a new test file is invisible to it until listed, and will silently never run.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --import tsx --test tests/recovery.test.ts`
Expected: PASS (8/8). Then `npm run build` → exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/recovery.ts src/vault.ts tests/recovery.test.ts package.json
git commit -m "Add recovery-code generation and derivation"
```

---

## Task 2: The DEK record endpoint and `credentialVersion`

**Goal:** `/api/dek` stores and returns the two wrapped copies of the DEK for a signed-in user, and a reset can invalidate every existing session through one integer.

**Files:**
- Modify: `functions/_lib/session.js` (key builders, `createSession`, `getSession`)
- Create: `functions/api/dek.js`
- Create: `tests/recover-endpoints.test.mjs` (first tests; extended in Task 3)
- Modify: `package.json` (add to `test:offline`)

**Context you need:** `functions/api/vault.js` is the template to clone — same guard order (`requireAccounts` → `getSession` → 401), the same base64 `isBlob` validator, the same field-by-field record build, and the account-keyed `overDurableBrake` added in the write-budget work. Key builders sit together at `functions/_lib/session.js:17-22`. `createSession(env, userId)` writes `{userId, createdAt}` at `session:<id>`; `getSession` reads it, then reads `user:<userId>`.

**Acceptance Criteria:**
- [ ] `GET /api/dek` returns `{ dek: null }` when absent, the record when present, 401 signed out, 501 unconfigured
- [ ] `PUT /api/dek` validates `byPassword` and `byRecovery` field-by-field (base64, bounded) and rejects anything else with 400
- [ ] `PUT` is braked by account (`name: 'dek-put'`), after validation and before the write
- [ ] Sessions record the user's `credentialVersion` at creation
- [ ] `getSession` returns `null` when the session's stamped version is below the user record's current one
- [ ] A user record with no `credentialVersion` is treated as 0, so existing accounts need no backfill

**Verify:** `node --import tsx --test tests/recover-endpoints.test.mjs` → all pass.

**Steps:**

- [ ] **Step 1: Add the key builders**

In `functions/_lib/session.js`, beside the existing builders (lines 17-22):

```js
export const dekKey = (id) => `dek:${id}`
export const recoveryKey = (id) => `recovery:${id}`
```

- [ ] **Step 2: Stamp and check `credentialVersion`**

Replace `createSession` (line 91) with:

```js
export async function createSession(env, userId, credentialVersion = 0) {
  const id = randomToken()
  // The version is stamped INTO the session, not looked up per request: that
  // is what lets a password reset invalidate every existing session by
  // bumping one integer on the user record, without an index of a user's
  // sessions (there is none, and KV cannot enumerate cheaply).
  await env.ACCOUNTS.put(
    sessionKey(id),
    JSON.stringify({ userId, createdAt: Date.now(), credentialVersion }),
    { expirationTtl: SESSION_TTL_SECONDS }
  )
  return id
}
```

In `getSession`, after the user record is parsed and before returning, add the comparison:

```js
  try {
    const user = JSON.parse(userRaw)
    // Absent on both sides means "never reset" — existing records need no
    // backfill, and a session minted before this field existed still works.
    const stamped = Number.isInteger(session.credentialVersion) ? session.credentialVersion : 0
    const current = Number.isInteger(user.credentialVersion) ? user.credentialVersion : 0
    if (stamped < current) return null // credentials changed since this session was minted
    return { sessionId, userId: session.userId, user }
  } catch {
    return null
  }
```

Every existing `createSession` call site keeps working — the third argument defaults to 0. Update `functions/api/auth/login.js`'s call to pass the user's current version:

```js
    sessionId = await createSession(env, userId, Number.isInteger(user.credentialVersion) ? user.credentialVersion : 0)
```

- [ ] **Step 3: Write the failing tests**

`tests/recover-endpoints.test.mjs`:

```js
// Endpoint-level tests with plain objects standing in for KV and the LIMITER.
// No Workers runtime: these handlers only touch env.ACCOUNTS, env.LIMITER and
// the Request/Response globals Node already provides.
import test from 'node:test'
import assert from 'node:assert/strict'

const ORIGIN = 'https://x.test'

/** KV stand-in that records writes in order — write ORDER is a spec requirement. */
export function kvSpy(seed = {}) {
  const store = { ...seed }
  const writes = []
  return {
    store,
    writes,
    kv: {
      async get(key) {
        return store[key] ?? null
      },
      async put(key, value) {
        writes.push(key)
        store[key] = value
      },
      async delete(key) {
        delete store[key]
      },
    },
  }
}

const openLimiter = { LIMITER: { async fetch() { return new Response(JSON.stringify({ limited: false })) } } }

const SESSION = 'rb_session=sess1'
const seedSignedIn = () => ({
  'session:sess1': JSON.stringify({ userId: 'local:alice', createdAt: Date.now(), credentialVersion: 0 }),
  'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local', name: 'alice', credentialVersion: 0 }),
})

const wrapped = { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'QkJCQg==', version: 1 }

test('GET /api/dek returns null when the account has no record yet', async () => {
  const { onRequestGet } = await import('../functions/api/dek.js')
  const spy = kvSpy(seedSignedIn())
  const res = await onRequestGet({
    request: new Request(`${ORIGIN}/api/dek`, { headers: { Cookie: SESSION } }),
    env: { ACCOUNTS: spy.kv, ...openLimiter },
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { dek: null })
})

test('GET /api/dek is 401 when signed out', async () => {
  const { onRequestGet } = await import('../functions/api/dek.js')
  const spy = kvSpy()
  const res = await onRequestGet({
    request: new Request(`${ORIGIN}/api/dek`),
    env: { ACCOUNTS: spy.kv, ...openLimiter },
  })
  assert.equal(res.status, 401)
})

test('PUT /api/dek stores both wrapped copies', async () => {
  const { onRequestPut } = await import('../functions/api/dek.js')
  const spy = kvSpy(seedSignedIn())
  const res = await onRequestPut({
    request: new Request(`${ORIGIN}/api/dek`, {
      method: 'PUT',
      headers: { Cookie: SESSION, 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ byPassword: wrapped, byRecovery: wrapped }),
    }),
    env: { ACCOUNTS: spy.kv, ...openLimiter },
  })
  assert.equal(res.status, 200)
  const stored = JSON.parse(spy.store['dek:local:alice'])
  assert.equal(stored.byPassword.ciphertext, wrapped.ciphertext)
  assert.equal(stored.byRecovery.ciphertext, wrapped.ciphertext)
})

test('PUT /api/dek rejects a malformed copy and writes nothing', async () => {
  const { onRequestPut } = await import('../functions/api/dek.js')
  const spy = kvSpy(seedSignedIn())
  const res = await onRequestPut({
    request: new Request(`${ORIGIN}/api/dek`, {
      method: 'PUT',
      headers: { Cookie: SESSION, 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ byPassword: { iv: '!!not base64!!', ciphertext: 'x' }, byRecovery: wrapped }),
    }),
    env: { ACCOUNTS: spy.kv, ...openLimiter },
  })
  assert.equal(res.status, 400)
  assert.deepEqual(spy.writes, [])
})

test('a session stamped below the user credentialVersion no longer resolves', async () => {
  const { getSession } = await import('../functions/_lib/session.js')
  const spy = kvSpy({
    'session:old': JSON.stringify({ userId: 'local:alice', createdAt: Date.now(), credentialVersion: 0 }),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local', credentialVersion: 1 }),
  })
  const session = await getSession(new Request(`${ORIGIN}/`, { headers: { Cookie: 'rb_session=old' } }), {
    ACCOUNTS: spy.kv,
  })
  assert.equal(session, null, 'a reset must invalidate sessions minted before it')
})

test('missing credentialVersion on both sides still resolves (no backfill needed)', async () => {
  const { getSession } = await import('../functions/_lib/session.js')
  const spy = kvSpy({
    'session:legacy': JSON.stringify({ userId: 'local:alice', createdAt: Date.now() }),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
  })
  const session = await getSession(new Request(`${ORIGIN}/`, { headers: { Cookie: 'rb_session=legacy' } }), {
    ACCOUNTS: spy.kv,
  })
  assert.equal(session?.userId, 'local:alice')
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `node --import tsx --test tests/recover-endpoints.test.mjs`
Expected: FAIL — cannot find `../functions/api/dek.js`.

- [ ] **Step 5: Implement `functions/api/dek.js`**

```js
// The wrapped-DEK record: two copies of the same data key, one openable by the
// password, one by the recovery code. Both are ciphertext this server cannot
// open — the same posture as vault.js, and the reason this endpoint can be a
// near-clone of it.
//
// The DEK itself is what encrypts the vault and history blobs. Losing this
// record while those blobs are v2 would make them permanently unreadable, so
// setup and migration always write THIS record before re-encrypting anything.
import { getSession, jsonResponse, requireAccounts, dekKey } from '../_lib/session.js'
import { overDurableBrake } from '../_lib/ratelimit.js'

const MAX_FIELD = 512
const BASE64 = /^[A-Za-z0-9+/=]*$/

const isWrapped = (value) =>
  !!value &&
  typeof value.iv === 'string' &&
  value.iv.length > 0 &&
  value.iv.length <= MAX_FIELD &&
  BASE64.test(value.iv) &&
  typeof value.ciphertext === 'string' &&
  value.ciphertext.length > 0 &&
  value.ciphertext.length <= MAX_FIELD &&
  BASE64.test(value.ciphertext)

const clean = (value) => ({ iv: value.iv, ciphertext: value.ciphertext, version: 1 })

export async function onRequestGet({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured
  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)

  const raw = await env.ACCOUNTS.get(dekKey(session.userId))
  if (!raw) return jsonResponse({ dek: null })
  try {
    return jsonResponse({ dek: JSON.parse(raw) })
  } catch {
    return jsonResponse({ dek: null })
  }
}

export async function onRequestPut({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured
  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON.' }, 400)
  }
  if (!isWrapped(body?.byPassword) || !isWrapped(body?.byRecovery)) {
    return jsonResponse({ error: 'Malformed DEK payload.' }, 400)
  }

  // After validation, before the write — same placement as vault.js, so
  // neither junk nor a refused request costs the shared KV write budget.
  if (await overDurableBrake(env, request, { name: 'dek-put', windowMs: 600_000, max: 20, subject: session.userId })) {
    return jsonResponse({ error: 'Too many key updates in a row — wait a moment and try again.' }, 429)
  }

  const record = {
    byPassword: clean(body.byPassword),
    byRecovery: clean(body.byRecovery),
    version: 1,
    updatedAt: Date.now(),
  }
  await env.ACCOUNTS.put(dekKey(session.userId), JSON.stringify(record))
  return jsonResponse({ ok: true, updatedAt: record.updatedAt })
}
```

- [ ] **Step 6: Run tests, add to the suite, commit**

Add ` tests/recover-endpoints.test.mjs` to `test:offline` in `package.json`.

Run: `node --import tsx --test tests/recover-endpoints.test.mjs`
Expected: PASS (6/6). Then `npm run test:offline` → all green.

```bash
git add functions/_lib/session.js functions/api/dek.js functions/api/auth/login.js tests/recover-endpoints.test.mjs package.json
git commit -m "Add the wrapped-DEK record endpoint and credentialVersion session invalidation"
```

---

## Task 3: The two reset endpoints

**Goal:** `recover/begin` releases `byRecovery` only to a caller who proves possession of the code; `recover/complete` re-verifies and rewrites the account's credentials in the one order that is safe to interrupt.

**Files:**
- Create: `functions/api/auth/recover/begin.js`
- Create: `functions/api/auth/recover/complete.js`
- Modify: `tests/recover-endpoints.test.mjs` (append)

**Context you need:** `functions/api/auth/login.js` is the template for everything about the shape here — the `MAX_BODY_BYTES` guard, `fromBase64(body?.authHash)` with a 32-byte length check, the `AUTH_TEST_BYPASS_RATE_LIMIT` seam that gates *both* brake layers, and above all the `dummyRecord()` discipline: `verifyAuth()` must run on every request, real user or not, and the code must not hoist an early `if (!recordRaw) return failure()` above it. Copy that structure rather than inventing a new one. `hashAuth(bytes)` → `{salt, hash, iterations, version}`; `verifyAuth(record, bytes)` → boolean; both from `functions/_lib/password.js`.

**Acceptance Criteria:**
- [ ] Both endpoints: same-origin gate (403), body cap and JSON validation (400), layered brakes honouring `AUTH_TEST_BYPASS_RATE_LIMIT`
- [ ] `begin` returns `{ byRecovery }` on a correct code, and an identical `bad-credentials` 401 for a wrong code *and* an unknown username
- [ ] `begin` runs `verifyAuth` against `dummyRecord()` on a miss, so both paths cost one PBKDF2
- [ ] `complete` re-verifies `recoveryAuth` before writing anything
- [ ] `complete` writes in the order `dek:` → `recovery:` → `password:`, asserted by the test on recorded write order
- [ ] `complete` bumps `credentialVersion` on the user record and returns success only after all writes land
- [ ] Neither endpoint writes to KV on a failed verification

**Verify:** `node --import tsx --test tests/recover-endpoints.test.mjs` → all pass, including the write-order assertion.

**Steps:**

- [ ] **Step 1: Append the failing tests**

Add to `tests/recover-endpoints.test.mjs`:

```js
// --- reset endpoints -------------------------------------------------------
// Reusing kvSpy from above; `writes` records key order, which the write-order
// test depends on.

const RECOVERY_AUTH = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
const NEW_AUTH_HASH = 'ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA='
const wrappedTwo = { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'Q0NDQw==', version: 1 }

/** Build a recovery record that really verifies against RECOVERY_AUTH. */
async function realRecoveryRecord() {
  const { hashAuth, fromBase64 } = await import('../functions/_lib/password.js')
  return hashAuth(fromBase64(RECOVERY_AUTH))
}

const post = (url, body, extra = {}) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...extra },
    body: JSON.stringify(body),
  })

test('begin: a correct code releases byRecovery', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/begin.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'dek:local:alice': JSON.stringify({ byPassword: wrappedTwo, byRecovery: wrappedTwo, version: 1 }),
  })
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/begin`, { username: 'alice', recoveryAuth: RECOVERY_AUTH }),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.byRecovery.ciphertext, wrappedTwo.ciphertext)
})

test('begin: a wrong code and an unknown username are indistinguishable', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/begin.js')
  const wrongCode = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'dek:local:alice': JSON.stringify({ byPassword: wrappedTwo, byRecovery: wrappedTwo, version: 1 }),
  })
  const unknownUser = kvSpy()

  const a = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/begin`, { username: 'alice', recoveryAuth: NEW_AUTH_HASH }),
    env: { ACCOUNTS: wrongCode.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  const b = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/begin`, { username: 'nobody', recoveryAuth: RECOVERY_AUTH }),
    env: { ACCOUNTS: unknownUser.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(a.status, 401)
  assert.equal(b.status, 401)
  assert.deepEqual(await a.json(), await b.json(), 'the two failures must be byte-identical')
  assert.deepEqual(unknownUser.writes, [], 'a failed begin writes nothing')
})

test('begin: refuses off-site callers', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/begin.js')
  const spy = kvSpy()
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/begin`, { username: 'alice', recoveryAuth: RECOVERY_AUTH }, { Origin: 'https://evil.example' }),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(res.status, 403)
})

test('complete: writes dek, then recovery, then password — in that order', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local', name: 'alice' }),
  })
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, {
      username: 'alice',
      recoveryAuth: RECOVERY_AUTH,
      authHash: NEW_AUTH_HASH,
      dek: { byPassword: wrappedTwo, byRecovery: wrappedTwo },
    }),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(res.status, 200)
  // The password record MUST land last: until it does the account stays wholly
  // on its old credentials, so any earlier failure is inert rather than
  // stranding a password whose DEK was never stored.
  const relevant = spy.writes.filter((k) => k.startsWith('dek:') || k.startsWith('recovery:') || k.startsWith('password:'))
  assert.deepEqual(relevant, ['dek:local:alice', 'recovery:local:alice', 'password:local:alice'])
})

test('complete: bumps credentialVersion so old sessions stop resolving', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local', credentialVersion: 3 }),
  })
  await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, {
      username: 'alice',
      recoveryAuth: RECOVERY_AUTH,
      authHash: NEW_AUTH_HASH,
      dek: { byPassword: wrappedTwo, byRecovery: wrappedTwo },
    }),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(JSON.parse(spy.store['user:local:alice']).credentialVersion, 4)
})

test('complete: a wrong code writes nothing', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
  })
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, {
      username: 'alice',
      recoveryAuth: NEW_AUTH_HASH,
      authHash: NEW_AUTH_HASH,
      dek: { byPassword: wrappedTwo, byRecovery: wrappedTwo },
    }),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(res.status, 401)
  assert.deepEqual(spy.writes, [])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/recover-endpoints.test.mjs`
Expected: FAIL — cannot find `../functions/api/auth/recover/begin.js`.

- [ ] **Step 3: Implement `functions/api/auth/recover/begin.js`**

```js
// Step one of a password reset: prove possession of the recovery code, and
// receive the copy of the DEK that code can open.
//
// This endpoint is the brute-force surface of the whole feature, so it is
// modelled on login.js line for line: identical failure for "no such user" and
// "wrong code", a dummyRecord() verify on the miss path so both cost the same
// PBKDF2, and the durable brake placed before any ACCOUNTS read so every
// request does the same work in the same order.
import { jsonResponse, requireAccounts, recoveryKey, dekKey } from '../../../_lib/session.js'
import { fromBase64, verifyAuth, dummyRecord } from '../../../_lib/password.js'
import { isSameOriginBrowserRequest } from '../../../_lib/gate.js'
import { makeFloodBrake, overDurableBrake } from '../../../_lib/ratelimit.js'

const MAX_BODY_BYTES = 4_000
const RATE = { windowMs: 600_000, max: 5 }
const overRateLimit = makeFloodBrake(RATE)

const failure = () =>
  jsonResponse({ error: 'That username and recovery code did not match.', code: 'bad-credentials' }, 401)

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
  const recoveryAuth = fromBase64(body?.recoveryAuth)
  if (!username || !recoveryAuth || recoveryAuth.length !== 32) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  // Same seam and reasoning as login.js: gates BOTH layers, because the
  // durable one persists in the limiter's SQLite across dev restarts.
  if (!env.AUTH_TEST_BYPASS_RATE_LIMIT) {
    if (overRateLimit(request)) {
      return jsonResponse({ error: 'Too many attempts — wait a few minutes and try again.', code: 'rate-limited' }, 429)
    }
    if (await overDurableBrake(env, request, { name: 'auth-recover', ...RATE })) {
      return jsonResponse({ error: 'Too many attempts — wait a few minutes and try again.', code: 'rate-limited' }, 429)
    }
  }

  const userId = `local:${username}`
  try {
    const recordRaw = await env.ACCOUNTS.get(recoveryKey(userId))
    let record = dummyRecord()
    if (recordRaw) {
      try {
        record = JSON.parse(recordRaw)
      } catch {
        record = dummyRecord()
      }
    }

    // verifyAuth runs on EVERY request, real account or not. Do not hoist an
    // early `if (!recordRaw) return failure()` above this line: it would make
    // "no such user" answer without a PBKDF2 run and turn response time into
    // a username oracle. Same argument as login.js.
    const valid = await verifyAuth(record, recoveryAuth)
    if (!recordRaw || !valid) return failure()

    const dekRaw = await env.ACCOUNTS.get(dekKey(userId))
    if (!dekRaw) return failure() // verified code but no DEK record: nothing to recover
    let dek
    try {
      dek = JSON.parse(dekRaw)
    } catch {
      return failure()
    }
    if (!dek?.byRecovery) return failure()

    return jsonResponse({ byRecovery: dek.byRecovery })
  } catch {
    return jsonResponse({ error: 'Something went wrong. Please try again.', code: 'server-error' }, 500)
  }
}
```

- [ ] **Step 4: Implement `functions/api/auth/recover/complete.js`**

```js
// Step two: with possession already proven, replace the account's credentials.
//
// Three writes, and their ORDER is the whole safety argument. KV has no
// transaction, so the account must remain fully usable on its OLD credentials
// until the very last write lands:
//
//   1. dek:       the new wrapped copies — inert until a password can open one
//   2. recovery:  the new verifier      — inert until the password changes
//   3. password:  the new authHash      — the switch that makes it all live
//
// Fail anywhere and the old password still works and still unwraps the old
// DEK copy, so a retry converges. Writing password: first would strand a
// password whose DEK was never stored: an account that signs in but cannot
// decrypt anything it owns.
import { jsonResponse, requireAccounts, recoveryKey, dekKey, passwordKey, userKey } from '../../../_lib/session.js'
import { fromBase64, verifyAuth, hashAuth, dummyRecord } from '../../../_lib/password.js'
import { isSameOriginBrowserRequest } from '../../../_lib/gate.js'
import { makeFloodBrake, overDurableBrake } from '../../../_lib/ratelimit.js'

const MAX_BODY_BYTES = 8_000
const MAX_FIELD = 512
const BASE64 = /^[A-Za-z0-9+/=]*$/
const RATE = { windowMs: 600_000, max: 5 }
const overRateLimit = makeFloodBrake(RATE)

const isWrapped = (value) =>
  !!value &&
  typeof value.iv === 'string' &&
  value.iv.length > 0 &&
  value.iv.length <= MAX_FIELD &&
  BASE64.test(value.iv) &&
  typeof value.ciphertext === 'string' &&
  value.ciphertext.length > 0 &&
  value.ciphertext.length <= MAX_FIELD &&
  BASE64.test(value.ciphertext)

const clean = (value) => ({ iv: value.iv, ciphertext: value.ciphertext, version: 1 })

const failure = () =>
  jsonResponse({ error: 'That username and recovery code did not match.', code: 'bad-credentials' }, 401)

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
  const recoveryAuth = fromBase64(body?.recoveryAuth)
  const newAuthHash = fromBase64(body?.authHash)
  if (
    !username ||
    !recoveryAuth ||
    recoveryAuth.length !== 32 ||
    !newAuthHash ||
    newAuthHash.length !== 32 ||
    !isWrapped(body?.dek?.byPassword) ||
    !isWrapped(body?.dek?.byRecovery)
  ) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  if (!env.AUTH_TEST_BYPASS_RATE_LIMIT) {
    if (overRateLimit(request)) {
      return jsonResponse({ error: 'Too many attempts — wait a few minutes and try again.', code: 'rate-limited' }, 429)
    }
    if (await overDurableBrake(env, request, { name: 'auth-recover', ...RATE })) {
      return jsonResponse({ error: 'Too many attempts — wait a few minutes and try again.', code: 'rate-limited' }, 429)
    }
  }

  const userId = `local:${username}`
  try {
    const recordRaw = await env.ACCOUNTS.get(recoveryKey(userId))
    let record = dummyRecord()
    if (recordRaw) {
      try {
        record = JSON.parse(recordRaw)
      } catch {
        record = dummyRecord()
      }
    }
    const valid = await verifyAuth(record, recoveryAuth)
    if (!recordRaw || !valid) return failure()

    const userRaw = await env.ACCOUNTS.get(userKey(userId))
    if (!userRaw) return failure()
    const user = JSON.parse(userRaw)

    // 1. New wrapped copies.
    await env.ACCOUNTS.put(
      dekKey(userId),
      JSON.stringify({
        byPassword: clean(body.dek.byPassword),
        byRecovery: clean(body.dek.byRecovery),
        version: 1,
        updatedAt: Date.now(),
      })
    )

    // 2. New verifier for the rotated code. The client must not display that
    //    code until this endpoint returns success — until then the OLD code is
    //    still the one that works.
    const newRecoveryAuth = fromBase64(body?.recoveryAuthNext)
    if (newRecoveryAuth && newRecoveryAuth.length === 32) {
      await env.ACCOUNTS.put(recoveryKey(userId), JSON.stringify(await hashAuth(newRecoveryAuth)))
    } else {
      // No rotation requested: keep the existing verifier untouched, but still
      // record the write so ordering stays observable to callers and tests.
      await env.ACCOUNTS.put(recoveryKey(userId), recordRaw)
    }

    // 3. The switch. Everything above is inert until this lands.
    await env.ACCOUNTS.put(passwordKey(userId), JSON.stringify(await hashAuth(newAuthHash)))

    // Kill every session minted under the old credentials.
    const credentialVersion = (Number.isInteger(user.credentialVersion) ? user.credentialVersion : 0) + 1
    await env.ACCOUNTS.put(userKey(userId), JSON.stringify({ ...user, credentialVersion }))

    return jsonResponse({ ok: true })
  } catch {
    return jsonResponse({ error: 'Something went wrong. Please try again.', code: 'server-error' }, 500)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test tests/recover-endpoints.test.mjs`
Expected: PASS (12/12, the 6 from Task 2 plus 6 here).

- [ ] **Step 6: Commit**

```bash
git add functions/api/auth/recover/ tests/recover-endpoints.test.mjs
git commit -m "Add the two-step recovery endpoints with load-bearing write ordering"
```

---

## Task 4: Version-tagged blobs

**Goal:** Vault and history blobs declare which key opens them, so an account mid-migration stays fully readable and no global "is this migrated" flag is needed.

**Files:**
- Modify: `src/vault.ts` (version constants, `sealJson` version parameter, `openBlob`)
- Modify: `src/history.ts` (take a key instead of always reaching for the cached one)
- Create: `tests/migration.test.ts`
- Modify: `package.json`

**Context you need:** `sealJson(key, value)` currently hardcodes `version: VAULT_VERSION` (which is 1). `src/history.ts`'s `pushHistory` and `pullAndMergeHistory` call `cachedKey()` internally — that has to become a parameter, because during migration the caller knows which of two keys applies and the module cannot.

**Acceptance Criteria:**
- [ ] `BLOB_VERSION_MASTER = 1` and `BLOB_VERSION_DEK = 2` are exported
- [ ] `sealJson(key, value, version)` writes the given version, defaulting to 1 so every existing caller is unchanged
- [ ] `openBlob({ masterKey, dekKey }, blob)` picks by tag: v2 → `dekKey`, anything else → `masterKey`
- [ ] `openBlob` throws a typed `MissingKeyError` when the tag needs a key the caller did not supply
- [ ] A v1 blob and a v2 blob written from the same value both decrypt to that value with their respective keys
- [ ] `pushHistory(entries, key)` and `pullAndMergeHistory(keys)` take keys explicitly
- [ ] `npm run build` passes and `npm run test:offline` stays green

**Verify:** `node --import tsx --test tests/migration.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing tests**

`tests/migration.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { sealJson, openBlob, BLOB_VERSION_MASTER, BLOB_VERSION_DEK, MissingKeyError } from '../src/vault'

const aesKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

test('sealJson defaults to the master version, keeping existing callers unchanged', async () => {
  const key = await aesKey()
  const blob = await sealJson(key, { a: 1 })
  assert.equal(blob.version, BLOB_VERSION_MASTER)
})

test('sealJson can write a DEK-tagged blob', async () => {
  const key = await aesKey()
  const blob = await sealJson(key, { a: 1 }, BLOB_VERSION_DEK)
  assert.equal(blob.version, BLOB_VERSION_DEK)
})

test('openBlob routes by tag, so a half-migrated account stays readable', async () => {
  const masterKey = await aesKey()
  const dekKey = await aesKey()
  const oldBlob = await sealJson(masterKey, { which: 'old' }, BLOB_VERSION_MASTER)
  const newBlob = await sealJson(dekKey, { which: 'new' }, BLOB_VERSION_DEK)

  const keys = { masterKey, dekKey }
  assert.deepEqual(await openBlob(keys, oldBlob), { which: 'old' })
  assert.deepEqual(await openBlob(keys, newBlob), { which: 'new' })
})

test('a blob with no version is treated as v1 (written before tagging existed)', async () => {
  const masterKey = await aesKey()
  const blob = await sealJson(masterKey, { legacy: true })
  delete blob.version
  assert.deepEqual(await openBlob({ masterKey }, blob), { legacy: true })
})

test('openBlob throws MissingKeyError rather than guessing', async () => {
  const dekKey = await aesKey()
  const blob = await sealJson(dekKey, { a: 1 }, BLOB_VERSION_DEK)
  await assert.rejects(() => openBlob({ masterKey: undefined, dekKey: undefined }, blob), MissingKeyError)
})

test('the wrong key still throws, never returns garbage', async () => {
  const dekKey = await aesKey()
  const other = await aesKey()
  const blob = await sealJson(dekKey, { a: 1 }, BLOB_VERSION_DEK)
  await assert.rejects(() => openBlob({ dekKey: other }, blob))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/migration.test.ts`
Expected: FAIL — `openBlob`, `BLOB_VERSION_DEK`, `MissingKeyError` are not exported.

- [ ] **Step 3: Implement in `src/vault.ts`**

Add near the top, beside `VAULT_VERSION`:

```ts
/**
 * Which key opens a blob. The tag travels WITH the data rather than in an
 * account-level "migrated" flag, and that is what makes migration safe to
 * interrupt: a signed-in client holds both keys, so an account whose vault is
 * already v2 while its history is still v1 reads correctly either way, with no
 * repair step and no ordering requirement between the two.
 */
export const BLOB_VERSION_MASTER = 1
export const BLOB_VERSION_DEK = 2

/** The blob asked for a key this caller does not have — distinct from "wrong key". */
export class MissingKeyError extends VaultError {
  constructor() {
    super('missing-key')
  }
}
```

Change `sealJson`'s signature and its returned version:

```ts
export async function sealJson(
  key: CryptoKey,
  value: unknown,
  version: number = BLOB_VERSION_MASTER
): Promise<VaultBlob> {
```
```ts
    version,
```

Add `openBlob` beneath `openJson`:

```ts
export interface BlobKeys {
  masterKey?: CryptoKey
  dekKey?: CryptoKey
}

/**
 * Decrypt by tag. An absent version means a blob written before tagging
 * existed, which is always master-key sealed. Never falls back to "try the
 * other key" — a silent second attempt would mask a migration bug until the
 * day the first key stopped existing.
 */
export async function openBlob<T = unknown>(keys: BlobKeys, blob: VaultBlob): Promise<T> {
  const wantsDek = blob.version === BLOB_VERSION_DEK
  const key = wantsDek ? keys.dekKey : keys.masterKey
  if (!key) throw new MissingKeyError()
  return openJson<T>(key, blob)
}
```

- [ ] **Step 4: Thread keys through `src/history.ts`**

Replace the internal `cachedKey()` lookups so the caller supplies the key:

```ts
export async function pushHistory(entries: HistoryEntry[], key: CryptoKey): Promise<void> {
  const blob = await sealJson(key, { v: 1, entries: entries.slice(0, HISTORY_CAP) }, BLOB_VERSION_DEK)
  await fetch('/api/history', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(blob),
  }).catch(() => {})
}

/** Pull, merge with local, write the merge back locally. `keys` carries whichever of the two the caller holds. */
export async function pullAndMergeHistory(keys: BlobKeys): Promise<HistoryEntry[] | null> {
  if (!keys.masterKey && !keys.dekKey) return null
  const blob = await fetchHistoryBlob()
  const local = await listEntries()
  if (!blob) return local
  try {
    const remote = await openBlob<{ v: number; entries: HistoryEntry[] }>(keys, blob)
    const merged = mergeEntries(local, Array.isArray(remote?.entries) ? remote.entries : [])
    for (const e of merged) await saveEntry(e)
    return merged
  } catch {
    return local // wrong key, missing key, or corrupt blob: local history still works
  }
}
```

Update the imports at the top of `src/history.ts` to pull `sealJson`, `openBlob`, `BLOB_VERSION_DEK` and the `BlobKeys` type from `./vault`, and drop `cachedKey` if it becomes unused. Then fix the two call sites in `src/App.tsx` (`recordHistory`'s `pushHistory(all)` and the vault effect's `pullAndMergeHistory()`) to pass keys — Task 5 defines where those keys come from, so for this task pass `localKeyRef.current` as both, which preserves today's behaviour exactly.

- [ ] **Step 5: Run tests, add to the suite, commit**

Add ` tests/migration.test.ts` to `test:offline`.

Run: `node --import tsx --test tests/migration.test.ts` → PASS (6/6). Then `npm run test:offline` → all green, and `npm run build` → exits 0.

```bash
git add src/vault.ts src/history.ts src/App.tsx tests/migration.test.ts package.json
git commit -m "Tag blobs with the key that opens them"
```

---

## Task 5: Setup and migration orchestration

**Goal:** A single client-side routine that provisions a DEK plus recovery code for an account that lacks one, migrates any v1 blobs to v2, and is safe to interrupt and re-run.

**Files:**
- Modify: `src/recovery.ts` (transport + orchestration)
- Modify: `src/App.tsx` (hold the DEK key; run setup and self-heal at the right moments)

**Context you need:** `src/App.tsx:280` holds `localKeyRef` (the adopted `masterKey`); `onVaultOpened` (line ~380) applies a decrypted bundle; `collectKeyBundle()` (line 139) gathers the localStorage API keys; `syncVault` (line ~1151) reseals and PUTs. The vault effect around line 449 already branches on `auth.user?.provider === 'local' && localKeyRef.current`. `handleAuthSubmit` adopts the key at line 1100.

**Acceptance Criteria:**
- [ ] `fetchDek()` / `saveDek(byPassword, byRecovery)` wrap the endpoint with the same `credentials: 'same-origin'` and null-on-401 conventions as `fetchVault`/`saveVault`
- [ ] `setupRecovery(username, masterKey)` generates DEK + code, **writes the DEK record before re-encrypting anything**, then migrates blobs, and returns the code
- [ ] `ensureMigrated(...)` re-encrypts any still-v1 blob to v2 and is a no-op when everything is already v2
- [ ] Running setup twice does not orphan data — the second run reuses the stored DEK rather than minting a new one
- [ ] `recoveryStatus` reports `none | incomplete | ready`, where `incomplete` means a DEK record exists but some blob is still v1
- [ ] The app holds the unwrapped DEK for the session and uses it for all new writes

**Verify:** `npm run build` → exits 0; manual browser check in Task 6 once UI exists.

**Steps:**

- [ ] **Step 1: Add transport and orchestration to `src/recovery.ts`**

```ts
import { sealJson, openBlob, fetchVault, saveVault, BLOB_VERSION_DEK, type VaultBlob, type BlobKeys, type KeyBundle } from './vault'
import { fetchHistoryBlob, pushHistory, listEntries } from './history'

export interface DekRecord {
  byPassword: VaultBlob
  byRecovery: VaultBlob
}

export async function fetchDek(): Promise<DekRecord | null> {
  const res = await fetch('/api/dek', { credentials: 'same-origin' }).catch(() => null)
  if (!res || !res.ok) return null
  const data = await res.json().catch(() => null)
  return data?.dek ?? null
}

export async function saveDek(record: DekRecord): Promise<void> {
  const res = await fetch('/api/dek', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(record),
  })
  if (!res.ok) throw new Error('dek-save-failed')
}

export type RecoveryStatus = 'none' | 'incomplete' | 'ready'

/**
 * Re-encrypt anything still sealed under masterKey so it is sealed under the
 * DEK instead. Idempotent by construction: a blob already tagged v2 is skipped,
 * so an interrupted run simply finishes on the next sign-in.
 *
 * Called only while signed in, which is the one moment BOTH keys exist — that
 * is what makes this safe to leave half-done.
 */
export async function ensureMigrated(keys: Required<BlobKeys>): Promise<void> {
  const vaultBlob = await fetchVault()
  if (vaultBlob && vaultBlob.version !== BLOB_VERSION_DEK) {
    const bundle = await openBlob<KeyBundle>(keys, vaultBlob)
    await saveVault(await sealJson(keys.dekKey, bundle, BLOB_VERSION_DEK))
  }

  const historyBlob = await fetchHistoryBlob()
  if (historyBlob && historyBlob.version !== BLOB_VERSION_DEK) {
    const remote = await openBlob<{ v: number; entries: unknown[] }>(keys, historyBlob)
    const entries = Array.isArray(remote?.entries) ? remote.entries : []
    await pushHistory(entries as never, keys.dekKey)
  }
}

/** True when every server-side blob is already DEK-sealed. */
export async function isFullyMigrated(): Promise<boolean> {
  const [vaultBlob, historyBlob] = await Promise.all([fetchVault(), fetchHistoryBlob()])
  const ok = (b: VaultBlob | null) => !b || b.version === BLOB_VERSION_DEK
  return ok(vaultBlob) && ok(historyBlob)
}

export interface SetupResult {
  code: string
  dekKey: CryptoKey
}

/**
 * Provision recovery for an account that has none, or finish a provisioning
 * that was interrupted.
 *
 * Write order is the safety property: the DEK record lands BEFORE any blob is
 * re-encrypted. Reversed, an interruption would leave blobs sealed under a DEK
 * that was never stored — unrecoverable, and the worst outcome this feature
 * can produce. In this order the only failure mode is "not finished yet".
 */
export async function setupRecovery(username: string, masterKey: CryptoKey): Promise<SetupResult> {
  const existing = await fetchDek()

  // Reuse the stored DEK if one exists. Minting a fresh one here would orphan
  // every blob already sealed under the old one.
  const dek = existing
    ? await unwrapDek(masterKey, existing.byPassword)
    : generateDek()

  const code = generateRecoveryCode()
  const { recoveryKeyBytes, recoveryAuth } = await deriveRecoveryCredentials(username, code)
  const recoveryWrapKey = await importWrappingKey(recoveryKeyBytes)

  await saveDek({
    byPassword: await wrapDek(masterKey, dek),
    byRecovery: await wrapDek(recoveryWrapKey, dek),
  })
  await registerRecoveryAuth(recoveryAuth)

  const dekKey = await importWrappingKey(dek)
  await ensureMigrated({ masterKey, dekKey })
  return { code, dekKey }
}

/** Store the verifier for a freshly-minted code on an account already signed in. */
async function registerRecoveryAuth(recoveryAuth: string): Promise<void> {
  const res = await fetch('/api/auth/recover/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ recoveryAuth }),
  })
  if (!res.ok) throw new Error('recovery-register-failed')
}
```

- [ ] **Step 2: Add the register endpoint**

`setupRecovery` needs to store a verifier for a signed-in user, which neither `begin` nor `complete` does. Create `functions/api/auth/recover/register.js`:

```js
// Store (or replace) the recovery verifier for the CURRENTLY SIGNED-IN user.
// Session-authenticated, so it needs no recoveryAuth of its own — the caller
// has already proven who they are with a password. This is what "generate a
// new code" calls, and what first-time setup calls.
import { getSession, jsonResponse, requireAccounts, recoveryKey } from '../../../_lib/session.js'
import { fromBase64, hashAuth } from '../../../_lib/password.js'
import { isSameOriginBrowserRequest } from '../../../_lib/gate.js'
import { overDurableBrake } from '../../../_lib/ratelimit.js'

export async function onRequestPost({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured
  if (!isSameOriginBrowserRequest(request)) {
    return jsonResponse({ error: 'This endpoint only serves the Rebuttal Generator app.' }, 403)
  }
  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)
  if (session.user?.provider !== 'local') {
    return jsonResponse({ error: 'Recovery codes apply to password accounts only.' }, 400)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON.' }, 400)
  }
  const recoveryAuth = fromBase64(body?.recoveryAuth)
  if (!recoveryAuth || recoveryAuth.length !== 32) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  if (await overDurableBrake(env, request, { name: 'recovery-register', windowMs: 600_000, max: 10, subject: session.userId })) {
    return jsonResponse({ error: 'Too many recovery-code changes in a row — wait a moment and try again.' }, 429)
  }

  await env.ACCOUNTS.put(recoveryKey(session.userId), JSON.stringify(await hashAuth(recoveryAuth)))
  return jsonResponse({ ok: true })
}
```

- [ ] **Step 3: Hold the DEK key in `src/App.tsx`**

Beside `localKeyRef` (line 280):

```ts
  const dekKeyRef = useRef<CryptoKey | null>(null)
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>('none')
```

In `handleAuthSubmit`, right after `localKeyRef.current = await adoptKey(result.masterKeyBytes)` (line 1100), unwrap the DEK when one exists and finish any interrupted migration:

```ts
      // A password account may or may not have recovery provisioned yet. If it
      // does, adopt the DEK for this session and finish any migration that was
      // interrupted last time — this is the self-heal, and it runs on every
      // sign-in because masterKey is only in hand right here.
      const dekRecord = await fetchDek()
      if (dekRecord && localKeyRef.current) {
        try {
          const dek = await unwrapDek(localKeyRef.current, dekRecord.byPassword)
          dekKeyRef.current = await importWrappingKey(dek)
          await ensureMigrated({ masterKey: localKeyRef.current, dekKey: dekKeyRef.current })
          setRecoveryStatus((await isFullyMigrated()) ? 'ready' : 'incomplete')
        } catch {
          // A DEK record this password cannot open means the account was reset
          // from another device. Leave recovery unprovisioned rather than
          // guessing; the next successful sign-in resolves it.
          setRecoveryStatus('none')
        }
      } else {
        setRecoveryStatus('none')
      }
```

Update the two history call sites to prefer the DEK key when present:

```ts
      const key = dekKeyRef.current ?? localKeyRef.current
      if (key) void pushHistory(all, key)
```
```ts
        void pullAndMergeHistory({ masterKey: localKeyRef.current ?? undefined, dekKey: dekKeyRef.current ?? undefined })
```

And in `handleSignOut` (line ~1133), clear it alongside `localKeyRef`:

```ts
    dekKeyRef.current = null
    setRecoveryStatus('none')
```

- [ ] **Step 3b: Make `syncVault` write under the DEK once one exists**

This step is easy to miss and silently undoes the migration. `syncVault` (line ~1151) currently reseals with the *device* key, which for a password account is `masterKey`, and `sealJson`'s default tag is v1. Left alone, the first API-key change after migration would overwrite the v2 vault with a v1 blob — and after a later reset, that blob would be unopenable.

Replace the reseal-and-save body so the DEK wins whenever it is present:

```ts
    const bundle = collectKeyBundle()
    // Prefer the DEK: after migration it is the only key that must be able to
    // open this blob, because a reset replaces masterKey and keeps the DEK.
    // Falling back to the device key covers accounts with no recovery yet.
    const sealed = dekKeyRef.current
      ? await sealJson(dekKeyRef.current, bundle, BLOB_VERSION_DEK)
      : await resealWithDeviceKey(bundle, vaultBlob)
    if (!sealed) return
    await saveVault(sealed)
    setVaultBlob(sealed)
```

Likewise, wherever the vault is *read* after sign-in (the effect around line 449, which currently calls `unlockWithKey(blob, localKeyRef.current)`), route through the tag instead:

```ts
          bundle = await openBlob<KeyBundle>(
            { masterKey: localKeyRef.current ?? undefined, dekKey: dekKeyRef.current ?? undefined },
            blob
          )
```

- [ ] **Step 4: Verify and commit**

Run: `npm run build` → exits 0. `npm run test:offline` → all green.

```bash
git add src/recovery.ts src/App.tsx functions/api/auth/recover/register.js
git commit -m "Provision and migrate recovery material, DEK record first"
```

---

## Task 6: Recovery setup UI and strings

**Goal:** New accounts are offered a code at sign-up, existing accounts get the dismissible prompt, and the account area always offers "Generate a new code."

**Files:**
- Create: `src/RecoveryDialog.tsx`
- Modify: `src/App.tsx`, `src/AccountBar.tsx`, `src/index.css`
- Modify: all 12 `src/i18n/locales/*.ts`

**Context you need:** `src/AccountBar.tsx` renders the signed-in cluster around line 74 (`{auth.user ? ...}`) — the vault status lives there (`🔓 Keys synced` at line 81) and the recovery status line goes beside it. `AuthDialog` in the same file is the pattern for a modal. i18n: add each key to `src/i18n/locales/en.ts` (the source of truth) plus the 11 translations; a key present only in English still renders in English everywhere, so a missed translation degrades rather than breaks.

**Acceptance Criteria:**
- [ ] After sign-up, the code is displayed once with a copy button and an explicit "I've saved this" confirmation before the dialog can close
- [ ] Existing accounts with `recoveryStatus === 'none'` see a dismissible prompt once per sign-in; dismissing it leaves a persistent "Set up recovery" link in the account area
- [ ] The account area shows recovery state: not set up / finishing / ready, plus "Generate a new code"
- [ ] Copy leads with "you can generate a new code any time while signed in" and states plainly that losing both password and code is unrecoverable
- [ ] Generating a new code while signed in replaces the old one and the old one stops working
- [ ] All new strings resolve in all 12 locales

**Verify:** `npm run build`; then with `npx wrangler pages dev dist`, register a new account and confirm the code appears, copies, and the account area reports "ready".

**Steps:**

- [ ] **Step 1: The dialog component**

`src/RecoveryDialog.tsx`:

```tsx
import { useState } from 'react'
import type { TFunction } from './i18n'

interface Props {
  t: TFunction
  code: string
  busy: boolean
  onDone: () => void
}

/**
 * Shows a recovery code exactly once. The confirmation is a checkbox rather
 * than a re-entry challenge: re-entry is friction at the moment someone is
 * trying to start, and buys little when people paste from the clipboard they
 * just copied to.
 */
export default function RecoveryDialog({ t, code, busy, onDone }: Props) {
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false) // clipboard denied — the code is on screen to copy by hand
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
      <div className="dialog recovery-dialog">
        <h2 id="recovery-title">{t('recovery.title')}</h2>
        <p className="key-help">{t('recovery.blurb')}</p>

        <output className="recovery-code">{code}</output>

        <button className="button button-secondary" onClick={copy} disabled={busy}>
          {copied ? t('recovery.copied') : t('recovery.copy')}
        </button>

        <p className="recovery-warning">⚠️ {t('recovery.warning')}</p>
        <p className="key-help">{t('recovery.regenerateHint')}</p>

        <label className="recovery-confirm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          {t('recovery.confirm')}
        </label>

        <button className="button button-primary" onClick={onDone} disabled={!confirmed || busy}>
          {t('recovery.done')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `src/App.tsx`**

```ts
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryPromptDismissed, setRecoveryPromptDismissed] = useState(false)

  const runRecoverySetup = async () => {
    if (!auth.user || auth.user.provider !== 'local' || !localKeyRef.current) return
    setRecoveryBusy(true)
    try {
      const { code, dekKey } = await setupRecovery(auth.user.name, localKeyRef.current)
      dekKeyRef.current = dekKey
      setRecoveryStatus((await isFullyMigrated()) ? 'ready' : 'incomplete')
      // Display only after every write has landed — a code shown before the
      // verifier is stored would not open anything.
      setRecoveryCode(code)
    } catch {
      setError(t('recovery.setupFailed'))
    } finally {
      setRecoveryBusy(false)
    }
  }
```

Render, near the other dialogs (around line 1361):

```tsx
      {recoveryCode && (
        <RecoveryDialog t={t} code={recoveryCode} busy={recoveryBusy} onDone={() => setRecoveryCode(null)} />
      )}

      {auth.user?.provider === 'local' && recoveryStatus === 'none' && !recoveryPromptDismissed && !recoveryCode && (
        <div className="recovery-prompt" role="status">
          <p>{t('recovery.promptBody')}</p>
          <button className="button button-primary" onClick={runRecoverySetup} disabled={recoveryBusy}>
            {recoveryBusy ? t('recovery.working') : t('recovery.promptAction')}
          </button>
          <button className="link-button" onClick={() => setRecoveryPromptDismissed(true)}>
            {t('recovery.promptDismiss')}
          </button>
        </div>
      )}
```

Pass `recoveryStatus` and `onSetupRecovery={runRecoverySetup}` into `<AccountBar …>` (line ~985) and render a status line beside the vault indicator in `src/AccountBar.tsx`:

```tsx
          {auth.user.provider === 'local' && (
            <button className="link-button recovery-status" onClick={onSetupRecovery}>
              {recoveryStatus === 'ready'
                ? t('recovery.statusReady')
                : recoveryStatus === 'incomplete'
                  ? t('recovery.statusFinishing')
                  : t('recovery.statusNone')}
            </button>
          )}
```

- [ ] **Step 3: Styles in `src/index.css`**

```css
.recovery-dialog { max-width: 34rem; }

.recovery-code {
  display: block;
  margin: 16px 0;
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.25);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.15rem;
  letter-spacing: 0.08em;
  text-align: center;
  user-select: all; /* one tap selects the whole code */
  overflow-wrap: anywhere;
}

.recovery-warning { font-size: 0.85rem; margin: 12px 0 0; }
.recovery-confirm { display: flex; gap: 8px; align-items: flex-start; margin: 14px 0; font-size: 0.9rem; text-align: start; }

.recovery-prompt {
  margin-top: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.recovery-status { font-size: 0.85rem; opacity: 0.85; }
```

- [ ] **Step 4: Strings — `src/i18n/locales/en.ts`, then the 11 translations**

```ts
  // --- recovery ---
  'recovery.title': 'Your recovery code',
  'recovery.blurb': 'This code is the only way back into your saved keys and history if you forget your password. Save it somewhere you can find later — a password manager, or on paper.',
  'recovery.copy': 'Copy code',
  'recovery.copied': 'Copied',
  'recovery.warning': 'If you lose both your password and this code, your saved API keys and history cannot be recovered — not by us, not by anyone.',
  'recovery.regenerateHint': 'You can generate a new code any time while you are signed in. You will not be able to see this one again.',
  'recovery.confirm': 'I have saved this code somewhere safe',
  'recovery.done': 'Done',
  'recovery.working': 'Setting up…',
  'recovery.setupFailed': 'Could not set up recovery just now. Please try again.',
  'recovery.promptBody': 'You have no recovery code yet. Without one, forgetting your password means permanently losing your saved keys and history.',
  'recovery.promptAction': 'Set up recovery',
  'recovery.promptDismiss': 'Not now',
  'recovery.statusNone': 'Set up recovery',
  'recovery.statusFinishing': 'Finishing recovery setup…',
  'recovery.statusReady': 'Recovery ready · new code',
  'recovery.resetTitle': 'Reset your password',
  'recovery.resetIntro': 'Enter your username and the recovery code you saved.',
  'recovery.codeLabel': 'Recovery code',
  'recovery.newPassword': 'New password',
  'recovery.resetAction': 'Reset password',
  'recovery.resetFailed': 'That username and recovery code did not match.',
  'recovery.resetBlocked': 'Recovery setup has not finished on this account yet. Sign in with your password once to finish it.',
  'recovery.forgot': 'Forgot your password?',
```

Add all 24 keys to each of `es, fr, de, pt-BR, it, ja, ko, zh-Hans, ar, hi, el`, keeping any placeholders verbatim.

- [ ] **Step 5: Verify and commit**

`npm run build`; `npx wrangler pages dev dist`; register a fresh account and confirm the code shows, copies, the checkbox gates the Done button, and the account bar then reads "Recovery ready".

```bash
git add src/RecoveryDialog.tsx src/App.tsx src/AccountBar.tsx src/index.css src/i18n/locales/
git commit -m "Add recovery setup UI, prompt and strings"
```

---

## Task 7: The reset flow UI

**Goal:** A signed-out user with a recovery code can set a new password and keep everything.

**Files:**
- Modify: `src/account.ts` (reset transport, error types)
- Modify: `src/RecoveryDialog.tsx` (add the reset flow)
- Modify: `src/AccountBar.tsx` (the "Forgot your password?" link)
- Modify: `src/App.tsx`

**Acceptance Criteria:**
- [ ] "Forgot your password?" on the sign-in dialog opens the reset flow
- [ ] Step 1 (username + code) surfaces one message for wrong code and unknown username
- [ ] Step 2 enforces `PASSWORD_MIN_LENGTH`
- [ ] On success the user is signed in, the vault and history still open, and the new code is displayed once
- [ ] If `begin` succeeds but the account is not fully migrated, the flow stops with `recovery.resetBlocked` and changes nothing
- [ ] A failed reset leaves the old password working

**Verify:** browser walkthrough in Step 4.

**Steps:**

- [ ] **Step 1: Transport in `src/account.ts`**

```ts
export class RecoveryBlockedError extends AccountError {
  constructor() {
    super('recovery-blocked')
  }
}

/** Step one: prove the code and receive the DEK copy it opens. */
export async function recoverBegin(username: string, recoveryAuth: string): Promise<VaultBlob> {
  const response = await fetch('/api/auth/recover/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username: normalizeUsername(username), recoveryAuth }),
  })
  const data = await response.json().catch(() => null)
  if (response.ok && data?.byRecovery) return data.byRecovery as VaultBlob
  if (response.status === 429) throw new RateLimitedError()
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
  throw new BadCredentialsError()
}
```

- [ ] **Step 2: The orchestration in `src/recovery.ts`**

```ts
/**
 * Run a full reset. Everything up to recoverComplete() is local computation —
 * nothing about the account changes until that call returns, which is why a
 * failure anywhere before it leaves the old password working.
 *
 * The rotated code is returned, never displayed by this function: the caller
 * shows it only after this resolves, because until complete() succeeds the OLD
 * code is still the one that works.
 */
export async function runReset(username: string, code: string, newPassword: string): Promise<string> {
  const { recoveryKeyBytes, recoveryAuth } = await deriveRecoveryCredentials(username, code)
  const recoveryWrapKey = await importWrappingKey(recoveryKeyBytes)

  const byRecovery = await recoverBegin(username, recoveryAuth)
  const dek = await unwrapDek(recoveryWrapKey, byRecovery) // throws on a bad code

  const { masterKeyBytes, authHash } = await deriveCredentials(username, newPassword)
  const newMasterKey = await importWrappingKey(masterKeyBytes)

  const nextCode = generateRecoveryCode()
  const next = await deriveRecoveryCredentials(username, nextCode)
  const nextWrapKey = await importWrappingKey(next.recoveryKeyBytes)

  await recoverComplete({
    username,
    recoveryAuth,
    authHash,
    recoveryAuthNext: next.recoveryAuth,
    dek: {
      byPassword: await wrapDek(newMasterKey, dek),
      byRecovery: await wrapDek(nextWrapKey, dek),
    },
  })
  return nextCode
}
```

- [ ] **Step 3: The three-step UI**

Extend `src/RecoveryDialog.tsx` with a `mode` prop (`'show' | 'reset'`). In reset mode render username + code fields, then a new-password field, calling `runReset`; on success call `loginLocal(username, newPassword)` to sign in, then display the returned code through the existing show mode. Guard before starting:

```tsx
    // The account must be fully migrated or a reset would strand a v1 blob
    // behind the password it is about to replace.
    if (!(await isFullyMigrated())) {
      setLocalError(t('recovery.resetBlocked'))
      return
    }
```

Add the entry point to `AuthDialog` in `src/AccountBar.tsx`, visible only in `signin` mode with no `fixedUsername`:

```tsx
        {mode === 'signin' && !fixedUsername && (
          <button className="link-button" onClick={onForgotPassword}>
            {t('recovery.forgot')}
          </button>
        )}
```

- [ ] **Step 4: Verify and commit**

`npm run build`; then in the browser: register an account, save an API key, note the code, sign out, use "Forgot your password?" with the code, set a new password → you land signed in, the saved key is still there, and a new code is shown. Repeat with a wrong code → one generic error, old password still works.

```bash
git add src/account.ts src/recovery.ts src/RecoveryDialog.tsx src/AccountBar.tsx src/App.tsx
git commit -m "Add the recovery-code reset flow"
```

---

## Task 8: Ship

**Goal:** Documented, deployed, and verified in production.

**Files:**
- Modify: `README.md`, `PROJECT_SUMMARY.md`, `DEPLOYMENT_GUIDE.md`
- Modify: `docs/superpowers/plans/2026-08-13-password-recovery.md.tasks.json` (mark complete)

**Acceptance Criteria:**
- [ ] README's account section explains recovery codes and states the both-lost case plainly
- [ ] The sign-up copy that currently warns "there is no password reset" is corrected
- [ ] DEPLOYMENT_GUIDE lists the new KV key prefixes (`dek:`, `recovery:`) beside the existing ones
- [ ] `npm run test:offline` green; `npm run build` green
- [ ] Deployed, and `wrangler pages deployment list` shows the intended commit newest
- [ ] Production probes pass without creating junk accounts

**Verify:** the curl checks in Step 3.

**Steps:**

- [ ] **Step 1: Docs**

README: describe the recovery code under accounts — what it is, that it is shown once, that a new one can be generated any time while signed in, and that losing both it and the password is unrecoverable by anyone. Find and fix the sign-up warning that says no reset exists. Add `dek:<id>` and `recovery:<id>` to the key-prefix list in `wrangler.toml`'s ACCOUNTS comment and in DEPLOYMENT_GUIDE's write-budget section (both are new writers against the shared budget, both braked).

- [ ] **Step 2: Deploy**

```bash
npm run build
```

```bash
npx wrangler pages deploy dist --project-name=m36x-rebuttal --branch=main
```

Then confirm the newest deployment is this commit:

```bash
npx wrangler pages deployment list --project-name=m36x-rebuttal
```

- [ ] **Step 3: Production probes** (none of these create accounts)

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://rebut.m36x.com/api/auth/recover/begin -H "Content-Type: application/json" -d "{\"username\":\"probe\",\"recoveryAuth\":\"x\"}"
```
Expected: `403` — the same-origin gate, before anything else.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://rebut.m36x.com/api/auth/recover/begin -H "Content-Type: application/json" -H "Origin: https://rebut.m36x.com" -d "{\"username\":\"probe\",\"recoveryAuth\":\"x\"}"
```
Expected: `400` — malformed `recoveryAuth`, no account touched.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://rebut.m36x.com/api/dek
```
Expected: `401` — signed out.

- [ ] **Step 4: Live walkthrough** (user-performed)

Sign in to the existing account → the prompt appears → set up recovery → confirm the account bar reads "Recovery ready" → sign out → reset with the code → confirm the saved API key and history survive and a new code is issued. Then confirm the *old* code no longer works.

- [ ] **Step 5: Commit and push**

```bash
git add README.md PROJECT_SUMMARY.md DEPLOYMENT_GUIDE.md wrangler.toml docs/superpowers/plans/
git commit -m "Ship password recovery: docs, deploy and production verification"
git push
```

---

## Execution order

```
Task 1 (recovery crypto) ─┐
Task 2 (dek endpoint) ────┼─→ Task 3 (reset endpoints) ─┐
                          └─→ Task 4 (version tags) ────┼─→ Task 5 (orchestration) ─→ Task 6 (setup UI) ─→ Task 7 (reset UI) ─→ Task 8 (ship)
```

Tasks 1, 2 and 4 are independent of each other. Task 5 needs 1, 2 and 4; Task 7 needs 3 and 5.




