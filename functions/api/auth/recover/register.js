// Store (or replace) the recovery verifier for the CURRENTLY SIGNED-IN user.
//
// Session-authenticated, so it needs no recoveryAuth of its own — the caller has
// already proven who they are with a password. This is what first-time setup
// calls, and what "generate a new code" calls.
//
// The contrast with begin.js/complete.js is worth stating, because the two look
// alike and their threat models are opposites. Those endpoints take a username
// from an anonymous caller and must therefore be indistinguishable between "no
// such user" and "wrong code", timing included. Here there is no username in the
// body at all: the subject comes from the session cookie, so there is no oracle
// to protect and no dummy-verify to keep the paths equal. What this endpoint does
// share with them is the brake — it writes, and a signed-in caller can still burn
// the shared KV budget.
//
// It writes exactly one key. The matching byRecovery copy of the DEK is written
// separately by PUT /api/dek, and src/recovery.ts's setupRecovery() is what
// orders the two: the DEK record lands FIRST, so an interruption here leaves a
// code that verifies against nothing rather than a verifier for a code no stored
// ciphertext answers to. Do not "helpfully" write the DEK record here as well —
// that would put both halves behind one non-transactional handler and lose the
// ordering that makes setup safe to interrupt.
import { getSession, jsonResponse, requireAccounts, recoveryKey } from '../../../_lib/session.js'
import { fromBase64, hashAuth } from '../../../_lib/password.js'
import { isSameOriginBrowserRequest } from '../../../_lib/gate.js'
import { overDurableBrake } from '../../../_lib/ratelimit.js'

export async function onRequestPost({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  if (!isSameOriginBrowserRequest(request)) {
    return jsonResponse({ error: 'This endpoint only serves the Rebuttal Generator app.' }, 403)
  }

  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)
  // Recovery codes reset a password, and a Google account has none to reset.
  // Enrolling one would store a verifier that no flow can ever spend.
  if (session.user?.provider !== 'local') {
    return jsonResponse({ error: 'Recovery codes apply to password accounts only.' }, 400)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON.' }, 400)
  }
  // 32 bytes exactly — the same shape begin.js and complete.js require of the
  // value they compare against. A shorter one here would enrol a verifier those
  // endpoints reject as malformed, i.e. a code that can never be used.
  const recoveryAuth = fromBase64(body?.recoveryAuth)
  if (!recoveryAuth || recoveryAuth.length !== 32) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  // After validation, before the write — the placement vault.js and dek.js use,
  // so neither junk nor a refused request costs the shared KV write budget.
  // Subject is the account, not the IP: this is a per-account action.
  if (
    await overDurableBrake(env, request, {
      name: 'recovery-register',
      windowMs: 600_000,
      max: 10,
      subject: session.userId,
    })
  ) {
    return jsonResponse({ error: 'Too many recovery-code changes in a row — wait a moment and try again.' }, 429)
  }

  await env.ACCOUNTS.put(recoveryKey(session.userId), JSON.stringify(await hashAuth(recoveryAuth)))
  return jsonResponse({ ok: true })
}
