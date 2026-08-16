import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateRecoveryCode,
  deriveRecoveryCredentials,
  normalizeRecoveryCode,
  isValidRecoveryCode,
  importWrappingKey,
  generateDek,
  wrapDek,
  unwrapDek,
  RECOVERY_ALPHABET,
  RecoveryError,
  WrongRecoveryCodeError,
  CorruptDekRecordError,
} from '../src/recovery'
import { deriveCredentials } from '../src/account'

test('the code is six dash-separated groups of four', () => {
  assert.match(generateRecoveryCode(), /^[^-]{4}(-[^-]{4}){5}$/)
})

test('every character comes from the alphabet, which excludes I, L, O and U', () => {
  // Built from the constant rather than a hand-copied regex: a second
  // transcription of the alphabet is a second thing to keep in sync.
  for (const forbidden of ['I', 'L', 'O', 'U']) {
    assert.ok(!RECOVERY_ALPHABET.includes(forbidden), `${forbidden} must not be in the alphabet`)
  }
  for (const ch of generateRecoveryCode().replace(/-/g, '')) {
    assert.ok(RECOVERY_ALPHABET.includes(ch), `${ch} is not in the alphabet`)
  }
})

test('the generator is not stuck: 50 draws are 50 distinct codes', () => {
  // 50 draws from 2^120 collide with vanishing probability, so this proves
  // only that the generator moves at all — a constant or a seeded-once RNG.
  // It is not, and cannot be, a test of entropy quality.
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

test('normalizing folds the letters Crockford says to substitute', () => {
  // The alphabet omits I/L/O/U so we never print an ambiguous character, but
  // the likelier error is the reader's: writing 0 and typing back O.
  assert.equal(normalizeRecoveryCode('OIL0-1234-5678-9ABC-DEFG-HJKM'), '0110123456789ABCDEFGHJKM')
  assert.equal(normalizeRecoveryCode('oil0'), '0110')
  assert.equal(normalizeRecoveryCode('I'), '1')
  assert.equal(normalizeRecoveryCode('L'), '1')
  assert.equal(normalizeRecoveryCode('O'), '0')
})

test('normalizing strips en-dashes and other non-ASCII hyphens', () => {
  // Reachable from a PDF copy-paste or smart-dash autocorrect; visually
  // identical to the ASCII hyphen we printed.
  const code = generateRecoveryCode()
  const canonical = normalizeRecoveryCode(code)
  for (const dash of ['‐', '‑', '–', '—', '―']) {
    const point = dash.codePointAt(0)?.toString(16)
    assert.equal(normalizeRecoveryCode(code.replace(/-/g, dash)), canonical, `U+${point} not stripped`)
  }
})

test('isValidRecoveryCode accepts real codes and rejects near-misses', () => {
  const code = generateRecoveryCode()
  assert.ok(isValidRecoveryCode(code))
  assert.ok(isValidRecoveryCode(` ${code.toLowerCase().replace(/-/g, '')} `))
  assert.ok(!isValidRecoveryCode(''))
  assert.ok(!isValidRecoveryCode('   '))
  assert.ok(!isValidRecoveryCode(code.slice(0, -1)), 'a half-typed code must not validate')
  assert.ok(!isValidRecoveryCode(`${code}A`))
  assert.ok(!isValidRecoveryCode(code.replace(/^./, '$')), 'a character outside the alphabet must not validate')
})

test('deriving from an invalid code or a blank username throws instead of producing a key', async () => {
  // The enrolment path wraps the DEK under whatever this returns. A key
  // derived from '' would look perfectly valid and be trivially guessable.
  const code = generateRecoveryCode()
  await assert.rejects(() => deriveRecoveryCredentials('alice', ''), WrongRecoveryCodeError)
  await assert.rejects(() => deriveRecoveryCredentials('alice', code.slice(0, 10)), WrongRecoveryCodeError)
  await assert.rejects(() => deriveRecoveryCredentials('   ', code), RecoveryError)
})

test('derivation is stable and depends on both username and code', async () => {
  const code = generateRecoveryCode()
  const a = await deriveRecoveryCredentials('alice', code)
  const b = await deriveRecoveryCredentials('alice', code)
  const other = await deriveRecoveryCredentials('bob', code)
  assert.equal(a.recoveryAuth, b.recoveryAuth)
  assert.notEqual(a.recoveryAuth, other.recoveryAuth)
})

test('recoveryKeyBytes is a real 256-bit secret, not a function of public inputs', async () => {
  // Without these assertions the whole first PBKDF2 can be reduced to a
  // function of the username — which is public — and every other test still
  // passes, because only recoveryAuth is ever compared.
  const one = await deriveRecoveryCredentials('alice', generateRecoveryCode())
  const two = await deriveRecoveryCredentials('alice', generateRecoveryCode())
  assert.equal(one.recoveryKeyBytes.length, 32)
  assert.notDeepEqual(one.recoveryKeyBytes, two.recoveryKeyBytes, 'the code must feed the wrapping key')
  assert.ok(one.recoveryKeyBytes.some((b) => b !== 0), 'an all-zero key means the derivation was skipped')
  // The wrapping key must never be the value we hand the server.
  assert.notEqual(Buffer.from(one.recoveryKeyBytes).toString('base64'), one.recoveryAuth)
})

test('a dashless, lowercased code derives the same credentials', async () => {
  const code = generateRecoveryCode()
  const typed = await deriveRecoveryCredentials('alice', code.toLowerCase().replace(/-/g, ''))
  const shown = await deriveRecoveryCredentials('alice', code)
  assert.equal(typed.recoveryAuth, shown.recoveryAuth)
  assert.deepEqual(typed.recoveryKeyBytes, shown.recoveryKeyBytes)
})

test('recoveryAuth is not the same as using the code as a password', async () => {
  // The salt prefixes differ ("rebuttal|recovery|v1|" vs "rebuttal|v1|"), so a
  // leaked recoveryAuth can never be replayed against the password endpoint.
  const code = generateRecoveryCode()
  const recovery = await deriveRecoveryCredentials('alice', code)
  const asPassword = await deriveCredentials('alice', normalizeRecoveryCode(code))
  assert.notEqual(recovery.recoveryAuth, asPassword.authHash)
  assert.notDeepEqual(recovery.recoveryKeyBytes, asPassword.masterKeyBytes)
})

test('a code written down and retyped later unwraps the same DEK', async () => {
  const dek = generateDek()
  assert.equal(dek.length, 32)
  const shown = generateRecoveryCode()
  const enrol = await deriveRecoveryCredentials('alice', shown)
  const blob = await wrapDek(await importWrappingKey(enrol.recoveryKeyBytes), dek)

  const typed = await deriveRecoveryCredentials('Alice', ` ${shown.toLowerCase().replace(/-/g, '')} `)
  assert.deepEqual(await unwrapDek(await importWrappingKey(typed.recoveryKeyBytes), blob), dek)

  const wrong = await deriveRecoveryCredentials('alice', generateRecoveryCode())
  const wrongKey = await importWrappingKey(wrong.recoveryKeyBytes)
  await assert.rejects(() => unwrapDek(wrongKey, blob), WrongRecoveryCodeError)
})

test('wrapDek/unwrapDek round-trip, and a wrong key throws WrongRecoveryCodeError', async () => {
  const dek = generateDek()
  const right = await importWrappingKey(crypto.getRandomValues(new Uint8Array(32)))
  const wrong = await importWrappingKey(crypto.getRandomValues(new Uint8Array(32)))

  const blob = await wrapDek(right, dek)
  assert.deepEqual(await unwrapDek(right, blob), dek)
  await assert.rejects(() => unwrapDek(wrong, blob), WrongRecoveryCodeError)
})

test('a malformed record is a corruption error, not a wrong-code error', async () => {
  // The reset UI must not invite a fourth attempt at a code that was right.
  const key = await importWrappingKey(crypto.getRandomValues(new Uint8Array(32)))
  const blob = await wrapDek(key, generateDek())
  await assert.rejects(() => unwrapDek(key, { ...blob, iv: 'not base64!!' }), CorruptDekRecordError)
  await assert.rejects(() => unwrapDek(key, { ...blob, ciphertext: '@@@' }), CorruptDekRecordError)
})

test('tampered ciphertext is rejected rather than decrypted', async () => {
  const key = await importWrappingKey(crypto.getRandomValues(new Uint8Array(32)))
  const blob = await wrapDek(key, generateDek())
  const bytes = Buffer.from(blob.ciphertext, 'base64')
  bytes[0] ^= 0xff
  await assert.rejects(() => unwrapDek(key, { ...blob, ciphertext: bytes.toString('base64') }), WrongRecoveryCodeError)
})

test('every wrap uses a fresh IV', async () => {
  const dek = generateDek()
  const key = await importWrappingKey(crypto.getRandomValues(new Uint8Array(32)))
  const a = await wrapDek(key, dek)
  const b = await wrapDek(key, dek)
  assert.notEqual(a.iv, b.iv)
  assert.notEqual(a.ciphertext, b.ciphertext)
})
