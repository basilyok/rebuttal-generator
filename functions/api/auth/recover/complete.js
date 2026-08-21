// Step two: with possession already proven, replace the account's credentials.
//
// Four writes, and their ORDER is the whole safety argument:
//
//   1. dek:       the new wrapped copies, PLUS the old pair under `previous`
//   2. recovery:  the verifier for the new code
//   3. password:  the new authHash — the switch that makes the new era live
//   4. user:      the credentialVersion bump — evicts the old sessions
//
// KV has no transaction, so every intermediate state must be openable by some
// credential the user actually holds. Getting that right needs `previous`, and
// the reason is worth stating precisely, because an earlier version of this
// comment stated the opposite and was wrong in the one direction that loses
// data (see the correction block in
// docs/superpowers/specs/2026-08-13-password-recovery-design.md):
//
// Write 1 does not ADD the new copies, it OVERWRITES the record. Without
// `previous`, the window between writes 1 and 2 is a vault nobody can open:
// the old password still authenticates (password: has not moved) but
// byPassword is now sealed under the NEW password key; the old code still
// verifies (recovery: has not moved) but byRecovery is now sealed under the
// NEW code; and the new code cannot even reach begin's 200, because its
// verifier has not landed. A client that crashed, dropped the network or
// closed the tab there would leave the vault permanently unopenable — in the
// feature whose entire purpose is not losing the vault.
//
// The trap is that authentication and decryption are separate things. The old
// credentials keep signing in throughout, which is exactly what makes "the old
// password still works, so the account is intact" look true while the
// ciphertext it points at has already moved to the new key era. Sign-in is not
// evidence of anything here.
//
// Carrying the old pair under `previous` makes the ordering argument true
// rather than merely stated: at every point in the sequence, at least one of
// the four stored copies is sealed under a credential the caller still holds.
// Writing password: first would still be wrong for the original reason —
// it would strand a password whose DEK was never stored.
//
// The bump is last for the same class of reason, one step further out: a
// failure between the bump and the password write would sign every session out
// for a reset that never took effect — strictly worse than not bumping at all.
// The accepted cost of that ordering is a window in the other direction: a
// login landing between writes 3 and 4 mints a session at the old version,
// which the bump then kills, bouncing that user to sign-in exactly once.
// Self-healing, and the cheaper of the two failures. It is not as narrow as it
// looks — write 4 re-reads the user record first (see there), so the gap spans
// a KV read as well as the gap between two writes, which at the edge is tens
// of milliseconds rather than one. Still small, still self-healing; just not
// the "millisecond-wide" an earlier version of this comment claimed, written
// before that read existed.
//
// Note also the bound documented on createSession in _lib/session.js:
// invalidation is eventual, within KV's consistency window, and a concurrent
// user-record write can revert it. Nothing here may assume the bump is
// immediately or permanently visible.
//
// Before any of the four, one refusal: an account with a blob still sealed
// under the master key this reset would replace is turned away with 409
// `not-migrated`, having written nothing. That check lives here rather than in
// the browser because the browser cannot make it — every reset is signed-out,
// and a signed-out client's blob reads are 401s it reads as absence. See
// strandedByReset below.
//
// This endpoint re-verifies the recovery code rather than trusting anything
// from begin.js. begin issues no token, so there is no state to trust — and
// giving it one would create a bearer credential for a password reset, which
// is exactly the thing this design avoids having.
import {
  credentialVersionOf,
  dekKey,
  historyKey,
  jsonResponse,
  passwordKey,
  recoveryKey,
  requireAccounts,
  userKey,
  vaultKey,
} from '../../../_lib/session.js'
import { dummyRecord, fromBase64, hashAuth, verifyAuth } from '../../../_lib/password.js'
import { isSameOriginBrowserRequest } from '../../../_lib/gate.js'
import { overDurableBrake } from '../../../_lib/ratelimit.js'
import { RECOVER_BRAKE_NAME, RECOVER_RATE, overRecoverFlood } from '../../../_lib/recoverbrake.js'
import { cleanWrapped, isWrapped } from '../../../_lib/base64.js'

// Roomier than begin's cap: this body carries two wrapped DEK copies on top of
// the credentials. Still far below anything that could park data here.
const MAX_BODY_BYTES = 8_000

/**
 * The `previous` field for write 1: the stored pair, or null if there is not a
 * usable one.
 *
 * WHAT BOUNDS THE CHAIN is the two-field object literal this returns. `previous`
 * sits at the record's TOP level, so naming exactly byPassword and byRecovery
 * here is what drops the incoming record's own `previous` — along with every
 * other field it may have grown. Swap the cleanWrapped() calls below for raw
 * copies and the depth is still 1; delete a field from this return and it is
 * not. cleanWrapped() is a real second bound (it would catch a `previous`
 * nested INSIDE a copy) but it is not the one doing the work, and an earlier
 * version of this comment credited it alone — the exact way a comment survives
 * the refactor it was written to prevent.
 */
function previousPair(raw) {
  if (!raw) return null
  let record
  try {
    record = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isWrapped(record?.byPassword) || !isWrapped(record?.byRecovery)) return null
  return { byPassword: cleanWrapped(record.byPassword), byRecovery: cleanWrapped(record.byRecovery) }
}

/**
 * The era every blob must already be in before a reset may touch this account.
 * Mirrors BLOB_VERSION_DEK in src/vault.ts; duplicated rather than imported
 * because nothing crosses the functions/src boundary, and pinned as a literal
 * because a v3 era would need its own decision here, not a silent inheritance.
 */
const DEK_ERA = 2

/**
 * Is this stored blob one a reset would strand?
 *
 * A reset replaces the master key and KEEPS the DEK, so a blob still sealed
 * under the old master key is left with no key at all — permanently, and
 * silently, since nothing fails until the day the user opens it.
 *
 * HOW A ZERO-KNOWLEDGE SERVER IS ALLOWED TO ASK. `version` is a plaintext field
 * beside the ciphertext, written by vault.js and history.js from the client's
 * own tag; it names which key era sealed the blob and reveals nothing about the
 * content. Reading it here does not weaken the posture that this server cannot
 * open anything it stores.
 *
 * Absent record: nothing to strand, so nothing to refuse. Present with any
 * readable version other than DEK_ERA — including a record written before
 * tagging, which vault.js stores as version 1 — is a refusal.
 *
 * A record that is not a usable object — bytes that will not parse, or that
 * parse to `null`, a string or an array — proceeds, and that direction is
 * deliberate rather than lax. Nothing there is openable by anybody already, so
 * a reset cannot make it worse; refusing instead would permanently lock the one
 * caller who by definition cannot sign in to clear it out of the only escape
 * this feature offers. Unknown falls on the not-migrated side everywhere it
 * describes a blob we could still lose — this is the one place where it does
 * not, because there is nothing left to lose.
 *
 * The `typeof` test is load-bearing, not defensive padding: JSON.parse('null')
 * SUCCEEDS, so without it the literal bytes `null` would take the refuse branch
 * while `{not json` took the proceed branch — the exact opposite of what the
 * paragraph above describes, and the kind of split a reader would never guess
 * from either the code or the comment.
 */
function strandedByReset(raw) {
  if (!raw) return false
  let record
  try {
    record = JSON.parse(raw)
  } catch {
    return false
  }
  // Array.isArray is not padding either: `typeof [] === 'object'`, so an array
  // would otherwise reach the version test, miss, and refuse — while carrying
  // no blob and no era. Anything that is not a plain object is not a record.
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false
  return record.version !== DEK_ERA
}

const notMigrated = () =>
  // A distinct code, and safe to be distinct: it is reachable only AFTER the
  // recovery code has verified, so it tells an unauthenticated guesser nothing
  // about which accounts exist or which are mid-migration. Placed anywhere
  // above verifyAuth it would be exactly that oracle.
  jsonResponse(
    {
      error: 'Recovery setup has not finished on this account yet.',
      code: 'not-migrated',
    },
    409
  )

const failure = () =>
  // Byte-identical to begin.js's, and for the same reason: this endpoint
  // re-verifies the code, so it is a second guessing surface and must not be a
  // more informative one.
  jsonResponse({ error: 'That username and recovery code did not match.', code: 'bad-credentials' }, 401)

const limited = () =>
  jsonResponse({ error: 'Too many attempts — wait a few minutes and try again.', code: 'rate-limited' }, 429)

export async function onRequestPost({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  if (!isSameOriginBrowserRequest(request)) {
    return jsonResponse({ error: 'This endpoint only serves the Rebuttal Generator app.' }, 403)
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return jsonResponse({ error: 'Malformed request.' }, 400)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : ''
  const recoveryAuth = fromBase64(body?.recoveryAuth)
  const newAuthHash = fromBase64(body?.authHash)
  // Rotation is REQUIRED, validated exactly like authHash beside it. An
  // optional branch here used to keep the old verifier by rewriting it
  // verbatim, and it was wrong three ways: a captured body stayed replayable
  // forever because the verifier never moved; the write sequence this file
  // exists to guarantee became conditional on a request field; and the filler
  // wrote back bytes captured before three other writes, so a concurrent
  // rotation could be silently rolled back. It was also dead — the client
  // types this field as required and always sends it.
  const nextRecoveryAuth = fromBase64(body?.recoveryAuthNext)
  if (
    !username ||
    !recoveryAuth ||
    recoveryAuth.length !== 32 ||
    !newAuthHash ||
    newAuthHash.length !== 32 ||
    !nextRecoveryAuth ||
    nextRecoveryAuth.length !== 32 ||
    !isWrapped(body?.dek?.byPassword) ||
    !isWrapped(body?.dek?.byRecovery)
  ) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  // Same seam as login.js and begin.js, gating both layers.
  if (!env.AUTH_TEST_BYPASS_RATE_LIMIT) {
    // Both layers are begin.js's — see _lib/recoverbrake.js for why the two
    // steps must count into one budget rather than two.
    if (overRecoverFlood(request)) return limited()
    // After validation so junk cannot burn a global slot; before the ACCOUNTS
    // read so every request does identical work up to failure().
    if (await overDurableBrake(env, request, { name: RECOVER_BRAKE_NAME, ...RECOVER_RATE })) return limited()
  }

  const userId = `local:${username}`
  try {
    const recordRaw = await env.ACCOUNTS.get(recoveryKey(userId))
    let record = dummyRecord()
    if (recordRaw) {
      try {
        record = JSON.parse(recordRaw)
      } catch {
        record = dummyRecord()
      }
    }
    // As in begin.js and login.js: verifyAuth runs on every request. No early
    // return may be hoisted above it.
    const valid = await verifyAuth(record, recoveryAuth)
    if (!recordRaw || !valid) return failure()

    // Check the user record exists BEFORE the first write: discovering it
    // missing after write 1 would leave the account's DEK rotated with no way
    // to finish. The record read here is deliberately NOT the one write 4
    // uses — see there.
    //
    // A verified recovery code with no user record is an inconsistent account,
    // not a credential mismatch, and saying 'bad-credentials' here would be a
    // lie about what just happened. It is safe to be honest: possession is
    // already proven at this point, so a distinct status reveals nothing to
    // anyone who has not already passed the gate.
    if (!(await env.ACCOUNTS.get(userKey(userId)))) {
      console.error('auth/recover/complete: verified code for an account with no user record')
      return jsonResponse({ error: 'Something went wrong. Please try again.', code: 'server-error' }, 500)
    }

    // REFUSE A RESET THAT WOULD ORPHAN A BLOB. Two reads, before the first
    // write, and the only place this invariant can actually live.
    //
    // The client has a matching check and it is inert on this path: every reset
    // is signed-out, /api/vault and /api/history answer 401 to a signed-out
    // caller, and both client transports fold 401 into null — which the
    // predicate reads as "no blobs, therefore migrated". It returns true
    // unconditionally for the exact caller it was written to stop. See the
    // guard comment in runReset (src/recovery.ts).
    //
    // The state this catches is not hypothetical. setupRecovery writes the
    // verifier BEFORE it migrates, so an interruption there leaves a user
    // holding a code that works and a blob still at v1 — a working code is
    // precisely what gets someone to this endpoint. Reset that account and the
    // master key changes while the v1 blob keeps pointing at it: orphaned, with
    // no second copy anywhere.
    //
    // Priced in the plan at "two extra KV reads on an operation that happens
    // roughly once per account per lifetime", and it buys the only enforcement
    // there is. Both reads are issued together — they are independent, and this
    // is a latency path a user is already waiting on.
    const [vaultRaw, historyRaw] = await Promise.all([
      env.ACCOUNTS.get(vaultKey(userId)),
      env.ACCOUNTS.get(historyKey(userId)),
    ])
    if (strandedByReset(vaultRaw) || strandedByReset(historyRaw)) return notMigrated()

    // The pair the caller's CURRENT credentials open. Read before any write,
    // because write 1 is what destroys it. Kept deliberately lenient: a record
    // that will not parse, or that does not hold a usable pair, becomes null
    // rather than an error. Refusing the reset in that case would strand the
    // one account that most needs it — an unopenable dek: record is precisely
    // the state a reset exists to escape, and preserving unusable bytes buys
    // nobody anything.
    const previous = previousPair(await env.ACCOUNTS.get(dekKey(userId)))

    // 1. The new wrapped copies, carrying the old pair. See the header: this
    //    OVERWRITES, so `previous` is the only thing standing between a
    //    mid-sequence failure and a permanently unopenable vault.
    await env.ACCOUNTS.put(
      dekKey(userId),
      JSON.stringify({
        byPassword: cleanWrapped(body.dek.byPassword),
        byRecovery: cleanWrapped(body.dek.byRecovery),
        previous,
        version: 1,
        // Only this record is stamped. The password: and recovery: records
        // carry no timestamp because hashAuth() owns their shape and nothing
        // reads a date off them; this one is a plain document written by two
        // different endpoints (here and PUT /api/dek), where "which write won"
        // is a question a human debugging a half-finished reset will ask.
        updatedAt: Date.now(),
      })
    )

    // 2. The verifier for the code that opens copy two. The client must not
    //    present the new code as usable until this endpoint returns success —
    //    until then the OLD code is still the one that works.
    await env.ACCOUNTS.put(recoveryKey(userId), JSON.stringify(await hashAuth(nextRecoveryAuth)))

    // 3. The switch. Everything above is inert until this lands.
    await env.ACCOUNTS.put(passwordKey(userId), JSON.stringify(await hashAuth(newAuthHash)))

    // 4. Evict every session minted under the old credentials. Last, per the
    //    header comment.
    //
    //    Re-read rather than reusing the copy fetched before write 1. That
    //    copy is three writes old by now, and this is a read-modify-write over
    //    the whole record: a concurrent upsertUser (a Google callback landing
    //    fresh profile fields, say) would be clobbered wholesale, and a
    //    concurrent complete's bump would be overwritten with a stale integer.
    //    Re-reading does not make it atomic — KV has no compare-and-swap, so
    //    the window shrinks from three writes wide to one read wide and cannot
    //    be closed here. What keeps that residue survivable is the `previous`
    //    pair from write 1: an unlucky interleave between TWO resets costs a
    //    re-run, not a vault.
    //
    //    Between three it can still cost a vault, and the honest accounting
    //    should say so: history is one generation deep, so A's copies survive
    //    B overwriting them but not C as well. Interleave A B C and then let A
    //    retry, and A's original pair is two generations back — discarded.
    //    Reaching it needs three concurrent resets of ONE account, which needs
    //    the account's recovery code three times over; not worth engineering
    //    against, but not worth pretending away either.
    //
    //    `id` is re-derived rather than trusted from storage, the same rule
    //    upsertUser follows.
    const freshRaw = await env.ACCOUNTS.get(userKey(userId))
    const fresh = freshRaw ? JSON.parse(freshRaw) : {}
    await env.ACCOUNTS.put(
      userKey(userId),
      JSON.stringify({ ...fresh, id: userId, credentialVersion: credentialVersionOf(fresh) + 1 })
    )

    return jsonResponse({ ok: true })
  } catch (err) {
    // Marker only, never the object or its message — the inputs on this path
    // include the recovery code and two ciphertexts.
    console.error('auth/recover/complete failed', err?.name)
    return jsonResponse({ error: 'Something went wrong. Please try again.', code: 'server-error' }, 500)
  }
}
