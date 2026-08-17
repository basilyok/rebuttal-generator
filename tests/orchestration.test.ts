// Setup and migration orchestration: provisioning a DEK, migrating v1 blobs to
// v2, and surviving an interruption anywhere in the sequence.
//
// Everything here asserts on what a caller can OBTAIN — the DEK a password
// unwraps out of the stored record, the bundle a DEK opens out of the stored
// vault — rather than on the object the client just handed to a fetch. The
// distinction is the reason this file's fake server stores strings and reshapes
// the DEK record exactly the way the real handler does.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sealJson,
  openBlob,
  BLOB_VERSION_MASTER,
  BLOB_VERSION_DEK,
  type VaultBlob,
} from '../src/vault'
import type { HistoryEntry } from '../src/history'
import {
  RecoveryError,
  deriveRecoveryCredentials,
  importWrappingKey,
  unwrapDek,
  fetchDek,
  ensureMigrated,
  isFullyMigrated,
  setupRecovery,
  recoveryStatusFor,
  canReset,
  type DekRecord,
} from '../src/recovery'

const aesKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

const entry = (id: string): HistoryEntry => ({ id, createdAt: 1, argument: `arg-${id}`, message: `msg-${id}` })

/**
 * Stands in for the four endpoints the orchestration touches, and — the point —
 * records the ORDER of every write.
 *
 * Order is the safety property of this task: the DEK record must land before
 * any blob is re-encrypted, because the reverse leaves blobs sealed under a DEK
 * that was never stored. An assertion on the finished state cannot see that
 * bug; only an assertion on the sequence can.
 *
 * `interruptAfter` is how an interrupted run is reproduced: writes past that
 * count reject the way a dropped connection does. Note pushHistory swallows its
 * own fetch failure by design, so a history write killed here is invisible to
 * the caller — which is exactly the production shape.
 *
 * PUT /api/dek is modelled on the real handler's cleanWrapped(), which stores
 * only { iv, ciphertext, version } and DROPS the `salt` wrapDek emits. A fake
 * that echoed the request back would prove the client can read its own object
 * rather than what the server actually keeps.
 */
function fakeAccountServer(
  seed: { vault?: VaultBlob | null; history?: VaultBlob | null; dek?: DekRecord | null } = {}
) {
  const state = {
    vault: seed.vault ? JSON.stringify(seed.vault) : null,
    history: seed.history ? JSON.stringify(seed.history) : null,
    dek: seed.dek ? JSON.stringify(seed.dek) : null,
    recoveryAuth: null as string | null,
  }
  const writes: string[] = []
  let interruptAfter = Infinity
  let historyReadsFail = false
  const original = globalThis.fetch
  const cleanWrapped = (v: VaultBlob) => ({ iv: v.iv, ciphertext: v.ciphertext, version: 1 })

  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const path = String(url)
    const method = init?.method ?? 'GET'
    const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })
    if (method === 'GET') {
      if (path === '/api/dek') return ok({ dek: state.dek ? JSON.parse(state.dek) : null })
      if (path === '/api/vault') return ok({ vault: state.vault ? JSON.parse(state.vault) : null })
      if (path === '/api/history') {
        // A 500, not a thrown fetch: the shape a real transient server error
        // takes, and the one the swallowing read turns into a null.
        if (historyReadsFail) return new Response('{}', { status: 500 })
        return ok({ history: state.history ? JSON.parse(state.history) : null })
      }
      throw new Error(`unexpected GET ${path}`)
    }
    if (writes.length >= interruptAfter) throw new TypeError('network interrupted')
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (path === '/api/dek') {
      writes.push('dek')
      state.dek = JSON.stringify({
        byPassword: cleanWrapped(body.byPassword),
        byRecovery: cleanWrapped(body.byRecovery),
        version: 1,
      })
    } else if (path === '/api/auth/recover/register') {
      writes.push('register')
      state.recoveryAuth = body.recoveryAuth
    } else if (path === '/api/vault') {
      writes.push('vault')
      state.vault = JSON.stringify(body)
    } else if (path === '/api/history') {
      writes.push('history')
      state.history = JSON.stringify(body)
    } else {
      throw new Error(`unexpected ${method} ${path}`)
    }
    return ok({ ok: true })
  }) as typeof fetch

  return {
    writes,
    vault: () => (state.vault ? (JSON.parse(state.vault) as VaultBlob) : null),
    history: () => (state.history ? (JSON.parse(state.history) as VaultBlob) : null),
    dek: () => (state.dek ? (JSON.parse(state.dek) as DekRecord) : null),
    recoveryAuth: () => state.recoveryAuth,
    interruptAfter: (n: number) => {
      interruptAfter = n
    },
    failHistoryReads: (fail: boolean) => {
      historyReadsFail = fail
    },
    resume: () => {
      interruptAfter = Infinity
    },
    restore: () => {
      globalThis.fetch = original
    },
  }
}

/** An account as it exists before recovery: both blobs sealed under the master key, tagged v1. */
async function seedMasterEra(masterKey: CryptoKey) {
  return {
    vault: await sealJson(masterKey, { anthropic: 'sk-secret' }, BLOB_VERSION_MASTER),
    history: await sealJson(masterKey, { v: 1, entries: [entry('old')] }, BLOB_VERSION_MASTER),
  }
}

/** The DEK a caller can actually obtain from the stored record with their password. */
const dekFromRecord = async (masterKey: CryptoKey, record: DekRecord) =>
  Buffer.from(await unwrapDek(masterKey, record.byPassword)).toString('hex')

test('setupRecovery writes the DEK record BEFORE it re-encrypts anything', async () => {
  const masterKey = await aesKey()
  const server = fakeAccountServer(await seedMasterEra(masterKey))
  try {
    await setupRecovery('alice', masterKey)
    // Reversed, an interruption strands blobs under a DEK nobody stored. That
    // is the one failure in this feature that is not recoverable, so the order
    // is asserted directly rather than inferred from the finished state.
    assert.equal(server.writes[0], 'dek')
    assert.deepEqual(server.writes, ['dek', 'register', 'vault', 'history'])
  } finally {
    server.restore()
  }
})

test('an interrupted setup leaves every blob openable, and a second run converges', async () => {
  const masterKey = await aesKey()
  const server = fakeAccountServer(await seedMasterEra(masterKey))
  try {
    // Die immediately after the DEK record lands — the worst moment there is.
    server.interruptAfter(1)
    await assert.rejects(() => setupRecovery('alice', masterKey))

    const stranded = server.dek()
    assert.ok(stranded, 'the DEK record survived the interruption')
    const dekBefore = await dekFromRecord(masterKey, stranded)

    // Nothing was re-encrypted, so the master key still opens both blobs — and
    // that is checked by decrypting, not by reading the version tag, because
    // "still tagged v1" is also what a mislabelled blob looks like.
    assert.deepEqual(await openBlob({ masterKey }, server.vault()!), { anthropic: 'sk-secret' })
    assert.deepEqual(await openBlob({ masterKey }, server.history()!), { v: 1, entries: [entry('old')] })

    // Re-run: the stored DEK is reused, never replaced.
    server.resume()
    const { code, dekKey } = await setupRecovery('alice', masterKey)
    assert.equal(await dekFromRecord(masterKey, server.dek()!), dekBefore, 'the second run reused the stored DEK')

    // And now a caller holding ONLY the DEK gets both blobs back.
    assert.deepEqual(await openBlob({ dekKey }, server.vault()!), { anthropic: 'sk-secret' })
    const history = await openBlob<{ entries: HistoryEntry[] }>({ dekKey }, server.history()!)
    assert.deepEqual(
      history.entries.map((e) => e.id),
      ['old']
    )

    // The code handed to the user opens the recovery copy of that same DEK —
    // out of what the server stored, not out of the object we wrapped.
    const { recoveryKeyBytes } = await deriveRecoveryCredentials('alice', code)
    const viaCode = await unwrapDek(await importWrappingKey(recoveryKeyBytes), server.dek()!.byRecovery)
    assert.equal(Buffer.from(viaCode).toString('hex'), dekBefore)
  } finally {
    server.restore()
  }
})

test('setupRecovery refuses to mint a second DEK when the stored one will not open', async () => {
  const masterKey = await aesKey()
  const wrongKey = await aesKey()
  const server = fakeAccountServer(await seedMasterEra(masterKey))
  try {
    await setupRecovery('alice', masterKey)
    const before = JSON.stringify(server.dek())
    // A record this password cannot open means the account was reset elsewhere.
    // Minting a fresh DEK here would orphan every v2 blob the stored one opens.
    await assert.rejects(() => setupRecovery('alice', wrongKey), RecoveryError)
    assert.equal(JSON.stringify(server.dek()), before, 'the unopenable record was left alone')
  } finally {
    server.restore()
  }
})

test('setupRecovery refuses to mint when a v2 blob exists but the record reads absent', async () => {
  const masterKey = await aesKey()
  const dekA = await aesKey()
  // The state a stale KV read produces: a DEK record was written on another
  // device (or another tab) and this colo still answers null, while the vault it
  // sealed is already v2. Minting stores a DEK_B that cannot open that vault,
  // and ensureMigrated skips v2 blobs — so nothing ever repairs it and there is
  // no third copy to fall back to.
  const server = fakeAccountServer({
    vault: await sealJson(dekA, { anthropic: 'sk-secret' }, BLOB_VERSION_DEK),
    dek: null,
  })
  try {
    await assert.rejects(() => setupRecovery('alice', masterKey), RecoveryError)
    assert.deepEqual(server.writes, [], 'a refusal must not write anything, least of all a DEK record')
    // The original DEK still opens the vault, which is the property that would
    // have been destroyed. Checked by decrypting, not by reading the tag.
    assert.deepEqual(await openBlob({ dekKey: dekA }, server.vault()!), { anthropic: 'sk-secret' })
  } finally {
    server.restore()
  }
})

test('setupRecovery refuses to mint when it cannot read the blobs at all', async () => {
  const masterKey = await aesKey()
  const server = fakeAccountServer()
  try {
    server.failHistoryReads(true)
    // Not knowing whether a DEK era has started is a reason to refuse, never a
    // reason to proceed: the mint is the irreversible half.
    await assert.rejects(() => setupRecovery('alice', masterKey))
    assert.deepEqual(server.writes, [])
  } finally {
    server.restore()
  }
})

test('the mint guard does not block a genuine first-time setup', async () => {
  const masterKey = await aesKey()
  // Both the empty account and the all-v1 account must still provision, or the
  // guard has traded one data-loss bug for a feature nobody can turn on.
  for (const seed of [{}, await seedMasterEra(masterKey)]) {
    const server = fakeAccountServer(seed)
    try {
      const { dekKey } = await setupRecovery('alice', masterKey)
      assert.equal(server.writes[0], 'dek')
      assert.ok(server.dek(), 'a record was provisioned')
      if (server.vault()) assert.deepEqual(await openBlob({ dekKey }, server.vault()!), { anthropic: 'sk-secret' })
    } finally {
      server.restore()
    }
  }
})

test('ensureMigrated moves v1 blobs to v2 and is then a no-op', async () => {
  const masterKey = await aesKey()
  const dekKey = await aesKey()
  const server = fakeAccountServer(await seedMasterEra(masterKey))
  try {
    await ensureMigrated({ masterKey, dekKey })
    assert.deepEqual(server.writes, ['vault', 'history'])
    assert.deepEqual(await openBlob({ dekKey }, server.vault()!), { anthropic: 'sk-secret' })

    // Idempotent by construction: a second pass must not touch a thing.
    await ensureMigrated({ masterKey, dekKey })
    assert.deepEqual(server.writes, ['vault', 'history'], 'the second pass wrote nothing')
    assert.equal(await isFullyMigrated(), true)
  } finally {
    server.restore()
  }
})

test('ensureMigrated is a no-op for an account with nothing stored yet', async () => {
  const server = fakeAccountServer()
  try {
    await ensureMigrated({ masterKey: await aesKey(), dekKey: await aesKey() })
    assert.deepEqual(server.writes, [])
    // Nothing to migrate is fully migrated — a brand-new account must not be
    // stuck at `incomplete` forever with no blob that could ever clear it.
    assert.equal(await isFullyMigrated(), true)
  } finally {
    server.restore()
  }
})

test('ensureMigrated leaves a blob from a newer client alone rather than rewriting it', async () => {
  const masterKey = await aesKey()
  const dekKey = await aesKey()
  const seed = await seedMasterEra(masterKey)
  const server = fakeAccountServer({ ...seed, vault: { ...seed.vault, version: 3 } })
  try {
    await ensureMigrated({ masterKey, dekKey })
    assert.deepEqual(server.writes, ['history'], 'the unknown era was not rewritten')
    // And the account does not claim to be reset-ready while it holds a blob no
    // key here can open.
    assert.equal(await isFullyMigrated(), false)
  } finally {
    server.restore()
  }
})

test('ensureMigrated writes nothing when it cannot open the v1 blob', async () => {
  const masterKey = await aesKey()
  const server = fakeAccountServer(await seedMasterEra(masterKey))
  try {
    // The wrong master key: re-sealing whatever came back would replace real
    // ciphertext with garbage, so the failure must abort before any write.
    const keys = { masterKey: await aesKey(), dekKey: await aesKey() }
    await assert.rejects(() => ensureMigrated(keys))
    assert.deepEqual(server.writes, [])
    assert.deepEqual(await openBlob({ masterKey }, server.vault()!), { anthropic: 'sk-secret' })
  } finally {
    server.restore()
  }
})

test('a failed history read is NOT read as "migrated"', async () => {
  const masterKey = await aesKey()
  const dekKey = await aesKey()
  // The vault half must already be v2, or it fails the check on its own and the
  // history half is never reached — an earlier version of this test passed
  // against the unfixed code for exactly that reason.
  const server = fakeAccountServer({
    vault: await sealJson(dekKey, { anthropic: 'sk-secret' }, BLOB_VERSION_DEK),
    history: await sealJson(masterKey, { v: 1, entries: [entry('old')] }, BLOB_VERSION_MASTER),
  })
  try {
    assert.equal(await isFullyMigrated(), false, 'the v1 history is visible while the read works')

    // Now the only thing that changes is that /api/history stops answering. A
    // swallowed error arrives as `null`, indistinguishable from "nothing
    // stored", and that second reading makes this account — which still holds a
    // v1 history — report itself ready for a reset. The reset then rewraps the
    // DEK and strands the very blob we failed to read.
    server.failHistoryReads(true)
    assert.equal(await isFullyMigrated(), false, 'a read we could not perform is not evidence of migration')
  } finally {
    server.restore()
  }
})

test('ensureMigrated surfaces a failed history read instead of skipping it', async () => {
  const masterKey = await aesKey()
  const dekKey = await aesKey()
  const server = fakeAccountServer(await seedMasterEra(masterKey))
  try {
    server.failHistoryReads(true)
    // Reporting success here would leave a v1 history behind while every caller
    // believed migration was done — the same wrong `null`, one layer down.
    await assert.rejects(() => ensureMigrated({ masterKey, dekKey }))
  } finally {
    server.restore()
  }
})

test('recovery status resolves none / incomplete / ready, and only ready permits a reset', () => {
  assert.equal(recoveryStatusFor(false, false), 'none')
  assert.equal(recoveryStatusFor(false, true), 'none') // no record is no recovery, migrated or not
  assert.equal(recoveryStatusFor(true, false), 'incomplete')
  assert.equal(recoveryStatusFor(true, true), 'ready')
  assert.deepEqual(
    (['none', 'incomplete', 'ready'] as const).map(canReset),
    [false, false, true],
    'a half-migrated account must not reset: the rewrap would strand its v1 blobs'
  )
})

test('an account whose setup was interrupted reports incomplete, not ready', async () => {
  const masterKey = await aesKey()
  const server = fakeAccountServer(await seedMasterEra(masterKey))
  try {
    server.interruptAfter(1)
    await assert.rejects(() => setupRecovery('alice', masterKey))
    server.resume()
    assert.equal(recoveryStatusFor((await fetchDek()) !== null, await isFullyMigrated()), 'incomplete')
  } finally {
    server.restore()
  }
})

test('fetchDek reports a corrupt record as an error, never as absence', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'x', code: 'dek-corrupt' }), { status: 500 })) as typeof fetch
  try {
    // Null here would send setupRecovery into first-time setup, and the fresh
    // DEK it PUT would overwrite a record that was merely unread.
    await assert.rejects(() => fetchDek(), RecoveryError)
  } finally {
    globalThis.fetch = original
  }
})

test('fetchDek returns null for a signed-out or unconfigured server', async () => {
  const original = globalThis.fetch
  try {
    for (const status of [401, 501]) {
      globalThis.fetch = (async () => new Response('{}', { status })) as typeof fetch
      assert.equal(await fetchDek(), null, `status ${status}`)
    }
  } finally {
    globalThis.fetch = original
  }
})

test('the migrated history blob is tagged v2, and a master-key holder cannot open it', async () => {
  const masterKey = await aesKey()
  const dekKey = await aesKey()
  const server = fakeAccountServer(await seedMasterEra(masterKey))
  try {
    await ensureMigrated({ masterKey, dekKey })
    // The tag and the key must have moved together. A v2 tag on a master-sealed
    // blob passes reset's "refuse while any blob is v1" gate, and the rewrap
    // then strands it — so check both halves: the tag says v2, AND the master
    // key genuinely no longer opens it.
    assert.equal(server.history()?.version, BLOB_VERSION_DEK)
    assert.equal(server.vault()?.version, BLOB_VERSION_DEK)
    // Handing the master key to the DEK slot is what proves the ciphertext
    // really moved: an empty slot would only prove openBlob's routing, which is
    // already tested elsewhere and would hold for a blob that never changed.
    await assert.rejects(() => openBlob({ dekKey: masterKey }, server.history()!))
    await assert.rejects(() => openBlob({ dekKey: masterKey }, server.vault()!))
  } finally {
    server.restore()
  }
})
