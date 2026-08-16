import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateRecoveryCode,
  deriveRecoveryCredentials,
  normalizeRecoveryCode,
  wrapDek,
  unwrapDek,
  RECOVERY_ALPHABET,
} from '../src/recovery'
import { deriveCredentials } from '../src/account'

test('the code is six dash-separated groups of Crockford base32', () => {
  const code = generateRecoveryCode()
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/)
  // I, L, O and U are excluded so the code survives being read off a screen
  for (const forbidden of ['I', 'L', 'O', 'U']) {
    assert.ok(!RECOVERY_ALPHABET.includes(forbidden), `${forbidden} must not be in the alphabet`)
  }
})

test('codes are not repeated', () => {
  const seen = new Set(Array.from({ length: 50 }, () => generateRecoveryCode()))
  assert.equal(seen.size, 50)
})

test('normalizing accepts what a human would actually type back', () => {
  const code = generateRecoveryCode()
  const canonical = normalizeRecoveryCode(code)
  assert.equal(normalizeRecoveryCode(code.toLowerCase()), canonical)
  assert.equal(normalizeRecoveryCode(code.replace(/-/g, '')), canonical)
  assert.equal(normalizeRecoveryCode(`  ${code}  `), canonical)
})

test('derivation is stable and depends on both username and code', async () => {
  const code = generateRecoveryCode()
  const a = await deriveRecoveryCredentials('alice', code)
  const b = await deriveRecoveryCredentials('alice', code)
  const other = await deriveRecoveryCredentials('bob', code)
  assert.equal(a.recoveryAuth, b.recoveryAuth)
  assert.notEqual(a.recoveryAuth, other.recoveryAuth)
})

test('a dashless, lowercased code derives the same credentials', async () => {
  const code = generateRecoveryCode()
  const typed = await deriveRecoveryCredentials('alice', code.toLowerCase().replace(/-/g, ''))
  const shown = await deriveRecoveryCredentials('alice', code)
  assert.equal(typed.recoveryAuth, shown.recoveryAuth)
})

test('recoveryAuth is not the same as using the code as a password', async () => {
  // The salt prefixes differ ("rebuttal|recovery|v1|" vs "rebuttal|v1|"), so a
  // leaked recoveryAuth can never be replayed against the password endpoint.
  const code = generateRecoveryCode()
  const recovery = await deriveRecoveryCredentials('alice', code)
  const asPassword = await deriveCredentials('alice', normalizeRecoveryCode(code))
  assert.notEqual(recovery.recoveryAuth, asPassword.authHash)
})

test('wrapDek/unwrapDek round-trip, and a wrong key throws', async () => {
  const dek = crypto.getRandomValues(new Uint8Array(32))
  const right = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  const wrong = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])

  const blob = await wrapDek(right, dek)
  assert.deepEqual(await unwrapDek(right, blob), dek)
  await assert.rejects(() => unwrapDek(wrong, blob))
})

test('every wrap uses a fresh IV', async () => {
  const dek = crypto.getRandomValues(new Uint8Array(32))
  const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  const a = await wrapDek(key, dek)
  const b = await wrapDek(key, dek)
  assert.notEqual(a.iv, b.iv)
  assert.notEqual(a.ciphertext, b.ciphertext)
})
