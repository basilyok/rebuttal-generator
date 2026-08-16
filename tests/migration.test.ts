import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sealJson,
  openBlob,
  BLOB_VERSION_MASTER,
  BLOB_VERSION_DEK,
  MissingKeyError,
  type VaultBlob,
} from '../src/vault'
import { pushHistory, pullAndMergeHistory, type HistoryEntry } from '../src/history'

// Node ships WebCrypto on globalThis.crypto, so the exact browser code paths
// run here unmodified.

const aesKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

/**
 * Every blob openBlob() sees in production came off the wire: it was stringified
 * by the writer, stored, fetched, and JSON.parsed by the reader. A test that
 * hands openBlob the very object sealJson returned proves only that sealJson and
 * openJson agree in memory. Route every fixture through here instead.
 */
const fromStorage = (blob: VaultBlob): VaultBlob => JSON.parse(JSON.stringify(blob))

/**
 * A v1 blob as the shipped pre-recovery code wrote one — deliberately NOT built
 * by calling the new sealJson and then editing the result. The whole claim under
 * test is that blobs written by the *old* era still open, and only an
 * independently-produced fixture can test that. Base64 comes from Buffer rather
 * than vault's toBase64 for the same reason.
 */
async function legacySeal(key: CryptoKey, value: unknown, withVersionField: boolean): Promise<VaultBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  )
  const blob: VaultBlob = {
    salt: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(new Uint8Array(ciphertext)).toString('base64'),
  }
  // The very oldest blobs predate the field entirely; later v1 blobs carry it.
  if (withVersionField) blob.version = 1
  return blob
}

test('sealJson defaults to the master version, keeping existing callers unchanged', async () => {
  const masterKey = await aesKey()
  const blob = await sealJson(masterKey, { a: 1 })
  assert.equal(blob.version, BLOB_VERSION_MASTER)
  // And a caller who only holds the master key can still get the value back.
  assert.deepEqual(await openBlob({ masterKey }, fromStorage(blob)), { a: 1 })
})

test('sealJson can write a DEK-tagged blob', async () => {
  const dekKey = await aesKey()
  const blob = await sealJson(dekKey, { a: 1 }, BLOB_VERSION_DEK)
  assert.equal(blob.version, BLOB_VERSION_DEK)
  assert.deepEqual(await openBlob({ dekKey }, fromStorage(blob)), { a: 1 })
})

test('a half-migrated account stays readable: legacy v1 vault, new v2 history', async () => {
  const masterKey = await aesKey()
  const dekKey = await aesKey()
  // The vault was written by the old build and never touched since; the history
  // was rewritten after migration started. This is the interrupted-migration state.
  const oldBlob = fromStorage(await legacySeal(masterKey, { which: 'old' }, true))
  const newBlob = fromStorage(await sealJson(dekKey, { which: 'new' }, BLOB_VERSION_DEK))

  const keys = { masterKey, dekKey }
  assert.deepEqual(await openBlob(keys, oldBlob), { which: 'old' })
  assert.deepEqual(await openBlob(keys, newBlob), { which: 'new' })
})

test('a blob with no version field is treated as v1 (written before tagging existed)', async () => {
  const masterKey = await aesKey()
  const blob = fromStorage(await legacySeal(masterKey, { legacy: true }, false))
  assert.equal(blob.version, undefined)
  assert.deepEqual(await openBlob({ masterKey }, blob), { legacy: true })
})

test('openBlob throws MissingKeyError rather than guessing', async () => {
  const dekKey = await aesKey()
  const blob = fromStorage(await sealJson(dekKey, { a: 1 }, BLOB_VERSION_DEK))
  await assert.rejects(() => openBlob({ masterKey: undefined, dekKey: undefined }, blob), MissingKeyError)
})

test('openBlob never falls back to the other era key', async () => {
  const masterKey = await aesKey()
  const dekKey = await aesKey()
  const v1 = fromStorage(await legacySeal(masterKey, { which: 'old' }, true))
  const v2 = fromStorage(await sealJson(dekKey, { which: 'new' }, BLOB_VERSION_DEK))

  // Holding the wrong-era key is not "close enough": guessing would mask a
  // migration bug right up until the day the first key stopped existing.
  await assert.rejects(() => openBlob({ dekKey }, v1), MissingKeyError)
  await assert.rejects(() => openBlob({ masterKey }, v2), MissingKeyError)
})

test('the wrong key still throws, never returns garbage', async () => {
  const dekKey = await aesKey()
  const other = await aesKey()
  const blob = fromStorage(await sealJson(dekKey, { a: 1 }, BLOB_VERSION_DEK))
  // A wrong key is a different failure from a missing one, and must not be
  // reported as MissingKeyError — that would hide real corruption.
  await assert.rejects(
    () => openBlob({ dekKey: other }, blob),
    (err: unknown) => err instanceof Error && !(err instanceof MissingKeyError)
  )
})

// --- history, through its real transport ------------------------------------

const entry = (id: string): HistoryEntry => ({ id, createdAt: 1, argument: `arg-${id}`, message: `msg-${id}` })

/** Stand in for /api/history, so the blob under test is one that crossed the wire. */
function fakeHistoryServer() {
  const state: { body: string | null } = { body: null }
  const original = globalThis.fetch
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      state.body = String(init.body)
      return new Response('{}', { status: 200 })
    }
    if (!state.body) return new Response(JSON.stringify({ history: null }), { status: 200 })
    return new Response(JSON.stringify({ history: JSON.parse(state.body) }), { status: 200 })
  }) as typeof fetch
  return {
    stored: () => (state.body ? (JSON.parse(state.body) as VaultBlob) : null),
    restore: () => {
      globalThis.fetch = original
    },
  }
}

test('pushHistory seals under the key it is handed and tags the blob v2', async () => {
  const server = fakeHistoryServer()
  try {
    const dekKey = await aesKey()
    await pushHistory([entry('a')], dekKey)
    const stored = server.stored()
    assert.ok(stored, 'the server received a blob')
    assert.equal(stored.version, BLOB_VERSION_DEK)
    // What matters is not the tag but that a caller holding the DEK gets the
    // entries back out of what the server actually stored.
    const back = await openBlob<{ entries: HistoryEntry[] }>({ dekKey }, stored)
    assert.deepEqual(back.entries.map((e) => e.id), ['a'])
  } finally {
    server.restore()
  }
})

test('pullAndMergeHistory opens what pushHistory stored, given the same key', async () => {
  const server = fakeHistoryServer()
  try {
    const dekKey = await aesKey()
    await pushHistory([entry('a'), entry('b')], dekKey)
    const merged = await pullAndMergeHistory({ dekKey })
    assert.deepEqual(merged?.map((e) => e.id).sort(), ['a', 'b'])
  } finally {
    server.restore()
  }
})

test('pullAndMergeHistory falls back to local when it lacks the key the blob needs', async () => {
  const server = fakeHistoryServer()
  try {
    const dekKey = await aesKey()
    const masterKey = await aesKey()
    await pushHistory([entry('a')], dekKey)
    // Remote entries are lost to this caller, but local history keeps working
    // rather than the whole panel erroring out.
    assert.deepEqual(await pullAndMergeHistory({ masterKey }), [])
    assert.equal(await pullAndMergeHistory({}), null)
  } finally {
    server.restore()
  }
})
