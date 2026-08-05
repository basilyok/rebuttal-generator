import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveCredentials, normalizeUsername } from '../src/account'
import { adoptKey, unlockWithKey, sealJson } from '../src/vault'

// Node ships WebCrypto on globalThis.crypto (Node 20+), so the exact browser
// derivation runs here unmodified. Each deriveCredentials call really performs
// the 600k PBKDF2 rounds — a few hundred ms each is the price of testing the
// real construction instead of a knob-turned imitation.

test('derivation is deterministic and sensitive to both inputs', async () => {
  const a = await deriveCredentials('basil', 'correct horse battery')
  const b = await deriveCredentials('basil', 'correct horse battery')
  assert.equal(a.authHash, b.authHash)
  assert.deepEqual(a.masterKeyBytes, b.masterKeyBytes)

  const otherPassword = await deriveCredentials('basil', 'correct horse battery!')
  assert.notEqual(otherPassword.authHash, a.authHash)

  const otherUser = await deriveCredentials('sage', 'correct horse battery')
  assert.notEqual(otherUser.authHash, a.authHash)
  assert.notDeepEqual(otherUser.masterKeyBytes, a.masterKeyBytes)
})

test('username case and whitespace do not change the key', async () => {
  const lower = await deriveCredentials('basil', 'correct horse battery')
  const shouty = await deriveCredentials('  BASIL ', 'correct horse battery')
  assert.equal(shouty.authHash, lower.authHash)
  assert.deepEqual(shouty.masterKeyBytes, lower.masterKeyBytes)
})

test('authHash is not the master key', async () => {
  const { masterKeyBytes, authHash } = await deriveCredentials('basil', 'correct horse battery')
  assert.notEqual(authHash, Buffer.from(masterKeyBytes).toString('base64'))
})

test('vault sealed under the master key opens after a fresh login, not with the wrong password', async () => {
  const first = await deriveCredentials('basil', 'correct horse battery')
  const key = await adoptKey(first.masterKeyBytes)
  const blob = await sealJson(key, { openrouter: 'sk-or-test' })

  // Same username+password on a "new device" derives the same key
  const again = await deriveCredentials('basil', 'correct horse battery')
  const rederived = await adoptKey(again.masterKeyBytes)
  assert.deepEqual(await unlockWithKey(blob, rederived), { openrouter: 'sk-or-test' })

  const wrong = await deriveCredentials('basil', 'wrong password entirely')
  const wrongKey = await adoptKey(wrong.masterKeyBytes)
  await assert.rejects(() => unlockWithKey(blob, wrongKey))
})

test('normalizeUsername lowercases and trims', () => {
  assert.equal(normalizeUsername('  Basil '), 'basil')
  assert.equal(normalizeUsername('a_b-C'), 'a_b-c')
})
