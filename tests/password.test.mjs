import test from 'node:test'
import assert from 'node:assert/strict'
import { hashAuth, verifyAuth, fromBase64 } from '../functions/_lib/password.js'

const AUTH_HASH = crypto.getRandomValues(new Uint8Array(32))

test('hash then verify round-trips', async () => {
  const record = await hashAuth(AUTH_HASH)
  assert.equal(await verifyAuth(record, AUTH_HASH), true)
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
})

test('fromBase64 rejects junk and accepts real base64', () => {
  assert.equal(fromBase64('not base64!!'), null)
  assert.equal(fromBase64(42), null)
  assert.deepEqual(fromBase64('AAECAw=='), new Uint8Array([0, 1, 2, 3]))
})
