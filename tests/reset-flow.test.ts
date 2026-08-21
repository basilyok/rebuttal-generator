// The reset flow: what a signed-out user with a recovery code can actually get
// back.
//
// Every assertion here is on what a CALLER OBTAINS — the DEK that comes out of
// the record the fake endpoints serve, the copy the rotated code opens on a
// second round trip through begin — never on the object runReset just handed to
// a fetch. That distinction is why this file exists: the property most likely to
// be dropped silently is the previousByRecovery fallback, and a round trip
// through a healthy account cannot see it. It only shows up when the stored
// record has moved on and the credential has not, which is the state seeded
// below by hand.
import test from 'node:test'
import assert from 'node:assert/strict'
import { BadCredentialsError, RecoveryBlockedError, deriveCredentials } from '../src/account'
import {
  CorruptDekRecordError,
  WrongRecoveryCodeError,
  deriveRecoveryCredentials,
  generateDek,
  importWrappingKey,
  runReset,
  unwrapDek,
  unwrapDekWithPrevious,
  wrapDek,
} from '../src/recovery'
import { failureCode, resetFailure } from '../src/recoveryUi'
import { BLOB_VERSION_MASTER, BLOB_VERSION_DEK, sealJson, type VaultBlob } from '../src/vault'

const aesKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

// --- the two-generation unwrap ----------------------------------------------
//
// Raw AES keys rather than derived ones: this helper knows nothing about codes
// or passwords, and 600k PBKDF2 rounds per case would buy the assertions
// nothing.

test('a healthy record opens from the current copy and never consults the previous one', async () => {
  const key = await aesKey()
  const dek = generateDek()
  const current = await wrapDek(key, dek)
  // A previous copy that would throw if it were reached: sealed under someone
  // else's key entirely.
  const previous = await wrapDek(await aesKey(), dek)
  const opened = await unwrapDekWithPrevious(key, current, previous)
  assert.equal(hex(opened.dek), hex(dek))
  assert.equal(opened.fromPrevious, false, 'a healthy record must not claim it fell back')
})

test('the previous copy is used when the credential is one generation behind the record', async () => {
  // The interrupted-reset shape, reduced to its essentials: the record has
  // moved to a new key, the caller still holds the old one, and the old one
  // sealed the previous copy.
  const held = await aesKey()
  const dek = generateDek()
  const current = await wrapDek(await aesKey(), dek)
  const previous = await wrapDek(held, dek)

  // The primary attempt fails exactly the way a wrong credential does — which
  // is why dropping the fallback is invisible except to the one user it strands.
  await assert.rejects(() => unwrapDek(held, current), WrongRecoveryCodeError)
  const opened = await unwrapDekWithPrevious(held, current, previous)
  assert.equal(
    hex(opened.dek),
    hex(dek),
    'the previous generation must be tried before the credential is called wrong'
  )
  // The flag adoptRecovery reads. Without it a session that only got in via the
  // previous copy — proof that a reset stopped partway — reports `ready`, and
  // the user is never told their recovery code may open nothing.
  assert.equal(opened.fromPrevious, true, 'a fallback must be reportable to the one caller that acts on it')
})

test('a damaged current copy still falls back, and the fallback repairs rather than reports', async () => {
  const held = await aesKey()
  const dek = generateDek()
  const good = await wrapDek(held, dek)
  // Truncated at a 4-character boundary: still well-formed base64, still the
  // likeliest way a record actually goes bad, and the case unwrapDek answers
  // with CorruptDekRecordError rather than a key mismatch.
  const current: VaultBlob = { ...good, ciphertext: good.ciphertext.slice(0, 8) }
  await assert.rejects(() => unwrapDek(held, current), CorruptDekRecordError)
  const repaired = await unwrapDekWithPrevious(held, current, good)
  assert.equal(hex(repaired.dek), hex(dek))
  assert.equal(repaired.fromPrevious, true)
})

test('with both copies shut, the retryable verdict is the one reported', async () => {
  const held = await aesKey()
  const dek = generateDek()
  const stranger = await aesKey()

  // Neither opens: the credential really is wrong. "Wrong" and not "damaged",
  // because "damaged" tells the user to stop trying.
  const shut = await wrapDek(stranger, dek)
  await assert.rejects(() => unwrapDekWithPrevious(held, shut, shut), WrongRecoveryCodeError)

  // A damaged current copy plus a previous one the credential cannot open:
  // still reported as a wrong credential, because a corrected one would open
  // the previous copy and "retrying cannot help" would be false.
  const good = await wrapDek(stranger, dek)
  await assert.rejects(
    () => unwrapDekWithPrevious(held, { ...good, ciphertext: good.ciphertext.slice(0, 8) }, good),
    WrongRecoveryCodeError
  )
})

test('with no previous generation stored, the current copy has the last word', async () => {
  const held = await aesKey()
  const dek = generateDek()
  const good = await wrapDek(await aesKey(), dek)
  // Both null and undefined reach here: PUT /api/dek writes no `previous` at
  // all, and begin serves an explicit null when there is none.
  for (const previous of [null, undefined]) {
    await assert.rejects(() => unwrapDekWithPrevious(held, good, previous), WrongRecoveryCodeError)
    await assert.rejects(
      () => unwrapDekWithPrevious(held, { ...good, ciphertext: good.ciphertext.slice(0, 8) }, previous),
      CorruptDekRecordError
    )
  }
})

// --- what the reset UI says --------------------------------------------------

test('a wrong code and an unknown username are one message, a damaged record is not', () => {
  // The endpoint answers the first two identically on purpose. A client that
  // told them apart would rebuild the username oracle from the browser, where
  // anyone can read the mapping.
  assert.equal(resetFailure('bad-credentials').key, resetFailure('wrong-recovery-code').key)
  assert.notEqual(resetFailure('corrupt-dek-record').key, resetFailure('bad-credentials').key)

  // And only the two indistinguishable-credential cases send the user back to
  // the code field; the others are not the code's fault.
  assert.equal(resetFailure('bad-credentials').retryCode, true)
  assert.equal(resetFailure('wrong-recovery-code').retryCode, true)
  for (const code of ['corrupt-dek-record', 'recovery-blocked', 'rate-limited', 'kaboom']) {
    assert.equal(resetFailure(code).retryCode, false, `${code} must not blame the recovery code`)
  }
})

test('failureCode reads the machine code off a real thrown error, not a sentence', () => {
  assert.equal(resetFailure(failureCode(new BadCredentialsError())).key, 'recovery.resetFailed')
  assert.equal(resetFailure(failureCode(new WrongRecoveryCodeError())).key, 'recovery.resetFailed')
  assert.equal(resetFailure(failureCode(new CorruptDekRecordError())).key, 'recovery.resetCorrupt')
  assert.equal(resetFailure(failureCode(new RecoveryBlockedError())).key, 'recovery.resetBlocked')
  // A dropped connection carries whatever message the runtime chose.
  assert.equal(resetFailure(failureCode(new TypeError('Failed to fetch'))).key, 'account.serverError')
})

// --- the whole flow ----------------------------------------------------------

interface Seed {
  /** The verifier the recovery: record currently holds. */
  recoveryAuth: string
  dek: { byPassword: VaultBlob; byRecovery: VaultBlob; previous?: unknown }
  authHash?: string
  vault?: VaultBlob | null
  history?: VaultBlob | null
}

/**
 * The two recover endpoints and the two blob reads, modelled on the real
 * handlers rather than on what the client hopes they do.
 *
 * Three details are deliberate, and each one is a thing a laxer fake would
 * hide. begin serves ONLY the recovery-wrapped side, both generations of it —
 * a fake that echoed the whole record would let a client that reads byPassword
 * pass. complete writes in the real order and rebuilds `previous` from the
 * stored pair, so an interruption leaves the real intermediate state. And both
 * store strings and reshape the wrapped copies the way cleanWrapped does,
 * dropping the empty `salt`, so nothing here proves only that the client can
 * read back its own object.
 */
function fakeRecoverServer(seed: Seed) {
  const clean = (v: VaultBlob) => ({ iv: v.iv, ciphertext: v.ciphertext, version: 1 })
  const state = {
    recoveryAuth: seed.recoveryAuth,
    authHash: seed.authHash ?? 'old-auth-hash',
    dek: JSON.stringify(seed.dek),
    vault: seed.vault ? JSON.stringify(seed.vault) : null,
    history: seed.history ? JSON.stringify(seed.history) : null,
  }
  const writes: string[] = []
  let interruptAfter = Infinity
  let serverErrorAfter = Infinity
  let refuseNotMigrated = false
  const original = globalThis.fetch

  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const path = String(url)
    const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })
    // Byte-identical for an unknown username and a wrong code — the property
    // the endpoints go to some trouble to hold.
    const failure = () =>
      new Response(JSON.stringify({ error: 'That username and recovery code did not match.', code: 'bad-credentials' }), {
        status: 401,
      })

    if ((init?.method ?? 'GET') === 'GET') {
      if (path === '/api/vault') return ok({ vault: state.vault ? JSON.parse(state.vault) : null })
      if (path === '/api/history') return ok({ history: state.history ? JSON.parse(state.history) : null })
      throw new Error(`unexpected GET ${path}`)
    }

    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (path === '/api/auth/recover/begin') {
      if (body.recoveryAuth !== state.recoveryAuth) return failure()
      const record = JSON.parse(state.dek)
      return ok({ byRecovery: record.byRecovery, previousByRecovery: record.previous?.byRecovery ?? null })
    }
    if (path === '/api/auth/recover/complete') {
      // Re-verified here too: begin issues no token, so this endpoint trusts
      // nothing it said.
      if (body.recoveryAuth !== state.recoveryAuth) return failure()
      // The server's migration gate, in the order the handler applies it:
      // after verification, before the first write. Modelled here because on
      // the real path it is the ONLY gate — the client's own check is answering
      // 401s it reads as absence.
      if (refuseNotMigrated) {
        return new Response(
          JSON.stringify({ error: 'Recovery setup has not finished on this account yet.', code: 'not-migrated' }),
          { status: 409 }
        )
      }
      const previousRaw = JSON.parse(state.dek)
      // Two ways a write sequence stops partway, and they are NOT the same
      // thing to a caller. `interruptAfter` drops the connection — the client
      // sees a TypeError. `serverErrorAfter` returns 500 with writes already
      // applied, which is the shape complete.js's catch actually produces:
      // its try wraps all four writes, so a KV fault on write 2 or 3 answers
      // 500 long after the record was overwritten and the verifier moved.
      let failed = false
      const bump = (label: string) => {
        if (writes.length >= interruptAfter) throw new TypeError('network interrupted')
        if (writes.length >= serverErrorAfter) {
          failed = true
          return false
        }
        writes.push(label)
        return true
      }
      const serverError = () =>
        new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', code: 'server-error' }), {
          status: 500,
        })
      if (bump('dek')) {
        state.dek = JSON.stringify({
          byPassword: clean(body.dek.byPassword),
          byRecovery: clean(body.dek.byRecovery),
          previous: { byPassword: previousRaw.byPassword, byRecovery: previousRaw.byRecovery },
        })
      }
      if (bump('recovery')) state.recoveryAuth = body.recoveryAuthNext
      if (bump('password')) state.authHash = body.authHash
      if (failed) return serverError()
      return ok({ ok: true })
    }
    throw new Error(`unexpected POST ${path}`)
  }) as typeof fetch

  return {
    writes,
    state,
    dek: () => JSON.parse(state.dek),
    interruptAfter: (n: number) => {
      interruptAfter = n
    },
    serverErrorAfter: (n: number) => {
      serverErrorAfter = n
    },
    refuseNotMigrated: () => {
      refuseNotMigrated = true
    },
    restore: () => {
      globalThis.fetch = original
    },
  }
}

/** Wrap one DEK under a code, the way setup and reset both leave it. */
async function sealedUnderCode(username: string, code: string, dek: Uint8Array) {
  const { recoveryKeyBytes, recoveryAuth } = await deriveRecoveryCredentials(username, code)
  return { blob: await wrapDek(await importWrappingKey(recoveryKeyBytes), dek), recoveryAuth }
}

/** What a caller holding `code` can actually get out of the stored record. */
async function dekFromStoredCode(username: string, code: string, blob: VaultBlob) {
  const { recoveryKeyBytes } = await deriveRecoveryCredentials(username, code)
  return unwrapDek(await importWrappingKey(recoveryKeyBytes), blob)
}

const CODE_A = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ23'
const CODE_B = '2345-6789-ABCD-EFGH-JKMN-PQRS'

test('a reset keeps the DEK, moves both credentials, and returns a code that works', async () => {
  const dek = generateDek()
  const oldMaster = await aesKey()
  const sealed = await sealedUnderCode('alice', CODE_A, dek)
  const server = fakeRecoverServer({
    recoveryAuth: sealed.recoveryAuth,
    dek: { byPassword: await wrapDek(oldMaster, dek), byRecovery: sealed.blob },
  })
  try {
    const nextCode = await runReset('alice', CODE_A, 'a-brand-new-password')

    // The write order is the safety property, and it is asserted on the
    // sequence rather than inferred from the finished state.
    assert.deepEqual(server.writes, ['dek', 'recovery', 'password'])

    // THE VAULT SURVIVES, stated as the only thing that means it: the key that
    // decrypts every v2 blob is byte-for-byte the one that did before.
    assert.equal(
      hex(await dekFromStoredCode('alice', nextCode, server.dek().byRecovery)),
      hex(dek),
      'the rotated code must open the same DEK the old one did'
    )
    const { masterKeyBytes, authHash } = await deriveCredentials('alice', 'a-brand-new-password')
    assert.equal(hex(await unwrapDek(await importWrappingKey(masterKeyBytes), server.dek().byPassword)), hex(dek))
    // And the new password is what the server would now verify a login against.
    assert.equal(server.state.authHash, authHash)

    // The old code is dead: its verifier is gone, so begin would refuse it.
    assert.notEqual(server.state.recoveryAuth, sealed.recoveryAuth)
  } finally {
    server.restore()
  }
})

test('a reset interrupted between its first two writes is still recoverable — with the OLD code', async () => {
  // This is the state previousByRecovery exists for, and it is seeded by
  // RUNNING the interruption rather than by writing the record by hand.
  const dek = generateDek()
  const oldMaster = await aesKey()
  const sealed = await sealedUnderCode('alice', CODE_A, dek)
  const server = fakeRecoverServer({
    recoveryAuth: sealed.recoveryAuth,
    dek: { byPassword: await wrapDek(oldMaster, dek), byRecovery: sealed.blob },
  })
  try {
    server.interruptAfter(1) // die after the dek: write, before the verifier moves
    const dropped = await runReset('alice', CODE_A, 'first-attempt-password').then(
      () => null,
      (e) => e
    )
    // A dropped connection is the other shape of a partly-applied reset, and it
    // gets the same honest message. Write 1 landed here, so "nothing happened"
    // would be false.
    assert.equal(resetFailure(failureCode(dropped)).key, 'recovery.resetInterrupted')
    assert.equal(resetFailure(failureCode(dropped)).retryCode, false)
    assert.deepEqual(server.writes, ['dek'])

    // What the account looks like now: the stored byRecovery is sealed under a
    // code whose verifier never landed, so it opens for nobody, while the
    // verifier still on file is the OLD code's.
    assert.equal(server.state.recoveryAuth, sealed.recoveryAuth, 'the old code still verifies')
    await assert.rejects(
      () => dekFromStoredCode('alice', CODE_A, server.dek().byRecovery),
      WrongRecoveryCodeError,
      'the current copy is exactly the one the surviving code cannot open'
    )

    // The user retries with the code they still hold. Without the fallback this
    // is where they are told their correct code is wrong, permanently.
    server.interruptAfter(Infinity)
    const nextCode = await runReset('alice', CODE_A, 'second-attempt-password')

    assert.equal(
      hex(await dekFromStoredCode('alice', nextCode, server.dek().byRecovery)),
      hex(dek),
      'the same DEK came back out — the vault and history are still openable'
    )
    const { authHash } = await deriveCredentials('alice', 'second-attempt-password')
    assert.equal(server.state.authHash, authHash)
  } finally {
    server.restore()
  }
})

test('a wrong code and an unknown username fail the same way, and change nothing', async () => {
  const dek = generateDek()
  const oldMaster = await aesKey()
  const sealed = await sealedUnderCode('alice', CODE_A, dek)
  const byPassword = await wrapDek(oldMaster, dek)
  const server = fakeRecoverServer({
    recoveryAuth: sealed.recoveryAuth,
    dek: { byPassword, byRecovery: sealed.blob },
  })
  try {
    const before = JSON.stringify(server.dek())

    // CODE_B is well-formed, so it gets past the client-side validation and is
    // refused by the endpoint — the same 401 an unknown username gets.
    const wrongCode = await runReset('alice', CODE_B, 'password-ten').then(
      () => null,
      (err) => err
    )
    const unknownUser = await runReset('nobody', CODE_A, 'password-ten').then(
      () => null,
      (err) => err
    )
    assert.ok(wrongCode instanceof BadCredentialsError)
    assert.ok(unknownUser instanceof BadCredentialsError)
    // What the user is told, not what was thrown: one message for both.
    assert.equal(resetFailure(failureCode(wrongCode)).key, resetFailure(failureCode(unknownUser)).key)

    // "A failed reset leaves the old password working", checked where it is
    // true rather than asserted in prose: nothing was written at all.
    assert.deepEqual(server.writes, [])
    assert.equal(server.state.authHash, 'old-auth-hash')
    assert.equal(server.state.recoveryAuth, sealed.recoveryAuth)
    assert.equal(JSON.stringify(server.dek()), before)
  } finally {
    server.restore()
  }
})

test('a half-migrated account is refused before anything is derived or sent', async () => {
  const dek = generateDek()
  const sealed = await sealedUnderCode('alice', CODE_A, dek)
  const server = fakeRecoverServer({
    recoveryAuth: sealed.recoveryAuth,
    dek: { byPassword: await wrapDek(await aesKey(), dek), byRecovery: sealed.blob },
    // A blob still sealed under the master key this reset would replace. The
    // reset rewraps the DEK and keeps it — this blob would be left with no key
    // at all.
    vault: await sealJson(await aesKey(), { anthropic: 'sk-x' }, BLOB_VERSION_MASTER),
    history: await sealJson(await aesKey(), { v: 1, entries: [] }, BLOB_VERSION_DEK),
  })
  try {
    await assert.rejects(() => runReset('alice', CODE_A, 'a-brand-new-password'), RecoveryBlockedError)
    assert.deepEqual(server.writes, [], 'the refusal must come before any write')
    assert.equal(server.state.recoveryAuth, sealed.recoveryAuth)
  } finally {
    server.restore()
  }
})

test('a 409 not-migrated reaches the user as the blocked message, not as a bad code', async () => {
  // The production shape, exactly: signed out, so the client-side guard sees
  // two 401s-read-as-null and waves the reset through; the SERVER is what
  // refuses. Mapping that 409 to BadCredentialsError like every other non-2xx
  // would tell the one user whose old password still works to go on hunting
  // for a typo in a code that was correct.
  const dek = generateDek()
  const sealed = await sealedUnderCode('alice', CODE_A, dek)
  const server = fakeRecoverServer({
    recoveryAuth: sealed.recoveryAuth,
    dek: { byPassword: await wrapDek(await aesKey(), dek), byRecovery: sealed.blob },
  })
  try {
    server.refuseNotMigrated()
    const err = await runReset('alice', CODE_A, 'a-brand-new-password').then(
      () => null,
      (e) => e
    )
    assert.ok(err instanceof RecoveryBlockedError, 'a 409 not-migrated is a blocked reset, not a bad credential')
    assert.equal(resetFailure(failureCode(err)).key, 'recovery.resetBlocked')
    // And it does not send the user back to re-type a code that was right.
    assert.equal(resetFailure(failureCode(err)).retryCode, false)
    assert.deepEqual(server.writes, [])
    assert.equal(server.state.authHash, 'old-auth-hash', 'the old password still authenticates')
  } finally {
    server.restore()
  }
})

test('a 500 from complete must NOT send the user back to re-type a correct code', async () => {
  // complete.js's try wraps all four writes and its catch answers 500, so a KV
  // fault on write 2 or 3 is a 500 raised AFTER the record was overwritten and
  // the verifier rotated. Reporting that as a credential failure sends the user
  // to a retry that can never succeed: begin now checks a verifier their code
  // no longer matches, so every attempt answers "did not match" — for ever,
  // while their old password quietly still works and nothing says so.
  const dek = generateDek()
  const sealed = await sealedUnderCode('alice', CODE_A, dek)
  const server = fakeRecoverServer({
    recoveryAuth: sealed.recoveryAuth,
    dek: { byPassword: await wrapDek(await aesKey(), dek), byRecovery: sealed.blob },
  })
  try {
    server.serverErrorAfter(2) // writes 1 and 2 land, then the fault
    const err = await runReset('alice', CODE_A, 'a-brand-new-password').then(
      () => null,
      (e) => e
    )
    assert.ok(err, 'the reset reported a failure')

    // The state the user is now in, asserted rather than assumed: their code is
    // spent. This is what makes "try the code again" a dead end.
    assert.notEqual(server.state.recoveryAuth, sealed.recoveryAuth, 'the verifier already rotated')
    assert.deepEqual(server.writes, ['dek', 'recovery'])

    const failure = resetFailure(failureCode(err))
    assert.equal(
      failure.retryCode,
      false,
      'a partly-applied reset must not blame the recovery code — the retry it invites cannot succeed'
    )
    assert.notEqual(failure.key, 'recovery.resetFailed', 'and it must not say "that did not match"')
    // The message that actually gets them back in: try both passwords, then
    // mint a fresh code. Distinct from account.serverError, which claims
    // nothing happened — here writes 1 and 2 demonstrably did.
    assert.equal(failure.key, 'recovery.resetInterrupted')
  } finally {
    server.restore()
  }
})
