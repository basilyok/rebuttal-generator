import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sealJson,
  openBlob,
  BLOB_VERSION_MASTER,
  BLOB_VERSION_DEK,
  MissingKeyError,
  UnknownBlobVersionError,
  type BlobKeys,
  type VaultBlob,
} from '../src/vault'
import { pushHistory, pullAndMergeHistory, saveEntry, listEntries, type HistoryEntry } from '../src/history'

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

test('sealJson writes the era it is given, and openBlob routes a master blob to the master key', async () => {
  const masterKey = await aesKey()
  const blob = await sealJson(masterKey, { a: 1 }, BLOB_VERSION_MASTER)
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

test('an era this build does not know raises rather than defaulting to master', async () => {
  const masterKey = await aesKey()
  const dekKey = await aesKey()
  const keys = { masterKey, dekKey }
  const base = fromStorage(await sealJson(masterKey, { a: 1 }, BLOB_VERSION_MASTER))

  // A v3 blob from a newer client is NOT a v1 blob. Note this would have opened
  // and returned { a: 1 } under a default-to-master route, because both slots
  // hold the same key today — success is exactly what makes it dangerous.
  for (const version of [3, 0, null, NaN, '2']) {
    await assert.rejects(
      () => openBlob(keys, { ...base, version } as VaultBlob),
      UnknownBlobVersionError,
      `version ${String(version)} must not be read as master-era`
    )
  }
})

test('the tag decides, even when it disagrees with the key that sealed the blob', async () => {
  const masterKey = await aesKey()
  const dekKey = await aesKey()
  // Sealed under the DEK but mislabelled master — the exact mistake a key
  // change without a tag change produces. It must fail loudly at the crypto
  // layer, not quietly open something else.
  const mislabelled = fromStorage(await sealJson(dekKey, { a: 1 }, BLOB_VERSION_MASTER))
  await assert.rejects(
    () => openBlob({ masterKey, dekKey }, mislabelled),
    (err: unknown) => err instanceof Error && !(err instanceof MissingKeyError)
  )
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

/**
 * Node has no IndexedDB, and history.ts treats that as "private browsing" and
 * swallows it — so without this shim listEntries() returns [] on every path and
 * every "local history survives" assertion compares [] to [] and would hold for
 * a function that does nothing. The shim is what makes those assertions able to
 * fail.
 */
function fakeIndexedDb(seed: HistoryEntry[] = []) {
  const original = (globalThis as { indexedDB?: unknown }).indexedDB
  const rows = new Map<string, HistoryEntry>(seed.map((e) => [e.id, e]))
  // Requests hand results back asynchronously, because the caller assigns
  // onsuccess on the line AFTER the call — firing synchronously would silently
  // drop every result.
  const request = (result: unknown) => {
    const req: Record<string, unknown> = { result: undefined, onsuccess: null, onerror: null }
    setTimeout(() => {
      req.result = result
      ;(req.onsuccess as (() => void) | null)?.()
    }, 0)
    return req
  }
  const store = {
    getAll: () => request([...rows.values()]),
    put: (e: HistoryEntry) => (rows.set(e.id, e), request(undefined)),
    delete: (id: string) => (rows.delete(id), request(undefined)),
    clear: () => (rows.clear(), request(undefined)),
  }
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => store,
    transaction: () => ({ objectStore: () => store }),
    close: () => {},
  }
  ;(globalThis as { indexedDB?: unknown }).indexedDB = {
    open: () => {
      const req: Record<string, unknown> = { result: db, onsuccess: null, onerror: null, onupgradeneeded: null }
      setTimeout(() => (req.onsuccess as (() => void) | null)?.(), 0)
      return req
    },
  }
  return {
    ids: () => [...rows.keys()].sort(),
    restore: () => {
      ;(globalThis as { indexedDB?: unknown }).indexedDB = original
    },
  }
}

/** Stand in for /api/history, so the blob under test is one that crossed the wire. */
function fakeHistoryServer(seedBlob: VaultBlob | null = null) {
  const state: { body: string | null } = { body: seedBlob ? JSON.stringify(seedBlob) : null }
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

test('pushHistory tags the blob with the era it is told, not one of its own choosing', async () => {
  const server = fakeHistoryServer()
  try {
    const dekKey = await aesKey()
    await pushHistory([entry('a')], dekKey, BLOB_VERSION_DEK)
    const stored = server.stored()
    assert.ok(stored, 'the server received a blob')
    assert.equal(stored.version, BLOB_VERSION_DEK)
    // What matters is not the tag but that a caller holding the DEK gets the
    // entries back out of what the server actually stored.
    const back = await openBlob<{ entries: HistoryEntry[] }>({ dekKey }, stored)
    assert.deepEqual(back.entries.map((e) => e.id), ['a'])

    const masterKey = await aesKey()
    await pushHistory([entry('b')], masterKey, BLOB_VERSION_MASTER)
    assert.equal(server.stored()?.version, BLOB_VERSION_MASTER)
  } finally {
    server.restore()
  }
})

test('a master-era history blob is NOT openable as a DEK blob', async () => {
  const server = fakeHistoryServer()
  try {
    // The mislabelling this pins down: while no DEK exists, history sealed under
    // the master key must say so. If it claimed v2, reset's "refuse while any
    // blob is v1" gate would wave it through and the rewrap would strand it.
    // A round-trip test cannot catch that — today both key slots hold the same
    // key, so a wrongly-tagged blob still opens.
    const masterKey = await aesKey()
    const dekKey = await aesKey()
    await pushHistory([entry('a')], masterKey, BLOB_VERSION_MASTER)
    const stored = server.stored()
    assert.ok(stored)
    await assert.rejects(() => openBlob({ dekKey }, stored), MissingKeyError)
  } finally {
    server.restore()
  }
})

/** Exactly what App.tsx does on every open: pull, show the merge, push it back. */
async function callerPullThenPush(keys: BlobKeys, key: CryptoKey, version: number) {
  const merged = await pullAndMergeHistory(keys)
  if (merged) await pushHistory(merged, key, version)
  return merged
}

test('a history blob we lack the key for is never overwritten by the local list', async () => {
  const server = fakeHistoryServer()
  try {
    const dekKey = await aesKey()
    const masterKey = await aesKey()
    await pushHistory([entry('remote-only')], dekKey, BLOB_VERSION_DEK)
    const before = JSON.stringify(server.stored())

    // This device is mid-migration and holds the old era's key only. The blob is
    // intact and the other key opens it, so writing over it would destroy
    // history that was never actually lost.
    await callerPullThenPush({ masterKey }, masterKey, BLOB_VERSION_MASTER)

    assert.equal(JSON.stringify(server.stored()), before, 'the unreadable blob was left alone')
    const back = await openBlob<{ entries: HistoryEntry[] }>({ dekKey }, server.stored()!)
    assert.deepEqual(back.entries.map((e) => e.id), ['remote-only'])
  } finally {
    server.restore()
  }
})

test('pullAndMergeHistory opens what pushHistory stored, given the same key', async () => {
  const server = fakeHistoryServer()
  try {
    const dekKey = await aesKey()
    await pushHistory([entry('a'), entry('b')], dekKey, BLOB_VERSION_DEK)
    const merged = await pullAndMergeHistory({ dekKey })
    assert.deepEqual(merged?.map((e) => e.id).sort(), ['a', 'b'])
  } finally {
    server.restore()
  }
})

test('pullAndMergeHistory reports "do not push" when it lacks the key the blob needs', async () => {
  const server = fakeHistoryServer()
  try {
    const dekKey = await aesKey()
    const masterKey = await aesKey()
    await pushHistory([entry('a')], dekKey, BLOB_VERSION_DEK)
    // null, not the local list: the caller pushes whatever it is handed, and
    // this blob is readable by another key that exists.
    assert.equal(await pullAndMergeHistory({ masterKey }), null)
    assert.equal(await pullAndMergeHistory({}), null)
  } finally {
    server.restore()
  }
})

test('a legacy v1 history blob on the server is read by a post-upgrade client', async () => {
  // The production scenario the version tag exists for: this account's history
  // was written by the old build and has never been touched since. It reaches
  // the reader through the real transport, not straight into openBlob.
  const masterKey = await aesKey()
  const legacy = await legacySeal(masterKey, { v: 1, entries: [entry('from-old-build')] }, false)
  const server = fakeHistoryServer(legacy)
  const idb = fakeIndexedDb([entry('made-locally')])
  try {
    const merged = await pullAndMergeHistory({ masterKey, dekKey: await aesKey() })
    assert.deepEqual(merged?.map((e) => e.id).sort(), ['from-old-build', 'made-locally'])
    // The merge is written back to local storage, not just returned.
    assert.deepEqual(idb.ids(), ['from-old-build', 'made-locally'])
  } finally {
    idb.restore()
    server.restore()
  }
})

test('a wrong key leaves local history intact and adds nothing from the remote blob', async () => {
  const server = fakeHistoryServer()
  const idb = fakeIndexedDb()
  try {
    const dekKey = await aesKey()
    const wrongDek = await aesKey()
    await pushHistory([entry('remote-only')], dekKey, BLOB_VERSION_DEK)

    await saveEntry(entry('made-locally'))
    assert.deepEqual(
      (await listEntries()).map((e) => e.id),
      ['made-locally'],
      'the shim really does store entries — without it this list is empty and the assertions below are vacuous'
    )

    // Wrong key, not missing: the blob is unreadable by anyone holding this
    // key, so the local list is what the panel shows.
    const merged = await pullAndMergeHistory({ dekKey: wrongDek })
    assert.deepEqual(merged?.map((e) => e.id), ['made-locally'])
    assert.ok(!merged?.some((e) => e.id === 'remote-only'), 'nothing leaked out of the unreadable blob')
  } finally {
    idb.restore()
    server.restore()
  }
})
