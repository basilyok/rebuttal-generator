import test from 'node:test'
import assert from 'node:assert/strict'
import { makeFloodBrake } from '../functions/_lib/ratelimit.js'

// makeFloodBrake takes a { headers: { get } } duck-type, not a real Cloudflare
// Request, so these tests run with a plain object stand-in — no Workers
// runtime needed.
const fakeRequest = (ip) => ({
  headers: { get: (name) => (name === 'CF-Connecting-IP' ? ip : null) },
})

test('boundary: exactly max hits are allowed, hit max+1 is refused (strict >, not >=)', () => {
  const overLimit = makeFloodBrake({ windowMs: 60_000, max: 6 })
  const results = []
  for (let i = 0; i < 7; i++) results.push(overLimit(fakeRequest('1.2.3.4')))
  // Calls 1..6 (indices 0..5) are within the cap; call 7 (index 6) is the
  // first to exceed it. If the comparison were `>=` instead of `>`, call 6
  // (index 5) would already be refused and this would fail one call early.
  assert.deepEqual(
    results,
    [false, false, false, false, false, false, true],
    'the 6th hit must still be allowed; only the 7th trips the brake'
  )
})

test('window expiry: a hit just inside the window still counts; exactly at windowMs it has expired', (t) => {
  const originalNow = Date.now
  t.after(() => {
    Date.now = originalNow
  })
  let now = 1_000_000
  Date.now = () => now

  // Just inside the window (windowMs - 1ms later): the first hit is still
  // within range when the second arrives, so with max=1 the second hit trips
  // the brake.
  const stillWithin = makeFloodBrake({ windowMs: 60_000, max: 1 })
  const reqA = fakeRequest('5.5.5.1')
  assert.equal(stillWithin(reqA), false) // hit 1, at the cap
  now += 59_999 // 1ms short of the window boundary
  assert.equal(stillWithin(reqA), true) // hit 2 — hit 1 is still counted, over cap

  // Exactly at the window boundary: the filter is `now - t < windowMs`
  // (strict), so an elapsed gap of exactly windowMs excludes the earlier hit
  // — it reads as a fresh first hit, not a second one.
  now = 2_000_000
  const atBoundary = makeFloodBrake({ windowMs: 60_000, max: 1 })
  const reqB = fakeRequest('5.5.5.2')
  assert.equal(atBoundary(reqB), false) // hit 1
  now += 60_000 // exactly windowMs later
  assert.equal(atBoundary(reqB), false) // hit 1 has expired — this is a fresh hit 1
})

test('per-IP isolation: one address at its cap does not affect another address', () => {
  const overLimit = makeFloodBrake({ windowMs: 60_000, max: 1 })
  assert.equal(overLimit(fakeRequest('1.1.1.1')), false)
  assert.equal(overLimit(fakeRequest('1.1.1.1')), true) // 1.1.1.1 is now over its cap
  assert.equal(overLimit(fakeRequest('2.2.2.2')), false) // unrelated address, untouched
})

test('closure isolation: two separately-constructed brakes never share counters', () => {
  const brakeA = makeFloodBrake({ windowMs: 60_000, max: 1 })
  const brakeB = makeFloodBrake({ windowMs: 60_000, max: 1 })
  assert.equal(brakeA(fakeRequest('9.9.9.9')), false)
  assert.equal(brakeA(fakeRequest('9.9.9.9')), true) // brakeA is now over cap for this IP
  // A fresh brake, same IP, must start from zero — this is the entire point
  // of the factory: each endpoint's brake is tuned and counted independently.
  assert.equal(brakeB(fakeRequest('9.9.9.9')), false)
})

test('missing CF-Connecting-IP falls back to the shared "unknown" bucket', () => {
  const overLimit = makeFloodBrake({ windowMs: 60_000, max: 1 })
  const noIpRequest = { headers: { get: () => null } }
  assert.equal(overLimit(noIpRequest), false)
  // A second caller that also fails to supply the header lands in the same
  // "unknown" bucket and is capped alongside the first — this is a known,
  // accepted coarsening (see the module comment: best-effort, not identity).
  assert.equal(overLimit(noIpRequest), true)
})
