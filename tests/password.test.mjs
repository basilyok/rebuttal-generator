import test from 'node:test'
import assert from 'node:assert/strict'
import { hashAuth, verifyAuth, fromBase64, dummyRecord } from '../functions/_lib/password.js'

const AUTH_HASH = crypto.getRandomValues(new Uint8Array(32))

test('hash then verify round-trips', async () => {
  const record = await hashAuth(AUTH_HASH)
  assert.equal(await verifyAuth(record, AUTH_HASH), true)
})

// The round-trip test above cannot catch SERVER_ITERATIONS being silently
// weakened: verifyAuth trusts whatever iterations value is stored in the
// record, not the constant, so hashing and verifying would still agree at
// iterations=1. Pin the value a fresh hashAuth() call actually produces.
// (record.version is checked against the literal 1, not the PASSWORD_RECORD_VERSION
// constant it was assigned from — comparing against that constant would be
// tautological, true for any value the constant happens to hold.)
test('a fresh record uses the documented iteration count and version', async () => {
  const record = await hashAuth(AUTH_HASH)
  assert.equal(record.iterations, 1_000)
  assert.equal(record.version, 1)
})

// Known-answer test — deliberately NOT a round-trip. Every other test in this
// file hashes and verifies through the same code path, so a change applied
// symmetrically to both sides (e.g. widening the digest, or swapping the hash
// algorithm from SHA-256 to SHA-512) is invisible to them: both would drift
// together and still agree. This test pins a hand-built record — fixed salt,
// fixed authHash, a literal expected digest computed once from the current
// implementation — so the only way it passes is if the algorithm, the output
// length, AND the record-owns-its-iteration-count contract are all unchanged.
// This is the only test in this file that can fail from any of those three
// regressions.
test('known-answer: a hand-built record matches a pinned digest, and iterations is read from the record', async () => {
  const authHash = new Uint8Array(32).fill(7)
  const record = {
    salt: 'c2FsdHNhbHRzYWx0c2FsdA==', // 'saltsaltsaltsalt', 16 bytes
    hash: 'gkuiAW3JLX6UGA3FsCIh210pa57sbo1wnnho9pyeCBo=', // PBKDF2-SHA256(authHash, salt, 1000 rounds), 256-bit output
    iterations: 1000,
    version: 1,
  }
  assert.equal(await verifyAuth(record, authHash), true)
  // The record's own iterations value is authoritative, not SERVER_ITERATIONS —
  // that is this module's whole upgrade story (see the header comment). A
  // verifyAuth that ignored the record and used the constant instead would
  // still pass every other test in this file but would pass this assertion
  // wrongly (it would verify true, not false).
  assert.equal(await verifyAuth({ ...record, iterations: 2 }, authHash), false)
})

test('a different authHash fails verification', async () => {
  const record = await hashAuth(AUTH_HASH)
  const other = crypto.getRandomValues(new Uint8Array(32))
  assert.equal(await verifyAuth(record, other), false)
})

test('each hash gets a fresh salt (and therefore a fresh digest)', async () => {
  const a = await hashAuth(AUTH_HASH)
  const b = await hashAuth(AUTH_HASH)
  assert.notEqual(a.salt, b.salt)
  assert.notEqual(a.hash, b.hash)
})

test('malformed stored records verify false, never throw', async () => {
  assert.equal(await verifyAuth(null, AUTH_HASH), false)
  assert.equal(await verifyAuth({}, AUTH_HASH), false)
  assert.equal(await verifyAuth({ salt: '!!!', hash: 'AAAA', iterations: 1000 }, AUTH_HASH), false)
  assert.equal(await verifyAuth({ salt: 'AAAA', hash: 'AAAA', iterations: 0 }, AUTH_HASH), false)
  // NOTE: this does not exercise the iterations ceiling — 'AAAA' decodes to a
  // 3-byte "digest", so timingSafeEqual's length check rejects it before the
  // ceiling is ever consulted, regardless of what iterations says. It only
  // proves malformed records are still refused when iterations happens to be
  // large. See the known-answer test below for what actually pins the ceiling.
  assert.equal(await verifyAuth({ salt: 'AAAA', hash: 'AAAA', iterations: 100_001 }, AUTH_HASH), false)
})

// The obvious way to test the ceiling — tamper a well-formed record's
// iterations to something over 100_000 — doesn't distinguish "rejected by the
// ceiling" from "rejected because the digest no longer matches at that count"
// (PBKDF2 output at 100_000 rounds and at 100_001 rounds are unrelated
// values). Only a record whose digest is genuinely correct at its stated
// count can isolate the ceiling: both digests below are real PBKDF2 outputs,
// computed independently with node:crypto, so the *only* thing that can make
// the second assertion return false is the iterations > 100_000 guard itself.
test('the iteration ceiling refuses a record that would otherwise verify', async () => {
  const authHash = new Uint8Array(32).fill(7)
  const salt = 'c2FsdHNhbHRzYWx0c2FsdA=='
  assert.equal(
    await verifyAuth({ salt, hash: '+2IQ6xPwXC+ZMPLKy7ESRTswEDBkAaBW97XojOKkG+E=', iterations: 100_000, version: 1 }, authHash),
    true
  )
  assert.equal(
    await verifyAuth({ salt, hash: 'TZes1AjgL8lSxKUGHSnpZw14AhMYa1iNndTGxWswJe4=', iterations: 100_001, version: 1 }, authHash),
    false
  )
})

test('fromBase64 rejects junk and accepts real base64', () => {
  assert.equal(fromBase64('not base64!!'), null)
  assert.equal(fromBase64(42), null)
  assert.deepEqual(fromBase64('AAECAw=='), new Uint8Array([0, 1, 2, 3]))
})

// login.js verifies unknown-user attempts against dummyRecord() so that path
// costs the same PBKDF2 run as a real user's — see login.js's comment at its
// call site. That property depends entirely on dummyRecord() staying
// shaped like a real record: same keys, same iterations, same version. If a
// future SERVER_ITERATIONS bump or a v2 record shape lands in hashAuth()
// without dummyRecord() following it, the dummy verifies at the old cost (or
// down an unversioned branch) and the timing oracle silently comes back.
// This test is the guard — it fails the moment the two drift apart.
test('dummyRecord matches the shape of a freshly-minted hashAuth record', async () => {
  const real = await hashAuth(new Uint8Array(32).fill(3))
  const dummy = dummyRecord()
  assert.deepEqual(Object.keys(dummy).sort(), Object.keys(real).sort())
  assert.equal(dummy.iterations, real.iterations)
  assert.equal(dummy.version, real.version)
  // What actually keeps verifyAuth from short-circuiting BEFORE it runs
  // PBKDF2 is narrower than "looks like a digest": salt and hash must both
  // decode as base64, and iterations must be an integer in [1, 100000] (see
  // password.js's verifyAuth). Digest LENGTH is not part of that gate — it
  // is compared only inside timingSafeEqual, AFTER the derivation already
  // ran — so a dummy with a short or oddly-sized hash would still cost a
  // real PBKDF2 run. This pins the thing that actually matters: dummy's
  // salt/hash both decode successfully, and its iterations are in range.
  assert.notEqual(fromBase64(dummy.salt), null)
  assert.notEqual(fromBase64(dummy.hash), null)
  assert.ok(dummy.iterations >= 1 && dummy.iterations <= 100_000)
})

// The shape test above cannot catch this specific regression: if
// SERVER_ITERATIONS is ever bumped above verifyAuth's 100,000 ceiling,
// dummyRecord() and a fresh hashAuth() record move together (both carry the
// same, now-too-high iterations value), so their shapes still match and
// that test still passes — right up until every login breaks, because
// verifyAuth rejects ANY record whose iterations exceeds the ceiling, real
// or dummy alike (see password.js's literal 100_000). This pins the
// relationship directly: SERVER_ITERATIONS (read off a fresh hashAuth()
// record, since the constant itself isn't exported) must stay strictly
// inside that ceiling.
test('SERVER_ITERATIONS stays inside verifyAuth\'s ceiling', async () => {
  const real = await hashAuth(new Uint8Array(32).fill(4))
  assert.ok(
    real.iterations < 100_000,
    `SERVER_ITERATIONS (${real.iterations}) must stay strictly below verifyAuth's 100,000 ceiling, or every login (real and dummy alike) starts failing closed`
  )
})
