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
