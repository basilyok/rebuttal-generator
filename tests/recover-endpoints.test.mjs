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

// --- reset endpoints -------------------------------------------------------
// Reusing kvSpy from above; `writes` records key order, which the write-order
// test depends on.

const RECOVERY_AUTH = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
const NEW_AUTH_HASH = 'ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA='
const NEXT_RECOVERY_AUTH = 'TkVYVFJFQ09WRVJZQ09ERS0zMi1ieXRlcy1oZXJlISE='
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

const completeBody = (overrides = {}) => ({
  username: 'alice',
  recoveryAuth: RECOVERY_AUTH,
  authHash: NEW_AUTH_HASH,
  recoveryAuthNext: NEXT_RECOVERY_AUTH,
  dek: { byPassword: wrappedTwo, byRecovery: wrappedTwo },
  ...overrides,
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
  // Proving possession of the code must not also hand over the password-wrapped
  // copy: that copy is the one an offline password guess would target.
  assert.equal(data.byPassword, undefined)
  assert.deepEqual(spy.writes, [], 'begin is a read-only endpoint')
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

/**
 * Count the PBKDF2 derivations one request performs.
 *
 * The body-only comparison above cannot see an early `if (!recordRaw) return
 * failure()` hoisted above verifyAuth — the refactor looks harmless and
 * silently restores a username-by-timing oracle, which is a property no
 * response body can express. Counting derivations is what catches it.
 *
 * Two caveats worth knowing before trusting or moving this:
 *  - It patches a GLOBAL, `crypto.subtle.deriveBits`. Node's test runner is
 *    serial by default; the day anyone turns on concurrency within a file,
 *    this goes flaky and the fix is a per-request injection seam, not a retry.
 *  - It counts deriveBits, not importKey. pbkdf2() in _lib/password.js calls
 *    both, once each; deriveBits is the one that carries the cost, so if that
 *    pairing ever changes this is measuring the wrong call.
 */
async function countDerivations(run) {
  const realDeriveBits = crypto.subtle.deriveBits.bind(crypto.subtle)
  let derivations = 0
  crypto.subtle.deriveBits = (...args) => {
    derivations += 1
    return realDeriveBits(...args)
  }
  try {
    await run()
  } finally {
    crypto.subtle.deriveBits = realDeriveBits
  }
  return derivations
}

// The property is EQUALITY between the two failure paths, not a magic number on
// one of them: a hoisted early return makes the miss path cheaper than the
// wrong-code path, and only a comparison sees that.
for (const step of ['begin', 'complete']) {
  test(`${step}: an unknown username costs exactly as many derivations as a wrong code`, async () => {
    const { onRequestPost } = await import(`../functions/api/auth/recover/${step}.js`)
    const bodyFor = (username, code) =>
      step === 'begin'
        ? { username, recoveryAuth: code }
        : completeBody({ username, recoveryAuth: code })

    const seeded = {
      'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
      'dek:local:alice': JSON.stringify({ byPassword: wrappedTwo, byRecovery: wrappedTwo, version: 1 }),
      'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
    }
    const call = (seed, body) =>
      onRequestPost({
        request: post(`${ORIGIN}/api/auth/recover/${step}`, body),
        env: { ACCOUNTS: kvSpy(seed).kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
      })

    const wrongCode = await countDerivations(() => call(seeded, bodyFor('alice', NEW_AUTH_HASH)))
    const unknownUser = await countDerivations(() => call({}, bodyFor('nobody', RECOVERY_AUTH)))

    assert.equal(wrongCode, 1, 'a wrong code costs one verify')
    assert.equal(
      unknownUser,
      wrongCode,
      'the miss path must verify against dummyRecord(), not return early — an unknown username that ' +
        'answers with less work is a username oracle by response time'
    )
  })
}

test('begin: a verified code with no usable dek record fails like any other miss', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/begin.js')
  // The one 401 begin's own comment calls out and nothing asserted. Answering
  // anything more specific here would say "this username exists and its code
  // is correct" to a caller who cannot be given the record anyway.
  const reference = kvSpy()
  const miss = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/begin`, { username: 'nobody', recoveryAuth: RECOVERY_AUTH }),
    env: { ACCOUNTS: reference.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  const missBody = await miss.json()

  for (const [label, raw] of [
    ['no dek record at all', null],
    ['unparseable', '{not json'],
    ['parses but holds no byRecovery', JSON.stringify({ byPassword: wrappedTwo })],
  ]) {
    const seed = { 'recovery:local:alice': JSON.stringify(await realRecoveryRecord()) }
    if (raw !== null) seed['dek:local:alice'] = raw
    const spy = kvSpy(seed)
    const res = await onRequestPost({
      request: post(`${ORIGIN}/api/auth/recover/begin`, { username: 'alice', recoveryAuth: RECOVERY_AUTH }),
      env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
    })
    assert.equal(res.status, 401, label)
    assert.deepEqual(await res.json(), missBody, label)
    assert.deepEqual(spy.writes, [], label)
  }
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

test('begin: malformed bodies are 400 and never reach KV', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/begin.js')
  const cases = [
    ['no username', { recoveryAuth: RECOVERY_AUTH }],
    ['no code', { username: 'alice' }],
    ['code is not base64', { username: 'alice', recoveryAuth: '!!nope!!' }],
    ['code is the wrong length', { username: 'alice', recoveryAuth: 'QUFB' }],
  ]
  for (const [label, body] of cases) {
    const spy = kvSpy()
    const res = await onRequestPost({
      request: post(`${ORIGIN}/api/auth/recover/begin`, body),
      env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
    })
    assert.equal(res.status, 400, label)
    assert.deepEqual(spy.writes, [], label)
  }
  // An oversized body is refused on length alone, before JSON.parse.
  const spy = kvSpy()
  const big = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/begin`, { username: 'a'.repeat(9000), recoveryAuth: RECOVERY_AUTH }),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(big.status, 400)
})

test('begin: 501 when ACCOUNTS is unconfigured', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/begin.js')
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/begin`, { username: 'alice', recoveryAuth: RECOVERY_AUTH }),
    env: { ...openLimiter },
  })
  assert.equal(res.status, 501)
})

test('complete: writes dek, then recovery, then password — in that order', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local', name: 'alice' }),
  })
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody()),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(res.status, 200)
  // The password record MUST land last: until it does the account stays wholly
  // on its old credentials, so any earlier failure is inert rather than
  // stranding a password whose DEK was never stored.
  const relevant = spy.writes.filter((k) => k.startsWith('dek:') || k.startsWith('recovery:') || k.startsWith('password:'))
  assert.deepEqual(relevant, ['dek:local:alice', 'recovery:local:alice', 'password:local:alice'])
  // And the version bump comes after ALL of them — a failure between the bump
  // and the password write would sign every session out for a reset that never
  // took effect.
  assert.deepEqual(spy.writes, [
    'dek:local:alice',
    'recovery:local:alice',
    'password:local:alice',
    'user:local:alice',
  ])
})

test('complete: the new password verifies and the DEK copies are stored', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const { verifyAuth, fromBase64 } = await import('../functions/_lib/password.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
  })
  await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody()),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  // Ordering alone would still pass if the handler stored junk under each key.
  assert.equal(await verifyAuth(JSON.parse(spy.store['password:local:alice']), fromBase64(NEW_AUTH_HASH)), true)
  const dek = JSON.parse(spy.store['dek:local:alice'])
  assert.equal(dek.byPassword.ciphertext, wrappedTwo.ciphertext)
  assert.equal(dek.byRecovery.ciphertext, wrappedTwo.ciphertext)
})

test('complete: rotating the recovery code replaces the verifier', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const { verifyAuth, fromBase64 } = await import('../functions/_lib/password.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
  })
  await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody()),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  const stored = JSON.parse(spy.store['recovery:local:alice'])
  assert.equal(await verifyAuth(stored, fromBase64(NEXT_RECOVERY_AUTH)), true, 'the new code must work')
  assert.equal(await verifyAuth(stored, fromBase64(RECOVERY_AUTH)), false, 'the spent code must not')
})

// The property no other test here covers, and the one that matters most: KV
// has no transaction, so `complete` can stop between any two writes. At EVERY
// such point some credential the user still holds must open some copy in the
// stored dek: record. Authentication is not the question — the old password
// keeps signing in throughout, which is exactly what made the original
// (wrong) "every write before password: is inert" argument look true.
//
// Copies are told apart by ciphertext, since a unit test has no real AES keys.
// All FOUR are distinct — era and slot both. Using one constant per era would
// leave the suite blind to a handler that stored the password-wrapped DEK under
// byRecovery: every era assertion would still pass while the copy the recovery
// code is handed is one it cannot open.
const OLD_PW = 'T0xEUFc='
const OLD_RC = 'T0xEUkM='
const NEW_PW = 'TkVXUFc='
const NEW_RC = 'TkVXUkM='
const copy = (ciphertext) => ({ iv: 'AAAAAAAAAAAAAAAA', ciphertext, version: 1 })
const oldPair = { byPassword: copy(OLD_PW), byRecovery: copy(OLD_RC), version: 1 }

/** A kvSpy whose nth put throws, standing in for a crash or a dropped network. */
function kvFailingOnPut(seed, failAt) {
  const spy = kvSpy(seed)
  const realPut = spy.kv.put
  let n = 0
  spy.kv.put = async (key, value) => {
    n += 1
    if (n === failAt) throw new Error('KV unavailable')
    return realPut(key, value)
  }
  return spy
}

/**
 * Which key era each stored credential record belongs to, and which eras the
 * stored dek: record still has a copy for. `previous` counts: a client that
 * finds the current copy unopenable falls back to it.
 */
async function eraOf(record, oldBytes, newBytes) {
  const { verifyAuth } = await import('../functions/_lib/password.js')
  if (await verifyAuth(record, oldBytes)) return 'old'
  if (await verifyAuth(record, newBytes)) return 'new'
  return 'none'
}

test('complete: every partial-write state leaves the DEK REACHABLE by a credential the user holds', async () => {
  const complete = await import('../functions/api/auth/recover/complete.js')
  const begin = await import('../functions/api/auth/recover/begin.js')
  const dekEndpoint = await import('../functions/api/dek.js')
  const { hashAuth, fromBase64 } = await import('../functions/_lib/password.js')
  const OLD_PASSWORD = 'T0xEUEFTU1dPUkQtMzItYnl0ZXMtZXhhY3RseSEhISE='

  // REACHABLE, not merely stored. An earlier version of this test read
  // spy.store directly and passed while `begin` served only dek.byRecovery and
  // never dek.previous.byRecovery — so the fallback existed in KV and no
  // caller could ever obtain it. Reading storage answers "did we keep a copy";
  // only driving the endpoints answers "can the user get at one", and the
  // second is the question the guarantee is about. Anything that inspects the
  // store here instead of a response is measuring the wrong thing.
  for (const failAt of [1, 2, 3, 4]) {
    const spy = kvFailingOnPut(
      {
        'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
        'password:local:alice': JSON.stringify(await hashAuth(fromBase64(OLD_PASSWORD))),
        'dek:local:alice': JSON.stringify(oldPair),
        ...seedSignedIn(),
      },
      failAt
    )
    const env = { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter }
    await complete.onRequestPost({
      request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody({
        dek: { byPassword: copy(NEW_PW), byRecovery: copy(NEW_RC) },
      })),
      env,
    })

    // Which era each credential the user still holds now proves.
    const passwordEra = await eraOf(
      JSON.parse(spy.store['password:local:alice']),
      fromBase64(OLD_PASSWORD),
      fromBase64(NEW_AUTH_HASH)
    )
    const codeEra = await eraOf(
      JSON.parse(spy.store['recovery:local:alice']),
      fromBase64(RECOVERY_AUTH),
      fromBase64(NEXT_RECOVERY_AUTH)
    )

    // The path that matters for THIS feature: someone who has lost their
    // password and holds only the code. Whichever code verifies, begin must
    // hand back a copy sealed under that same era.
    const beginRes = await begin.onRequestPost({
      request: post(`${ORIGIN}/api/auth/recover/begin`, {
        username: 'alice',
        recoveryAuth: codeEra === 'old' ? RECOVERY_AUTH : NEXT_RECOVERY_AUTH,
      }),
      env,
    })
    assert.equal(beginRes.status, 200, `interrupted at write ${failAt}: the verifying code must still pass begin`)
    const served = await beginRes.json()
    const servedToCode = [served.byRecovery?.ciphertext, served.previousByRecovery?.ciphertext]
    assert.ok(
      servedToCode.includes({ old: OLD_RC, new: NEW_RC }[codeEra]),
      `interrupted at write ${failAt}: the code proves the ${codeEra} era, but begin served ` +
        `${JSON.stringify(servedToCode)} — this user can never open their vault`
    )

    // The other path, for an account that still has a live session: GET
    // /api/dek returns the whole record, `previous` included.
    const dekRes = await dekEndpoint.onRequestGet({
      request: new Request(`${ORIGIN}/api/dek`, { headers: { Cookie: SESSION } }),
      env,
    })
    assert.equal(dekRes.status, 200, `interrupted at write ${failAt}: the stored record must stay readable`)
    const { dek } = await dekRes.json()
    const servedToPassword = [dek.byPassword?.ciphertext, dek.previous?.byPassword?.ciphertext]
    assert.ok(
      servedToPassword.includes({ old: OLD_PW, new: NEW_PW }[passwordEra]),
      `interrupted at write ${failAt}: the password proves the ${passwordEra} era, but GET /api/dek served ` +
        `${JSON.stringify(servedToPassword)}`
    )
  }
})

test('complete: the previous pair does not chain, so the record cannot grow without bound', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    // A record that already carries a generation of history.
    'dek:local:alice': JSON.stringify({ ...oldPair, previous: { byPassword: wrappedTwo, byRecovery: wrappedTwo } }),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
  })
  await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody()),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  const dek = JSON.parse(spy.store['dek:local:alice'])
  assert.equal(dek.previous.byPassword.ciphertext, OLD_PW, 'one generation back is kept')
  assert.equal(dek.previous.previous, undefined, 'two generations back is not')
})

test('complete: an unopenable existing dek record does not block the reset', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  for (const [label, raw] of [
    ['unparseable', '{not json'],
    ['not a pair', JSON.stringify({})],
    ['first reset, no record at all', null],
  ]) {
    const seed = {
      'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
      'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
    }
    if (raw !== null) seed['dek:local:alice'] = raw
    const spy = kvSpy(seed)
    const res = await onRequestPost({
      request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody()),
      env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
    })
    // Refusing here would strand the account that most needs the reset: an
    // unopenable dek: record is the state a reset exists to escape.
    assert.equal(res.status, 200, label)
    assert.equal(JSON.parse(spy.store['dek:local:alice']).previous, null, label)
  }
})

test('complete: bumps credentialVersion so old sessions stop resolving', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local', credentialVersion: 3 }),
  })
  await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody()),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(JSON.parse(spy.store['user:local:alice']).credentialVersion, 4)
})

test('complete: a missing credentialVersion bumps to 1, never to NaN', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
  })
  await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody()),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  // getSession fails a user record closed on a non-integer version, so a NaN
  // here would lock the account out entirely, not merely fail to invalidate.
  assert.equal(JSON.parse(spy.store['user:local:alice']).credentialVersion, 1)
})

test('complete: a wrong code writes nothing', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy({
    'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
    'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
  })
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody({ recoveryAuth: NEW_AUTH_HASH })),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(res.status, 401)
  assert.deepEqual(spy.writes, [])
})

test('complete: an unknown username fails the same way, and writes nothing', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy()
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody({ username: 'nobody' })),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(res.status, 401)
  assert.equal((await res.json()).code, 'bad-credentials')
  assert.deepEqual(spy.writes, [], 'nothing may be written for an account that does not exist')
})

test('complete: a verified code with no user record is an error, not a credential mismatch', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy({ 'recovery:local:alice': JSON.stringify(await realRecoveryRecord()) })
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody()),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  // The code MATCHED. Saying 'bad-credentials' would be a lie about what
  // happened, and it costs nothing to be honest: possession is already proven,
  // so a distinct status tells nobody anything they had not already earned.
  assert.equal(res.status, 500)
  assert.equal((await res.json()).code, 'server-error')
  assert.deepEqual(spy.writes, [], 'an inconsistent account must not be half-rewritten')
})

test('complete: refuses off-site callers', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const spy = kvSpy()
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody(), { Origin: 'https://evil.example' }),
    env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
  })
  assert.equal(res.status, 403)
  assert.deepEqual(spy.writes, [])
})

test('complete: malformed bodies are 400 and never reach KV', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const cases = [
    ['no new password hash', completeBody({ authHash: undefined })],
    ['new password hash is the wrong length', completeBody({ authHash: 'QUFB' })],
    ['no dek', completeBody({ dek: undefined })],
    ['one dek copy missing', completeBody({ dek: { byPassword: wrappedTwo } })],
    ['dek copy is not base64', completeBody({ dek: { byPassword: { iv: '!!x!!', ciphertext: 'x' }, byRecovery: wrappedTwo } })],
    // Rotation is mandatory: without it a captured body stays replayable
    // forever, since the verifier it was checked against never moves.
    ['no rotation code', completeBody({ recoveryAuthNext: undefined })],
    ['rotation code is the wrong length', completeBody({ recoveryAuthNext: 'QUFB' })],
  ]
  for (const [label, body] of cases) {
    const spy = kvSpy({
      'recovery:local:alice': JSON.stringify(await realRecoveryRecord()),
      'user:local:alice': JSON.stringify({ id: 'local:alice', provider: 'local' }),
    })
    const res = await onRequestPost({
      request: post(`${ORIGIN}/api/auth/recover/complete`, body),
      env: { ACCOUNTS: spy.kv, AUTH_TEST_BYPASS_RATE_LIMIT: '1', ...openLimiter },
    })
    assert.equal(res.status, 400, label)
    assert.deepEqual(spy.writes, [], label)
  }
})

test('complete: 501 when ACCOUNTS is unconfigured', async () => {
  const { onRequestPost } = await import('../functions/api/auth/recover/complete.js')
  const res = await onRequestPost({
    request: post(`${ORIGIN}/api/auth/recover/complete`, completeBody()),
    env: { ...openLimiter },
  })
  assert.equal(res.status, 501)
})

// The brake wiring for these two endpoints lives in tests/writebudget.test.mjs,
// where "a limited request performs no KV write" is policed for every
// write-capable endpoint in one place.
