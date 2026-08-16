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
