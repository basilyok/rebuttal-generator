// Runs against `npx wrangler pages dev dist` (default http://127.0.0.1:8788).
// The ACCOUNTS KV binding comes from wrangler.toml; no secrets are needed —
// password accounts working without any Google credentials is the point.
//
// Re-running this suite against the same long-lived dev server: set
// AUTH_TEST_BYPASS_RATE_LIMIT=1 in a gitignored .dev.vars file (same pattern
// as generate.ts's INSTANT_TEST_ECHO seam — see register.js/login.js for the
// "production never sets this" guarantee). Without it, every caller in local
// dev shares one "unknown" bucket per brake, because there is no
// CF-Connecting-IP header locally — and this suite alone spends 3 of the
// register brake's 5 slots per run (the register+duplicate test, plus the
// mixed-case test below; validation failures don't count, because the brake
// sits after validation — see register.js). A second consecutive run trips
// it. The rate-limited *response itself* (code: 'rate-limited') is instead
// covered by tests/auth-endpoints.unit.test.mjs, which trips real,
// isolated brakes via direct import rather than the shared live server.
//
// State left in .wrangler/state after a run: one `local:<name>` user row and
// its password row per successful registration this file performs (NAME and
// the mixed-case name below). Sessions: this file mints four over a run —
// register(NAME), register(mixedName), the successful login in test 4, and
// the login in test 7 (logout) — and the logout test clears exactly one of
// them (its own). The other three are NOT cleaned up; they sit in KV until
// their TTL (30 days — see session.js's SESSION_TTL_SECONDS) expires them.
// Names are fresh per run (see NAME below), so re-runs never collide on
// identity — they just accumulate harmlessly until `.wrangler/state` is
// wiped.
//
// Order dependence: these tests run in file order and are NOT independent.
// Test 2 ("register → cookie session...") creates the NAME account that
// test 4 ("login: match succeeds...") and test 7 ("logout clears a local
// session") both sign into. If Node's test runner is ever configured to run
// tests within a file concurrently or out of order, this suite breaks
// silently (test 4/7 would 401 against an account that doesn't exist yet).
// Keep them sequential.
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

test('register preserves the display-name case while lowercasing the id', async () => {
  // NAME (above) is already lowercase, so no test using it can tell "case
  // preserved" apart from "case silently lowercased" — register.js calls
  // out case preservation as a deliberate design point, previously with no
  // test able to catch it regressing. This name actually has case to lose.
  const mixedName = `MixedCase-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
  const res = await post('/api/auth/register', { username: mixedName, authHash: authHash(3) })
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.user.name, mixedName, 'display name must keep the case the user typed')
  assert.equal(data.user.id, `local:${mixedName.toLowerCase()}`, 'the id must still be lowercased')
})

test('login: match succeeds; wrong password and unknown user are indistinguishable', async () => {
  const ok = await post('/api/auth/login', { username: NAME, authHash: authHash(1) })
  assert.equal(ok.status, 200)
  assert.match(ok.headers.get('set-cookie') || '', /rb_session=/)

  const wrong = await post('/api/auth/login', { username: NAME, authHash: authHash(9) })
  assert.equal(wrong.status, 401)
  const ghost = await post('/api/auth/login', { username: `no-such-${NAME}`, authHash: authHash(9) })
  assert.equal(ghost.status, 401)

  // Byte-identical, not just deep-equal-after-parsing: the acceptance
  // criterion is "byte-identical bodies", and comparing parsed JSON objects
  // would still pass even if key order or whitespace differed between the
  // two responses (both are real risks — e.g. one path building the object
  // literal with keys in a different order than the other).
  const wrongText = await wrong.text()
  const ghostText = await ghost.text()
  assert.equal(wrongText, ghostText)
  assert.equal(JSON.parse(wrongText).code, 'bad-credentials')
})

test('validation: bad usernames, reserved names, malformed authHash and email', async () => {
  const shortName = await post('/api/auth/register', { username: 'ab', authHash: authHash(1) })
  assert.equal(shortName.status, 400)
  assert.equal((await shortName.json()).code, 'username-invalid')

  assert.equal((await post('/api/auth/register', { username: 'has space', authHash: authHash(1) })).status, 400)

  // "postmaster", not "admin": .wrangler/state persists across dev-server
  // runs, and a maintainer casually poking at the running app with the
  // obvious word "admin" would leave a real row behind — turning this
  // assertion into "already taken" rather than "reserved" (same 409/
  // username-taken code either way, since reserved names ARE taken by
  // design — see register.js). "postmaster" is in RESERVED but not a name
  // anyone would type by accident while trying the app out.
  const reserved = await post('/api/auth/register', { username: 'postmaster', authHash: authHash(1) })
  assert.equal(reserved.status, 409)
  assert.equal((await reserved.json()).code, 'username-taken')

  assert.equal((await post('/api/auth/register', { username: `x${NAME}`, authHash: 'tooshort' })).status, 400)
  assert.equal((await post('/api/auth/register', { username: `x${NAME}`, authHash: 'not base64!!!' })).status, 400)

  const badEmail = await post('/api/auth/register', { username: `x${NAME}`, authHash: authHash(1), email: 'nope' })
  assert.equal(badEmail.status, 400)
  assert.equal((await badEmail.json()).code, 'email-invalid')

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
