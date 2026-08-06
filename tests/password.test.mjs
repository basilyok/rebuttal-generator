import test from 'node:test'
import assert from 'node:assert/strict'
import { hashAuth, verifyAuth, fromBase64 } from '../functions/_lib/password.js'

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
  // Absurd-high iteration counts (e.g. a corrupted or hostile record claiming
  // 1e21 rounds) are rejected too — the ceiling is headroom for a future
  // re-hash upgrade, not a security boundary, but it stops a stored record
  // from burning the isolate's CPU budget.
  assert.equal(await verifyAuth({ salt: 'AAAA', hash: 'AAAA', iterations: 100_001 }, AUTH_HASH), false)
})

test('fromBase64 rejects junk and accepts real base64', () => {
  assert.equal(fromBase64('not base64!!'), null)
  assert.equal(fromBase64(42), null)
  assert.deepEqual(fromBase64('AAECAw=='), new Uint8Array([0, 1, 2, 3]))
})
