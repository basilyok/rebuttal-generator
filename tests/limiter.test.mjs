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
