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
