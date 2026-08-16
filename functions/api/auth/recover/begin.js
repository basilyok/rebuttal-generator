// Step one of a password reset: prove possession of the recovery code, and
// receive the copy of the DEK that code can open.
//
// This endpoint is the brute-force surface of the whole feature, so it is
// modelled on login.js line for line: an identical failure for "no such user"
// and "wrong code", a dummyRecord() verify on the miss path so both cost the
// same PBKDF2, and the durable brake placed before any ACCOUNTS read so every
// request does the same work in the same order. Read login.js's brake comment
// for the full argument — none of it is restated here, and all of it applies.
//
// It writes nothing. That is deliberate and worth keeping: a caller who cannot
// prove possession of anything must not be able to spend the shared KV write
// budget, and there is no reason a read-only proof step needs to.
import { jsonResponse, requireAccounts, recoveryKey, dekKey } from '../../../_lib/session.js'
import { fromBase64, verifyAuth, dummyRecord } from '../../../_lib/password.js'
import { isSameOriginBrowserRequest } from '../../../_lib/gate.js'
import { overDurableBrake } from '../../../_lib/ratelimit.js'
import { RECOVER_BRAKE_NAME, RECOVER_RATE, overRecoverFlood } from '../../../_lib/recoverbrake.js'

const MAX_BODY_BYTES = 4_000

const failure = () =>
  // One message for every rejection — unknown username, wrong code, and an
  // account with no DEK record to release. Anything more specific turns this
  // endpoint into an oracle for which usernames exist and which have recovery
  // configured.
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
  if (!username || !recoveryAuth || recoveryAuth.length !== 32) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  // Same seam and reasoning as login.js: it gates BOTH layers, because the
  // durable one persists in the limiter's SQLite across dev-server restarts and
  // would otherwise let one test run poison the next. Production never sets it.
  if (!env.AUTH_TEST_BYPASS_RATE_LIMIT) {
    // Both layers come from _lib/recoverbrake.js so complete.js counts into
    // the same ones — see that file for why the two steps must share.
    if (overRecoverFlood(request)) return limited()
    // Before the ACCOUNTS read, after validation — login.js explains why both
    // halves of that placement are load-bearing.
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

    // verifyAuth runs on EVERY request, real account or not. Do not hoist an
    // early `if (!recordRaw) return failure()` above this line: it reads as a
    // harmless "skip pointless work" refactor and silently turns response time
    // into a username oracle. Same argument as login.js, and the derivation
    // count assertion in tests/recover-endpoints.test.mjs is what catches it.
    const valid = await verifyAuth(record, recoveryAuth)
    if (!recordRaw || !valid) return failure()

    const dekRaw = await env.ACCOUNTS.get(dekKey(userId))
    if (!dekRaw) return failure() // code verified, but nothing to recover
    let dek
    try {
      dek = JSON.parse(dekRaw)
    } catch {
      return failure()
    }
    if (!dek?.byRecovery) return failure()

    // Only the recovery-wrapped copy. byPassword is withheld even though the
    // caller just authenticated: releasing it would hand a proven-possession
    // caller the exact ciphertext an offline password guess targets, for no
    // benefit — the reset flow rewraps a DEK it opened with the code.
    return jsonResponse({ byRecovery: dek.byRecovery })
  } catch (err) {
    // Same marker discipline as login.js: the error's NAME only, never the
    // object, its message, or anything derived from the code.
    console.error('auth/recover/begin failed', err?.name)
    return jsonResponse({ error: 'Something went wrong. Please try again.', code: 'server-error' }, 500)
  }
}
