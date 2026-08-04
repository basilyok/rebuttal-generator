import test from 'node:test'
import assert from 'node:assert/strict'
import { sealJson, openJson } from '../src/vault'
import { mergeEntries, type HistoryEntry } from '../src/history'

// Node ships WebCrypto on globalThis.crypto (Node 20+), so the exact browser
// code paths run here unmodified.

async function testKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

test('sealJson/openJson round-trip arbitrary JSON', async () => {
  const key = await testKey()
  const value = { entries: [{ id: 'a', argument: 'x', createdAt: 1 }], v: 1 }
  const blob = await sealJson(key, value)
  assert.notEqual(blob.iv, '')
  const back = await openJson(key, blob)
  assert.deepEqual(back, value)
})

test('every seal uses a fresh IV', async () => {
  const key = await testKey()
  const a = await sealJson(key, { x: 1 })
  const b = await sealJson(key, { x: 1 })
  assert.notEqual(a.iv, b.iv)
  assert.notEqual(a.ciphertext, b.ciphertext)
})

test('tampered ciphertext throws', async () => {
  const key = await testKey()
  const blob = await sealJson(key, { x: 1 })
  const tampered = { ...blob, ciphertext: blob.ciphertext.slice(0, -4) + 'AAAA' }
  await assert.rejects(() => openJson(key, tampered))
})

const entry = (id: string, createdAt: number): HistoryEntry => ({
  id,
  createdAt,
  argument: `arg-${id}`,
  message: `msg-${id}`,
})

test('mergeEntries unions by id, newest first, capped at 100', () => {
  const local = [entry('a', 3), entry('b', 1)]
  const remote = [entry('a', 3), entry('c', 2)]
  const merged = mergeEntries(local, remote)
  assert.deepEqual(merged.map((e) => e.id), ['a', 'c', 'b'])

  const many = Array.from({ length: 150 }, (_, i) => entry(`m${i}`, i))
  assert.equal(mergeEntries(many, []).length, 100)
  assert.equal(mergeEntries(many, [])[0].id, 'm149') // newest kept
})
