// Endpoint-level tests with plain objects standing in for KV and the LIMITER.
// No Workers runtime: these handlers only touch env.ACCOUNTS, env.LIMITER and
// the Request/Response globals Node already provides.
import test from 'node:test'
import assert from 'node:assert/strict'

const ORIGIN = 'https://x.test'

/** KV stand-in that records writes in order — write ORDER will be a spec requirement, in Task 3. */
function kvSpy(seed = {}) {
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

test('GET /api/dek returns a stored record', async () => {
  const { onRequestGet } = await import('../functions/api/dek.js')
  const stored = { byPassword: wrapped, byRecovery: { ...wrapped, ciphertext: 'Q0NDQw==' }, version: 1 }
  const spy = kvSpy({ ...seedSignedIn(), 'dek:local:alice': JSON.stringify(stored) })
  const res = await onRequestGet({
    request: new Request(`${ORIGIN}/api/dek`, { headers: { Cookie: SESSION } }),
    env: { ACCOUNTS: spy.kv, ...openLimiter },
  })
  assert.equal(res.status, 200)
  const { dek } = await res.json()
  // Read-back is what migration depends on; without this a handler that
  // returned {dek:null} unconditionally would pass every other GET test here.
  assert.equal(dek.byPassword.ciphertext, wrapped.ciphertext)
  assert.equal(dek.byRecovery.ciphertext, 'Q0NDQw==')
})

test('GET /api/dek reports a corrupt record as corruption, never as absence', async () => {
  const { onRequestGet } = await import('../functions/api/dek.js')
  // Both failure shapes: bytes that will not parse, and JSON that parses into
  // something that is not a DEK. Answering {dek:null} to either would send the
  // client into first-time setup and overwrite a recoverable record.
  for (const [label, raw] of [
    ['unparseable', '{not json'],
    ['parses but is not a DEK', JSON.stringify({})],
    ['one copy missing', JSON.stringify({ byPassword: wrapped })],
  ]) {
    const spy = kvSpy({ ...seedSignedIn(), 'dek:local:alice': raw })
    const res = await onRequestGet({
      request: new Request(`${ORIGIN}/api/dek`, { headers: { Cookie: SESSION } }),
      env: { ACCOUNTS: spy.kv, ...openLimiter },
    })
    assert.equal(res.status, 500, label)
    assert.equal((await res.json()).code, 'dek-corrupt', label)
  }
})

test('GET /api/dek is 501 when ACCOUNTS is unconfigured', async () => {
  const { onRequestGet } = await import('../functions/api/dek.js')
  const res = await onRequestGet({ request: new Request(`${ORIGIN}/api/dek`), env: { ...openLimiter } })
  assert.equal(res.status, 501)
  assert.equal((await res.json()).configured, false)
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

test('PUT /api/dek stamps version 1, ignoring whatever the client claimed', async () => {
  const { onRequestPut } = await import('../functions/api/dek.js')
  const spy = kvSpy(seedSignedIn())
  await onRequestPut({
    request: new Request(`${ORIGIN}/api/dek`, {
      method: 'PUT',
      headers: { Cookie: SESSION, 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ byPassword: { ...wrapped, version: 99 }, byRecovery: { ...wrapped, version: 99 } }),
    }),
    env: { ACCOUNTS: spy.kv, ...openLimiter },
  })
  const stored = JSON.parse(spy.store['dek:local:alice'])
  // The server validated exactly one wrap format, so it labels the record with
  // that format — echoing the client's number would label it with a format
  // nothing here checked for.
  assert.equal(stored.byPassword.version, 1)
  assert.equal(stored.byRecovery.version, 1)
})

test('PUT /api/dek is 501 when ACCOUNTS is unconfigured', async () => {
  const { onRequestPut } = await import('../functions/api/dek.js')
  const res = await onRequestPut({
    request: new Request(`${ORIGIN}/api/dek`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ byPassword: wrapped, byRecovery: wrapped }),
    }),
    env: { ...openLimiter },
  })
  assert.equal(res.status, 501)
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

test('a session stamped ABOVE the user record still resolves', async () => {
  const { getSession } = await import('../functions/_lib/session.js')
  const spy = kvSpy({
    'session:new': JSON.stringify({ userId: 'local:alice', createdAt: Date.now(), credentialVersion: 2 }),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local', credentialVersion: 1 }),
  })
  const session = await getSession(new Request(`${ORIGIN}/`, { headers: { Cookie: 'rb_session=new' } }), {
    ACCOUNTS: spy.kv,
  })
  // The record went backwards (stale read or restore). Refusing a session that
  // proved a NEWER credential would lock out the person the reset was for, so
  // only `stamped < current` rejects. Pinned deliberately, not left as fallout.
  assert.equal(session?.userId, 'local:alice')
})

test('a corrupt credentialVersion on the user record fails closed', async () => {
  const { getSession } = await import('../functions/_lib/session.js')
  for (const bad of ['1', 1.5, null, {}]) {
    const spy = kvSpy({
      'session:s': JSON.stringify({ userId: 'local:alice', createdAt: Date.now(), credentialVersion: 0 }),
      'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local', credentialVersion: bad }),
    })
    const session = await getSession(new Request(`${ORIGIN}/`, { headers: { Cookie: 'rb_session=s' } }), {
      ACCOUNTS: spy.kv,
    })
    // Collapsing junk to 0 here would read as "never reset" and admit every
    // session — switching the mechanism off on exactly the account whose
    // record went bad. The session side may collapse; this side may not.
    assert.equal(session, null, `credentialVersion ${JSON.stringify(bad)} must not read as "never reset"`)
  }
})

// upsertUser rebuilds the user record from a fixed field list rather than
// merging, so every field it forgets to name is dropped on write. These two
// pin credentialVersion into that list. They must exercise the WRITE path, not
// the refreshAfterMs skip — the skip returns `{ ...existing }` and would pass
// even with the field missing from the rebuild.
test('upsertUser preserves credentialVersion across a record write', async () => {
  const { upsertUser } = await import('../functions/_lib/session.js')
  const spy = kvSpy({
    'user:local:alice': JSON.stringify({
      id: 'local:alice',
      provider: 'local',
      name: 'alice',
      credentialVersion: 3,
      lastSeenAt: Date.now(),
    }),
  })
  // No refreshAfterMs — the Google callback omits it too, so it always writes.
  const user = await upsertUser({ ACCOUNTS: spy.kv }, { provider: 'local', subject: 'alice' })
  assert.deepEqual(spy.writes, ['user:local:alice'], 'this must be the write path, not the skip path')
  assert.equal(user.credentialVersion, 3)
  assert.equal(
    JSON.parse(spy.store['user:local:alice']).credentialVersion,
    3,
    'dropping this field would silently revive every session a reset had killed'
  )
})

test('upsertUser writes credentialVersion 0 when the record has none', async () => {
  const { upsertUser } = await import('../functions/_lib/session.js')
  const spy = kvSpy({
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local', lastSeenAt: Date.now() }),
  })
  const user = await upsertUser({ ACCOUNTS: spy.kv }, { provider: 'local', subject: 'alice' })
  // Always present after a write, so getSession's comparison never meets an
  // undefined on the user side.
  assert.equal(user.credentialVersion, 0)
  assert.equal(JSON.parse(spy.store['user:local:alice']).credentialVersion, 0)
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
