// Step two: with possession already proven, replace the account's credentials.
//
// Four writes, and their ORDER is the whole safety argument. KV has no
// transaction, so the account must remain fully usable on its OLD credentials
// until the very last one lands:
//
//   1. dek:       the new wrapped copies — inert until a password can open one
//   2. recovery:  the verifier for the code — inert until the password changes
//   3. password:  the new authHash      — the switch that makes it all live
//   4. user:      the credentialVersion bump — evicts the old sessions
//
// Fail anywhere in 1-3 and the old password still works and still unwraps the
// old DEK copy, so a retry converges with nothing lost. Writing password:
// first would strand a password whose DEK was never stored: an account that
// signs in but cannot decrypt anything it owns.
//
// The bump is last for the same class of reason, one step further out: a
// failure between the bump and the password write would sign every session out
// for a reset that never took effect — strictly worse than not bumping at all.
// The accepted cost of that ordering is one millisecond-wide window in the
// other direction: a login landing between writes 3 and 4 mints a session at
// the old version, which the bump then kills, bouncing that user to sign-in
// exactly once. Self-healing, and the cheaper of the two failures.
//
// Note also the bound documented on createSession in _lib/session.js:
// invalidation is eventual, within KV's consistency window, and a concurrent
// user-record write can revert it. Nothing here may assume the bump is
// immediately or permanently visible.
//
// This endpoint re-verifies the recovery code rather than trusting anything
// from begin.js. begin issues no token, so there is no state to trust — and
// giving it one would create a bearer credential for a password reset, which
// is exactly the thing this design avoids having.
import {
  credentialVersionOf,
  dekKey,
  jsonResponse,
  passwordKey,
  recoveryKey,
  requireAccounts,
  userKey,
} from '../../../_lib/session.js'
import { dummyRecord, fromBase64, hashAuth, verifyAuth } from '../../../_lib/password.js'
import { isSameOriginBrowserRequest } from '../../../_lib/gate.js'
import { makeFloodBrake, overDurableBrake } from '../../../_lib/ratelimit.js'
import { isBlob } from '../../../_lib/base64.js'

// Roomier than begin's cap: this body carries two wrapped DEK copies on top of
// the credentials. Still far below anything that could park data here.
const MAX_BODY_BYTES = 8_000
// Same bound and same reasoning as dek.js — a sanity cap, not a fit.
const MAX_FIELD = 512

// Deliberately the same brake NAME as begin.js, so the two steps share one
// counter. They are one flow to an attacker: separate counters would double
// the budget for guessing a code, since complete re-verifies it too.
const RATE = { windowMs: 600_000, max: 5 }
const overRateLimit = makeFloodBrake(RATE)

const isWrapped = (value) => !!value && isBlob(value.iv, MAX_FIELD) && isBlob(value.ciphertext, MAX_FIELD)

// Stamps version 1 rather than echoing a client-supplied version, for the
// reason spelled out in dek.js: the server validated exactly one wrap format,
// so it labels the record with that format.
const clean = (value) => ({ iv: value.iv, ciphertext: value.ciphertext, version: 1 })

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
  // Rotation is optional — omitting it keeps the existing code working — but a
  // PRESENT-and-malformed value is a client bug, not a request to skip
  // rotation. Silently ignoring it would leave the user holding a freshly
  // displayed code that never became the real one.
  const rotating = body?.recoveryAuthNext !== undefined
  const nextRecoveryAuth = rotating ? fromBase64(body.recoveryAuthNext) : null
  if (
    !username ||
    !recoveryAuth ||
    recoveryAuth.length !== 32 ||
    !newAuthHash ||
    newAuthHash.length !== 32 ||
    (rotating && (!nextRecoveryAuth || nextRecoveryAuth.length !== 32)) ||
    !isWrapped(body?.dek?.byPassword) ||
    !isWrapped(body?.dek?.byRecovery)
  ) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  // Same seam as login.js and begin.js, gating both layers.
  if (!env.AUTH_TEST_BYPASS_RATE_LIMIT) {
    if (overRateLimit(request)) return limited()
    // After validation so junk cannot burn a global slot; before the ACCOUNTS
    // read so every request does identical work up to failure().
    if (await overDurableBrake(env, request, { name: 'auth-recover', ...RATE })) return limited()
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

    // Read the user record BEFORE the first write. The bump needs it, and
    // discovering it missing after write 1 would leave the account's DEK
    // rotated with no way to finish.
    const userRaw = await env.ACCOUNTS.get(userKey(userId))
    if (!userRaw) return failure()
    const user = JSON.parse(userRaw)
    if (!user || typeof user !== 'object') return failure()

    // 1. New wrapped copies. Inert: nothing can reach them until a password
    //    that opens one exists.
    await env.ACCOUNTS.put(
      dekKey(userId),
      JSON.stringify({
        byPassword: clean(body.dek.byPassword),
        byRecovery: clean(body.dek.byRecovery),
        version: 1,
        updatedAt: Date.now(),
      })
    )

    // 2. The verifier for the code that opens copy two. When rotating, the
    //    client must not present the new code as usable until this endpoint
    //    returns success — until then the OLD code is still the one that works.
    //    When not rotating we rewrite the existing record verbatim rather than
    //    skipping: one KV write buys an unconditional, observable position in
    //    the sequence, so the ordering this file exists to guarantee cannot
    //    silently become conditional on a request field.
    await env.ACCOUNTS.put(
      recoveryKey(userId),
      rotating ? JSON.stringify(await hashAuth(nextRecoveryAuth)) : recordRaw
    )

    // 3. The switch. Everything above is inert until this lands.
    await env.ACCOUNTS.put(passwordKey(userId), JSON.stringify(await hashAuth(newAuthHash)))

    // 4. Evict every session minted under the old credentials. Last, per the
    //    header comment. `id` is re-derived rather than trusted from storage,
    //    the same rule upsertUser follows.
    await env.ACCOUNTS.put(
      userKey(userId),
      JSON.stringify({ ...user, id: userId, credentialVersion: credentialVersionOf(user) + 1 })
    )

    return jsonResponse({ ok: true })
  } catch (err) {
    // Marker only, never the object or its message — the inputs on this path
    // include the recovery code and two ciphertexts.
    console.error('auth/recover/complete failed', err?.name)
    return jsonResponse({ error: 'Something went wrong. Please try again.', code: 'server-error' }, 500)
  }
}
