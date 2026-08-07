// HTTP tests against a locally running limiter: `cd limiter && npx wrangler dev --port 8787`.
// Each run uses fresh random keys, so re-running against the same dev session is fine.
import test from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.LIMITER_URL || 'http://127.0.0.1:8787'
const rand = () => `test:${crypto.randomUUID()}`

const consume = (key, cap) =>
  fetch(`${BASE}/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, cap }),
  }).then((r) => r.json())

test('counts to the cap, then refuses', async () => {
  const key = rand()
  for (let i = 1; i <= 3; i++) {
    const r = await consume(key, 3)
    assert.equal(r.allowed, true, `call ${i} should be allowed`)
    assert.equal(r.count, i)
    assert.equal(r.remaining, 3 - i)
  }
  const fourth = await consume(key, 3)
  assert.equal(fourth.allowed, false)
  assert.equal(fourth.remaining, 0)
  assert.match(fourth.resetAt, /^\d{4}-\d{2}-\d{2}T00:00:00/)
})

test('first is true exactly once per key, ever', async () => {
  const key = rand()
  const a = await consume(key, 5)
  const b = await consume(key, 5)
  assert.equal(a.first, true)
  assert.equal(b.first, false)
})

test('separate keys do not interfere', async () => {
  const a = rand()
  const b = rand()
  await consume(a, 1)
  const refusedA = await consume(a, 1)
  const freshB = await consume(b, 1)
  assert.equal(refusedA.allowed, false)
  assert.equal(freshB.allowed, true)
})

test('metric accumulates and reads back', async () => {
  await fetch(`${BASE}/metric`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test_metric' }),
  })
  const res = await fetch(`${BASE}/metrics?days=1`).then((r) => r.json())
  const row = res.metrics.find((m) => m.name === 'test_metric')
  assert.ok(row && row.n >= 1)
})

test('bad input is rejected', async () => {
  const r = await fetch(`${BASE}/consume`, { method: 'POST', body: 'not json' })
  assert.equal(r.status, 400)
  const r2 = await consume('', 3)
  assert.equal(r2.error, 'key and cap are required.')
})

// --- /brake: the durable half of the auth flood brakes ---

const brake = (key, windowMs, max) =>
  fetch(`${BASE}/brake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, windowMs, max }),
  })

test('brake: counts to max, then limited with a sane retryAfterMs', async () => {
  const key = rand()
  const windowMs = 60_000
  for (let i = 1; i <= 3; i++) {
    const r = await brake(key, windowMs, 3).then((r) => r.json())
    assert.equal(r.limited, false, `call ${i} of 3 must not be limited (max is 3)`)
    assert.equal(r.count, i)
  }
  const fourth = await brake(key, windowMs, 3).then((r) => r.json())
  assert.equal(fourth.limited, true)
  assert.equal(fourth.count, 4)
  // retryAfterMs points at the end of the current fixed window: positive,
  // and never further away than one full window.
  assert.ok(
    fourth.retryAfterMs > 0 && fourth.retryAfterMs <= windowMs,
    `retryAfterMs must be in (0, ${windowMs}], got ${fourth.retryAfterMs}`
  )
})

test('brake: separate keys do not interfere', async () => {
  const a = rand()
  const b = rand()
  await brake(a, 60_000, 1)
  const limitedA = await brake(a, 60_000, 1).then((r) => r.json())
  const freshB = await brake(b, 60_000, 1).then((r) => r.json())
  assert.equal(limitedA.limited, true)
  assert.equal(freshB.limited, false)
  assert.equal(freshB.count, 1)
})

test('brake: a new window starts a fresh count', async () => {
  const key = rand()
  const windowMs = 1_500 // smallest the endpoint allows is 1s; 1.5s keeps the single sleep short
  await brake(key, windowMs, 1)
  const second = await brake(key, windowMs, 1).then((r) => r.json())
  assert.equal(second.limited, true, 'second hit in the same window must be limited (max is 1)')
  // One sleep, slightly longer than the whole window: wherever inside the
  // current bucket these first hits landed, now + windowMs + 100ms is
  // guaranteed to fall in a LATER bucket.
  await new Promise((resolve) => setTimeout(resolve, windowMs + 100))
  const afterRollover = await brake(key, windowMs, 1).then((r) => r.json())
  assert.equal(afterRollover.limited, false, 'the window has rolled over — the count must have reset')
  assert.equal(afterRollover.count, 1)
})

test('brake: bad input is rejected', async () => {
  const notJson = await fetch(`${BASE}/brake`, { method: 'POST', body: 'not json' })
  assert.equal(notJson.status, 400)
  assert.equal((await brake('', 60_000, 5)).status, 400) // empty key
  assert.equal((await brake('x'.repeat(201), 60_000, 5)).status, 400) // key too long
  assert.equal((await brake(rand(), 999, 5)).status, 400) // windowMs below 1s
  assert.equal((await brake(rand(), 86_400_001, 5)).status, 400) // windowMs above a day
  assert.equal((await brake(rand(), 1500.5, 5)).status, 400) // windowMs not an integer
  assert.equal((await brake(rand(), 60_000, 0)).status, 400) // max below 1
  assert.equal((await brake(rand(), 60_000, 1001)).status, 400) // max above 1000
})
