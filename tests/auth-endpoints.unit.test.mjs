// Direct-import tests for functions/api/auth/register.js and login.js,
// covering two things the HTTP-level suite (tests/auth-endpoints.test.mjs)
// cannot reach cleanly: actually tripping a brake (doing that against the
// live `wrangler pages dev` process would corrupt every other assertion in
// that suite for the rest of its run — see AUTH_TEST_BYPASS_RATE_LIMIT there)
// and measuring timing (HTTP + a real dev server adds noise the property
// being checked doesn't need).
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
import { hashAuth } from '../functions/_lib/password.js'
import { passwordKey, upsertUser } from '../functions/_lib/session.js'

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

test('register: the brake trips and answers with code "rate-limited"', async () => {
  const { onRequestPost } = await freshImport('../functions/api/auth/register.js')
  const env = { ACCOUNTS: fakeAccounts() }
  let limited
  for (let i = 0; i < 8 && !limited; i++) {
    const res = await onRequestPost({
      request: makeRequest('/api/auth/register', { username: `regbrake${i}`, authHash: authHashB64(1) }),
      env,
    })
    if (res.status === 429) limited = res
  }
  assert.ok(limited, 'expected the register brake (max 5/window) to trip within 8 requests')
  const data = await limited.json()
  assert.equal(data.code, 'rate-limited')
})

test('login: the brake trips and answers with code "rate-limited"', async () => {
  const { onRequestPost } = await freshImport('../functions/api/auth/login.js')
  const env = { ACCOUNTS: fakeAccounts() }
  let limited
  for (let i = 0; i < 8 && !limited; i++) {
    const res = await onRequestPost({
      request: makeRequest('/api/auth/login', { username: 'nobody', authHash: authHashB64(1) }),
      env,
    })
    if (res.status === 429) limited = res
  }
  assert.ok(limited, 'expected the login brake (max 5/window) to trip within 8 requests')
  const data = await limited.json()
  assert.equal(data.code, 'rate-limited')
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
