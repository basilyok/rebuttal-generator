// Runs against `npx wrangler pages dev dist` (default http://127.0.0.1:8788)
// with the limiter dev session also running (see Task 3 Verify). The pages dev
// environment must have a .dev.vars file containing:
//   OPENROUTER_PROXY_KEY=dev-placeholder
//   INSTANT_TEST_ECHO=1
// INSTANT_TEST_ECHO makes the function return a canned envelope instead of
// calling OpenRouter — gate/quota/validation logic is fully exercised with
// zero spend. Production never sets it.
import test from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.PAGES_URL || 'http://127.0.0.1:8788'
const ORIGIN = { Origin: BASE.replace(/\/$/, ''), 'Content-Type': 'application/json' }

const post = (body, headers = {}, cookie) =>
  fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { ...ORIGIN, ...headers, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })

const VALID = { argument: 'Cats are obviously better than dogs because they are quiet.' }

test('cross-site and headerless requests are refused', async () => {
  const noHeaders = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(VALID),
  })
  assert.equal(noHeaders.status, 403)
  const evil = await post(VALID, { Origin: 'https://evil.example' })
  assert.equal(evil.status, 403)
})

test('validation: oversize and malformed input', async () => {
  const big = await post({ argument: 'x'.repeat(13_000) })
  assert.equal(big.status, 413)
  const empty = await post({ argument: '   ' })
  assert.equal(empty.status, 400)
  const notJson = await fetch(`${BASE}/api/generate`, { method: 'POST', headers: ORIGIN, body: '{{{' })
  assert.equal(notJson.status, 400)
})

test('happy path returns an enveloped reply, quota fields, and a device cookie', async () => {
  const res = await post(VALID)
  assert.equal(res.status, 200)
  const setCookie = res.headers.get('set-cookie') || ''
  assert.match(setCookie, /rb_device=/)
  assert.match(setCookie, /HttpOnly/i)
  const data = await res.json()
  assert.match(data.text, /<<<MESSAGE>>>/)
  assert.equal(typeof data.remaining, 'number')
  assert.equal(data.cap, 3)
})

test('anonymous quota: 4th call in a day is refused with resetAt', async () => {
  // Pin one device identity across calls so the count is ours alone
  const device = `rb_device=${crypto.randomUUID()}`
  let last
  for (let i = 0; i < 3; i++) last = await post(VALID, {}, device)
  assert.equal(last.status, 200)
  const fourth = await post(VALID, {}, device)
  assert.equal(fourth.status, 429)
  const body = await fourth.json()
  assert.match(body.resetAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(body.signedIn, false)
})

test('citations are validated field-by-field', async () => {
  const bad = await post({ ...VALID, citations: [{ url: 'javascript:alert(1)', title: 'x' }] })
  assert.equal(bad.status, 400)
  const tooMany = await post({
    ...VALID,
    citations: Array.from({ length: 9 }, (_, i) => ({ url: `https://e.com/${i}`, title: 't' })),
  })
  assert.equal(tooMany.status, 400)
})
