// Direct-import tests for functions/api/auth/register.js and login.js,
// covering things the HTTP-level suite (tests/auth-endpoints.test.mjs)
// cannot reach cleanly: actually tripping a brake (doing that against the
// live `wrangler pages dev` process would corrupt every other assertion in
// that suite for the rest of its run — see AUTH_TEST_BYPASS_RATE_LIMIT there)
// and measuring timing (HTTP + a real dev server adds noise the property
// being checked doesn't need). It also carries a few narrow regression
// guards (a homoglyph username, a config-leak check) that don't need a live
// server either.
//
// No wrangler dev server is required to run this file — same approach as
// tests/generate.unit.test.mjs: call onRequestPost() directly with a
// hand-built Request and a minimal in-memory KV standing in for ACCOUNTS.
//
// Each test that needs a real (untripped) brake imports its target module
// fresh, with a unique cache-busting query string. register.js/login.js each
// construct their flood-brake closure once, at module load — reusing one
// import across tests would let one test's brake-tripping bleed into the
// next (or into the timing test, which needs many real, non-429 attempts).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { hashAuth } from '../functions/_lib/password.js'
import { createSession, passwordKey, upsertUser } from '../functions/_lib/session.js'
import { onRequestGet as metricsGet } from '../functions/api/metrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ORIGIN = 'http://localhost'

function makeRequest(path, body) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Minimal in-memory stand-in for the ACCOUNTS KV binding — get/put/delete is all these modules use. */
function fakeAccounts() {
  const store = new Map()
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null
    },
    async put(key, value) {
      store.set(key, value)
    },
    async delete(key) {
      store.delete(key)
    },
  }
}

const authHashBytes = (seed) => new Uint8Array(32).fill(seed)
const authHashB64 = (seed) => Buffer.from(authHashBytes(seed)).toString('base64')

let importCounter = 0
/** A fresh module instance — and therefore a fresh, untripped flood-brake closure — every call. */
function freshImport(relativePath) {
  importCounter += 1
  return import(`${relativePath}?case=${importCounter}-${Date.now()}`)
}

test('register: the brake trips at exactly the 6th request (max is 5) and answers with code "rate-limited"', async () => {
  const { onRequestPost } = await freshImport('../functions/api/auth/register.js')
  const env = { ACCOUNTS: fakeAccounts() }
  for (let i = 0; i < 6; i++) {
    const res = await onRequestPost({
      request: makeRequest('/api/auth/register', { username: `regbrake${i}`, authHash: authHashB64(1) }),
      env,
    })
    if (i === 5) {
      // Pinning the boundary, not just "a 429 showed up somewhere": calls
      // 1-5 (i=0..4) are within the cap and must NOT be 429 (asserted in the
      // else branch below); call 6 (i=5) is the first that can be. A brake
      // whose comparison drifted from `>` to `>=` (tripping one call early)
      // would still satisfy a bare assert.ok(limited) — it would not
      // satisfy this.
      assert.equal(res.status, 429, 'the 6th request must be the first to trip the brake (max is 5)')
      assert.equal((await res.json()).code, 'rate-limited')
    } else {
      assert.notEqual(res.status, 429, `request ${i + 1} of 6 must not be rate-limited yet (max is 5)`)
    }
  }
})

test('login: the brake trips at exactly the 6th request (max is 5) and answers with code "rate-limited"', async () => {
  const { onRequestPost } = await freshImport('../functions/api/auth/login.js')
  const env = { ACCOUNTS: fakeAccounts() }
  for (let i = 0; i < 6; i++) {
    const res = await onRequestPost({
      request: makeRequest('/api/auth/login', { username: 'nobody', authHash: authHashB64(1) }),
      env,
    })
    if (i === 5) {
      assert.equal(res.status, 429, 'the 6th request must be the first to trip the brake (max is 5)')
      assert.equal((await res.json()).code, 'rate-limited')
    } else {
      assert.notEqual(res.status, 429, `request ${i + 1} of 6 must not be rate-limited yet (max is 5)`)
    }
  }
})

// register.js has this test (tests/auth-endpoints.test.mjs, "cross-site
// registration is refused"); login.js did not. Both call the identical
// isSameOriginBrowserRequest() gate, so this is not testing the gate itself
// (that's gate.js's own concern) — it's testing that login.js still makes
// the call. A future refactor that drops the check from one of the two
// files (a copy-paste edit, an "obviously equivalent" cleanup) would read
// as safe as long as only register.js was exercised.
test('login is refused cross-site', async () => {
  const { onRequestPost } = await freshImport('../functions/api/auth/login.js')
  const env = { ACCOUNTS: fakeAccounts() }
  const res = await onRequestPost({
    request: new Request(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // no Origin, no Sec-Fetch-Site, no Referer
      body: JSON.stringify({ username: 'whoever', authHash: authHashB64(1) }),
    }),
    env,
  })
  assert.equal(res.status, 403)
})

// M-1 regression guard. Verified directly (node -e) before writing this:
// /^[a-z0-9_-]{3,32}$/i.test('Kelvin') is false (rejects — correct);
// /^[a-z0-9_-]{3,32}$/iu.test('Kelvin') is true (accepts — the hole
// this test exists to keep closed). See the comment on USERNAME_PATTERN in
// register.js: adding the `u` flag reads as an unrelated, harmless
// modernization anywhere else in this codebase's style, and it is the one
// change that silently reopens this specific homoglyph hole.
test('register rejects a KELVIN SIGN (U+212A) homoglyph username', async () => {
  const { onRequestPost } = await freshImport('../functions/api/auth/register.js')
  const env = { ACCOUNTS: fakeAccounts() }
  const kelvinName = 'K' + 'elvin' + Date.now().toString(36) // renders as "Kelvin...", but that first char is U+212A KELVIN SIGN, not ASCII 'K'
  const res = await onRequestPost({
    request: makeRequest('/api/auth/register', { username: kelvinName, authHash: authHashB64(1) }),
    env,
  })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).code, 'username-invalid')
})

// G: AUTH_TEST_BYPASS_RATE_LIMIT is only meant to exist in a gitignored,
// per-machine .dev.vars file (see .dev.vars.example). Unlike
// INSTANT_TEST_ECHO — whose leak would be obvious (free traffic, no
// spend) — this seam's production failure mode is silent: the brakes would
// just quietly stop doing anything. This is the guard against it ending up
// in the one file that also configures production.
test('AUTH_TEST_BYPASS_RATE_LIMIT never appears in wrangler.toml', () => {
  const wranglerToml = readFileSync(path.join(__dirname, '../wrangler.toml'), 'utf8')
  assert.doesNotMatch(
    wranglerToml,
    /AUTH_TEST_BYPASS_RATE_LIMIT/,
    'this test-only seam must only ever be set via a local, gitignored .dev.vars file — never in wrangler.toml'
  )
})

// I-3 regression guard: protects the oracle property at login.js's
// `if (!valid || !recordRaw) return failure()` line. This deliberately
// exercises the real endpoint (not verifyAuth() directly) so that hoisting a
// `!recordRaw` early-out above the verify — which reads as a harmless
// optimization and which auth-endpoints.test.mjs's body-comparison test would
// NOT catch — shows up here as a timing regression instead.
test('login: timing does not betray whether the username exists', async () => {
  const { onRequestPost } = await freshImport('../functions/api/auth/login.js')
  const env = { ACCOUNTS: fakeAccounts(), AUTH_TEST_BYPASS_RATE_LIMIT: '1' }

  const record = await hashAuth(authHashBytes(1))
  await env.ACCOUNTS.put(passwordKey('local:realuser'), JSON.stringify(record))
  await upsertUser(env, { provider: 'local', subject: 'realuser' })

  async function timeCall(username, seed) {
    const start = performance.now()
    const res = await onRequestPost({
      request: makeRequest('/api/auth/login', { username, authHash: authHashB64(seed) }),
      env,
    })
    // Both arms must be real 401s — a 429 or 400 sneaking in here would
    // silently corrupt the measurement (typically by looking artificially
    // fast), so fail loudly instead of averaging in garbage.
    assert.equal(res.status, 401, `expected a real credential failure for ${username}, got ${res.status}`)
    return performance.now() - start
  }

  const N = 25
  const wrongPasswordTimes = []
  const unknownUserTimes = []
  for (let i = 0; i < N; i++) {
    wrongPasswordTimes.push(await timeCall('realuser', 99))
    unknownUserTimes.push(await timeCall(`nosuchuser${i}`, 99))
  }
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  const wrongAvg = avg(wrongPasswordTimes)
  const unknownAvg = avg(unknownUserTimes)

  // Reported either way, pass or fail — useful evidence regardless of outcome.
  console.log(`[timing] wrong-password avg=${wrongAvg.toFixed(3)}ms  unknown-user avg=${unknownAvg.toFixed(3)}ms  (n=${N} each)`)

  // A wide (5x) bound on purpose: this only needs to catch the oracle coming
  // back wholesale (unknown-user skipping the PBKDF2 run entirely, which
  // measures in whole orders of magnitude — see password.js's dummyRecord()
  // docs), not to characterize the distribution precisely. If this ever
  // flakes, widen it further before deleting it — the property is real.
  assert.ok(
    unknownAvg > wrongAvg / 5,
    `unknown-user path (${unknownAvg.toFixed(3)}ms) must not be more than 5x faster than wrong-password (${wrongAvg.toFixed(3)}ms) — timing-oracle regression guard`
  )
})

// Security regression guard for the /api/metrics operator gate
// (functions/api/metrics.js). A password account's email is an unverified,
// arbitrary claim register.js accepts as-is — nothing proves the registrant
// owns it. Before the provider check, registering a local account with
// email === OPERATOR_EMAIL (public in the git log) would pass the gate's
// old `session.user?.email !== env.OPERATOR_EMAIL` check outright. Only a
// google-provider session may have earned that email through Google's
// email_verified check (google/callback.js).
function metricsRequest(sessionId) {
  return new Request('http://localhost/api/metrics', {
    headers: sessionId ? { Cookie: `rb_session=${sessionId}` } : {},
  })
}

test('metrics gate: a local account claiming the operator email is refused; a google account with it passes', async () => {
  const env = { ACCOUNTS: fakeAccounts(), OPERATOR_EMAIL: 'operator@example.com' }

  const impersonator = await upsertUser(env, {
    provider: 'local',
    subject: 'impersonator',
    email: env.OPERATOR_EMAIL,
  })
  const impersonatorSession = await createSession(env, impersonator.id)
  const impersonatorRes = await metricsGet({ request: metricsRequest(impersonatorSession), env })
  assert.equal(
    impersonatorRes.status,
    404,
    'a local (password) account claiming the operator email must be refused — this is the assertion that fails if the provider check is deleted'
  )

  const operator = await upsertUser(env, {
    provider: 'google',
    subject: 'g-operator-sub',
    email: env.OPERATOR_EMAIL,
  })
  const operatorSession = await createSession(env, operator.id)
  const operatorRes = await metricsGet({ request: metricsRequest(operatorSession), env })
  // The gate's outcome, not metrics content: no LIMITER binding in this fake
  // env, so a passed gate falls through to metrics.js's own `{ metrics: [] }`
  // default (see its `if (!env.LIMITER)` branch) — status 200 either way.
  assert.equal(operatorRes.status, 200, 'a real google-authenticated session with the operator email must pass the gate')

  // The provider check must not have become sufficient on its own: a google
  // account with a DIFFERENT email is still not the operator.
  const otherGoogleUser = await upsertUser(env, {
    provider: 'google',
    subject: 'g-someone-else',
    email: 'someone-else@example.com',
  })
  const otherSession = await createSession(env, otherGoogleUser.id)
  const otherRes = await metricsGet({ request: metricsRequest(otherSession), env })
  assert.equal(otherRes.status, 404, 'a google account with a non-matching email must still be refused')

  const anonymousRes = await metricsGet({ request: metricsRequest(null), env })
  assert.equal(anonymousRes.status, 404, 'no session at all must be refused')
})
