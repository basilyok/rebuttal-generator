// The endpoints that write to Cloudflare KV share one free-plan budget of
// 1000 writes/day, and exhausting it does not degrade one feature — it breaks
// sign-in, vault sync, history sync and preferences together, because they all
// write to the same namespace. These tests pin the two properties that keep
// that from happening: every KV write sits behind a brake, and the brake is
// counted against the right identity.
//
// No Workers runtime here. `overDurableBrake` only calls `env.LIMITER.fetch`
// and `request.headers.get`, and the endpoint handlers only need `env` and a
// Request — so a plain object stands in for the Durable Object and records
// what the endpoint asked it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { overDurableBrake } from '../functions/_lib/ratelimit.js'

const fakeRequest = (ip) => ({
  headers: { get: (name) => (name === 'CF-Connecting-IP' ? ip : null) },
})

/** A LIMITER stand-in that records every key it was asked about. */
function recordingLimiter({ limited = false, status = 200, body } = {}) {
  const calls = []
  return {
    calls,
    env: {
      LIMITER: {
        async fetch(_url, init) {
          calls.push(JSON.parse(init.body))
          if (body !== undefined) return new Response(body, { status })
          return new Response(JSON.stringify({ limited }), { status })
        },
      },
    },
  }
}

test('without a subject the counter is keyed by address', async () => {
  const { env, calls } = recordingLimiter()
  await overDurableBrake(env, fakeRequest('9.9.9.9'), { name: 'share-post', windowMs: 600_000, max: 20 })
  assert.equal(calls[0].key, 'share-post:9.9.9.9')
})

test('a subject replaces the address, so CGNAT neighbours do not share a quota', async () => {
  const { env, calls } = recordingLimiter()
  // Two different accounts behind ONE address must land on different counters.
  await overDurableBrake(env, fakeRequest('1.1.1.1'), {
    name: 'vault-put',
    windowMs: 600_000,
    max: 20,
    subject: 'local:alice',
  })
  await overDurableBrake(env, fakeRequest('1.1.1.1'), {
    name: 'vault-put',
    windowMs: 600_000,
    max: 20,
    subject: 'local:bob',
  })
  assert.deepEqual(
    calls.map((c) => c.key),
    ['vault-put:local:alice', 'vault-put:local:bob']
  )
})

test('a subject also survives a change of address, so switching network sheds no quota', async () => {
  const { env, calls } = recordingLimiter()
  await overDurableBrake(env, fakeRequest('1.1.1.1'), { name: 'history-put', windowMs: 1000, max: 1, subject: 'u1' })
  await overDurableBrake(env, fakeRequest('2.2.2.2'), { name: 'history-put', windowMs: 1000, max: 1, subject: 'u1' })
  assert.deepEqual(calls.map((c) => c.key), ['history-put:u1', 'history-put:u1'])
})

test('the brake name namespaces the counters, so one endpoint cannot spend another one budget', async () => {
  const { env, calls } = recordingLimiter()
  await overDurableBrake(env, fakeRequest('3.3.3.3'), { name: 'vault-put', windowMs: 1000, max: 1, subject: 'u1' })
  await overDurableBrake(env, fakeRequest('3.3.3.3'), { name: 'history-put', windowMs: 1000, max: 1, subject: 'u1' })
  assert.notEqual(calls[0].key, calls[1].key)
})

test('a limited verdict is reported as limited', async () => {
  const { env } = recordingLimiter({ limited: true })
  assert.equal(await overDurableBrake(env, fakeRequest('4.4.4.4'), { name: 'x', windowMs: 1000, max: 1 }), true)
})

// Fail-open is the deliberate posture for every one of these endpoints: a
// limiter outage must degrade to the in-memory brakes, never escalate into
// "nobody can sign in" or "nobody can save their keys". Each failure mode
// below returns false (not limited) rather than throwing.
test('fail-open: missing binding, non-OK answer, thrown fetch, malformed JSON', async () => {
  const req = fakeRequest('5.5.5.5')
  const opts = { name: 'x', windowMs: 1000, max: 1 }

  assert.equal(await overDurableBrake({}, req, opts), false, 'no binding')

  const nonOk = recordingLimiter({ status: 500, body: 'nope' })
  assert.equal(await overDurableBrake(nonOk.env, req, opts), false, 'non-OK')

  const thrown = {
    LIMITER: {
      async fetch() {
        throw new Error('service binding down')
      },
    },
  }
  assert.equal(await overDurableBrake(thrown, req, opts), false, 'thrown fetch')

  const malformed = recordingLimiter({ body: 'not json' })
  assert.equal(await overDurableBrake(malformed.env, req, opts), false, 'malformed JSON')
})

// --- endpoint wiring -------------------------------------------------------
// The unit above proves the brake counts correctly; these prove each endpoint
// actually consults it, and — the property that matters most — that a limited
// request performs NO KV write. A brake placed after the write would pass a
// naive "returns 429" test while still burning the budget it exists to guard.

/** ACCOUNTS stand-in that fails the test if anything writes while limited. */
function accountsSpy(records = {}) {
  const writes = []
  return {
    writes,
    kv: {
      async get(key) {
        return records[key] ?? null
      },
      async put(key, value) {
        writes.push({ key, value })
      },
      async delete() {},
    },
  }
}

const SESSION_COOKIE = 'rb_session=sess1'
const sessionRecords = {
  'session:sess1': JSON.stringify({ userId: 'local:alice', createdAt: Date.now() }),
  'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local', name: 'alice', language: 'en' }),
}

const authedRequest = (url, body) =>
  new Request(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: SESSION_COOKIE, Origin: new URL(url).origin },
    body: JSON.stringify(body),
  })

const blob = { salt: 'AAAA', iv: 'BBBB', ciphertext: 'Q0NDQw==', version: 1 }

test('vault PUT: a limited request is refused and writes nothing', async () => {
  const { onRequestPut } = await import('../functions/api/vault.js')
  const spy = accountsSpy(sessionRecords)
  const limiter = recordingLimiter({ limited: true })
  const res = await onRequestPut({
    request: authedRequest('https://x.test/api/vault', blob),
    env: { ACCOUNTS: spy.kv, ...limiter.env },
  })
  assert.equal(res.status, 429)
  assert.deepEqual(spy.writes, [], 'a limited vault PUT must not reach KV')
  assert.equal(limiter.calls[0].key, 'vault-put:local:alice', 'keyed by account, not address')
})

test('vault PUT: an unlimited request still writes', async () => {
  const { onRequestPut } = await import('../functions/api/vault.js')
  const spy = accountsSpy(sessionRecords)
  const res = await onRequestPut({
    request: authedRequest('https://x.test/api/vault', blob),
    env: { ACCOUNTS: spy.kv, ...recordingLimiter({ limited: false }).env },
  })
  assert.equal(res.status, 200)
  assert.equal(spy.writes.length, 1)
  assert.equal(spy.writes[0].key, 'vault:local:alice')
})

test('vault PUT: a malformed payload is rejected BEFORE the brake, so junk cannot burn quota', async () => {
  const { onRequestPut } = await import('../functions/api/vault.js')
  const spy = accountsSpy(sessionRecords)
  const limiter = recordingLimiter({ limited: false })
  const res = await onRequestPut({
    request: authedRequest('https://x.test/api/vault', { salt: '!!not base64!!' }),
    env: { ACCOUNTS: spy.kv, ...limiter.env },
  })
  assert.equal(res.status, 400)
  assert.deepEqual(limiter.calls, [], 'validation must run before the brake')
  assert.deepEqual(spy.writes, [])
})

test('history PUT: a limited request is refused and writes nothing', async () => {
  const { onRequestPut } = await import('../functions/api/history.js')
  const spy = accountsSpy(sessionRecords)
  const limiter = recordingLimiter({ limited: true })
  const res = await onRequestPut({
    request: authedRequest('https://x.test/api/history', blob),
    env: { ACCOUNTS: spy.kv, ...limiter.env },
  })
  assert.equal(res.status, 429)
  assert.deepEqual(spy.writes, [], 'a limited history PUT must not reach KV')
  assert.equal(limiter.calls[0].key, 'history-put:local:alice')
})

test('prefs PUT: a limited request is refused and writes nothing', async () => {
  const { onRequestPut } = await import('../functions/api/prefs.js')
  const spy = accountsSpy(sessionRecords)
  const limiter = recordingLimiter({ limited: true })
  const res = await onRequestPut({
    request: authedRequest('https://x.test/api/prefs', { language: 'fr' }),
    env: { ACCOUNTS: spy.kv, ...limiter.env },
  })
  assert.equal(res.status, 429)
  assert.deepEqual(spy.writes, [], 'a limited prefs PUT must not reach KV')
  assert.equal(limiter.calls[0].key, 'prefs-put:local:alice')
})

const wrappedDek = { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'QkJCQg==', version: 1 }

test('dek PUT: a limited request is refused and writes nothing', async () => {
  const { onRequestPut } = await import('../functions/api/dek.js')
  const spy = accountsSpy(sessionRecords)
  const limiter = recordingLimiter({ limited: true })
  const res = await onRequestPut({
    request: authedRequest('https://x.test/api/dek', { byPassword: wrappedDek, byRecovery: wrappedDek }),
    env: { ACCOUNTS: spy.kv, ...limiter.env },
  })
  assert.equal(res.status, 429)
  assert.deepEqual(spy.writes, [], 'a limited dek PUT must not reach KV')
  assert.equal(limiter.calls[0].key, 'dek-put:local:alice', 'keyed by account, not address')
})

test('dek PUT: a malformed payload is rejected BEFORE the brake, so junk cannot burn quota', async () => {
  const { onRequestPut } = await import('../functions/api/dek.js')
  const spy = accountsSpy(sessionRecords)
  const limiter = recordingLimiter({ limited: false })
  const res = await onRequestPut({
    request: authedRequest('https://x.test/api/dek', { byPassword: { iv: '!!not base64!!', ciphertext: 'x' } }),
    env: { ACCOUNTS: spy.kv, ...limiter.env },
  })
  assert.equal(res.status, 400)
  // The brake must not even be CONSULTED: an implementation that asked first
  // and rejected second would still pass a writes-only assertion, while every
  // junk request spent a slot of the caller's real quota.
  assert.deepEqual(limiter.calls, [], 'validation must run before the brake')
  assert.deepEqual(spy.writes, [])
})

test('recover/register: a limited request is refused and writes nothing', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/register.js')
  const spy = accountsSpy(sessionRecords)
  const limiter = recordingLimiter({ limited: true })
  const res = await onRequestPost({
    request: new Request('https://x.test/api/auth/recover/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: SESSION_COOKIE, Origin: 'https://x.test' },
      body: JSON.stringify({ recoveryAuth: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' }),
    }),
    env: { ACCOUNTS: spy.kv, ...limiter.env },
  })
  assert.equal(res.status, 429)
  assert.deepEqual(spy.writes, [], 'a limited register must not reach KV')
  // Keyed by account, unlike begin/complete below: this endpoint has a session,
  // so keying it by address would let one user behind a shared NAT spend
  // everyone else's rotation budget.
  assert.equal(limiter.calls[0].key, 'recovery-register:local:alice')
})

// The reset endpoints are the odd pair here: begin never writes at all, and
// complete is the only endpoint in the app that writes FOUR rows in one
// request. Both share a single durable counter (functions/_lib/recoverbrake.js)
// because complete re-verifies the same recovery code begin checked, so two
// counters would hand out double the budget for guessing one code.
const RECOVERY_AUTH = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
const resetBodies = {
  begin: { username: 'alice', recoveryAuth: RECOVERY_AUTH },
  complete: {
    username: 'alice',
    recoveryAuth: RECOVERY_AUTH,
    authHash: 'ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=',
    recoveryAuthNext: 'TkVYVFJFQ09WRVJZQ09ERS0zMi1ieXRlcy1oZXJlISE=',
    dek: { byPassword: wrappedDek, byRecovery: wrappedDek },
  },
}

for (const step of ['begin', 'complete']) {
  test(`recover/${step}: a limited request is refused and writes nothing`, async () => {
    const { hashAuth, fromBase64 } = await import('../functions/_lib/password.js')
    const { onRequestPost } = await import(`../functions/api/auth/recover/${step}.js`)
    const spy = accountsSpy({
      // A real verifier, so the refusal cannot be passing for the wrong reason.
      'recovery:local:alice': JSON.stringify(await hashAuth(fromBase64(RECOVERY_AUTH))),
      'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
    })
    const limiter = recordingLimiter({ limited: true })
    const res = await onRequestPost({
      request: new Request(`https://x.test/api/auth/recover/${step}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://x.test', 'CF-Connecting-IP': '8.8.8.8' },
        body: JSON.stringify(resetBodies[step]),
      }),
      env: { ACCOUNTS: spy.kv, ...limiter.env },
    })
    assert.equal(res.status, 429)
    assert.deepEqual(spy.writes, [], `a limited recover/${step} must not reach KV`)
    // Keyed by address, not account: there is no session here, and the caller's
    // claimed username is exactly what an attacker would vary.
    assert.equal(limiter.calls[0].key, 'auth-recover:8.8.8.8')
  })
}

test('the two reset steps share one durable counter, so guessing gets one budget', async () => {
  const begin = await import('../functions/api/auth/recover/begin.js')
  const complete = await import('../functions/api/auth/recover/complete.js')
  const limiter = recordingLimiter({ limited: false })
  const spy = accountsSpy()
  for (const [mod, step] of [[begin, 'begin'], [complete, 'complete']]) {
    await mod.onRequestPost({
      request: new Request(`https://x.test/api/auth/recover/${step}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://x.test', 'CF-Connecting-IP': '6.6.6.6' },
        body: JSON.stringify(resetBodies[step]),
      }),
      env: { ACCOUNTS: spy.kv, ...limiter.env },
    })
  }
  assert.deepEqual(
    limiter.calls.map((c) => c.key),
    ['auth-recover:6.6.6.6', 'auth-recover:6.6.6.6'],
    'complete must count into the same counter begin does'
  )
  // Same window and cap on both sides too — a shared key with mismatched
  // parameters is two different limits racing over one counter.
  assert.deepEqual(limiter.calls[0], limiter.calls[1])
})

test('the shared counter is the IN-MEMORY one too, not just the durable one', async () => {
  // The distinction this pins is exactly the bug that shipped: makeFloodBrake()
  // closes over a fresh Map per call, so two endpoints each calling it get two
  // independent counters even when they agree on the durable brake's name. The
  // durable-key assertion above passes either way — only spending one
  // endpoint's budget and then hitting the OTHER endpoint can tell them apart.
  const begin = await import('../functions/api/auth/recover/begin.js')
  const complete = await import('../functions/api/auth/recover/complete.js')
  const spy = accountsSpy()
  // A fresh address: the in-memory brake is module state shared across this
  // whole file, so a reused IP would carry hits in from the tests above.
  const IP = '7.1.1.1'
  const hit = (mod, step) =>
    mod.onRequestPost({
      request: new Request(`https://x.test/api/auth/recover/${step}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://x.test', 'CF-Connecting-IP': IP },
        body: JSON.stringify(resetBodies[step]),
      }),
      env: { ACCOUNTS: spy.kv, ...recordingLimiter({ limited: false }).env },
    })

  // Spend the whole budget (8 per 10 minutes) on begin alone.
  for (let i = 0; i < 8; i++) {
    const res = await hit(begin, 'begin')
    assert.notEqual(res.status, 429, `begin attempt ${i + 1} is still inside the budget`)
  }
  const spillover = await hit(complete, 'complete')
  assert.equal(spillover.status, 429, 'complete must be refused on a budget begin already spent')
  assert.deepEqual(spy.writes, [])
})

test('OAuth start: a limited request redirects with auth_error and writes no state record', async () => {
  const { onRequestGet } = await import('../functions/api/auth/google/start.js')
  const spy = accountsSpy()
  const limiter = recordingLimiter({ limited: true })
  const res = await onRequestGet({
    request: new Request('https://x.test/api/auth/google/start', {
      headers: { 'CF-Connecting-IP': '7.7.7.7' },
    }),
    env: {
      ACCOUNTS: spy.kv,
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      ...limiter.env,
    },
  })
  assert.equal(res.status, 302)
  // A navigation, so the refusal must be a redirect the app can explain —
  // not a JSON body rendered as raw text in the user's tab.
  assert.match(res.headers.get('location'), /auth_error=rate_limited/)
  assert.deepEqual(spy.writes, [], 'a limited start must not write an oauth state record')
  assert.equal(limiter.calls[0].key, 'auth-start:7.7.7.7')
})
