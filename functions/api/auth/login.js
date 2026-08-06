// Password login: verify the authHash, mint a session. Login IS unlock — the
// client derived its vault key from the same password before calling here, and
// this endpoint never learns anything that could reproduce that key.

import {
  createSession,
  jsonResponse,
  passwordKey,
  publicUser,
  requireAccounts,
  setSessionCookie,
  upsertUser,
} from '../../_lib/session.js'
import { isSameOriginBrowserRequest } from '../../_lib/gate.js'
import { makeFloodBrake } from '../../_lib/ratelimit.js'
import { dummyRecord, fromBase64, verifyAuth } from '../../_lib/password.js'

const MAX_BODY_BYTES = 4_096

// Skip the user-record write on a login that doesn't need one. Every
// SUCCESSFUL login costs at least one KV write (the session, via
// createSession — there is no way around that one). Before this guard it
// ALSO cost a second write every time, unconditionally, because login called
// upsertUser() the same way the Google callback does. But unlike Google,
// login carries no fresh profile fields (no name/email/picture from a login
// attempt) — that write only ever refreshed `lastSeenAt`, a field nothing in
// this repo reads (grep it: functions/api/prefs.js:42 also writes it, and
// there are zero readers). So it was a pure write-budget cost for no
// observable benefit. refreshAfterMs makes upsertUser() a no-op read when the
// existing record is already fresh — see functions/_lib/session.js.
//
// Net KV-write cost of a successful login: 1 row (session only) in the
// common case — this account was already touched within the last day. 2 rows
// (session + user) in the cold case — first login of the day for this
// account, or the very first login after registration.
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000 // ~24h: "seen recently enough that re-stamping it teaches nobody anything"

// Per IP, deliberately NOT per username: a per-username throttle would let
// anyone lock a victim out by failing logins on their behalf.
//
// This is calibrated on writes, not on guessing — the same correction as
// register.js's brake, and for the same underlying reason: PBKDF2 at 600k
// client + 1k server rounds already makes credential guessing a non-starter
// (see password.js), so a per-IP attempt cap buys little there. What it
// actually bounds is the free plan's 1000-writes/day KV budget. A FAILED
// login costs zero writes (both failure paths return before any write — see
// the oracle-property comment below), so the only writes that matter here
// are from a caller who keeps succeeding, e.g. one IP hammering its OWN
// valid account: at the old 10/min cap, with the old always-write
// upsertUser() call, that was 10 x 2 = 20 writes/min = 1200/hour — over
// budget in under an hour, which is the failure this brake exists to
// prevent. At 5/5min with the write-skip above, the same sustained pattern
// costs at most 2 writes for the first hit of a given day and 1 write for
// every hit after that inside the same day, i.e. roughly 1 write/attempt in
// steady state — capping one IP at ~1440 writes/day if it never stops, which
// is still a meaningful slice of the daily budget from a single address, and
// NOT eliminated by this change. The session write is irreducible per login;
// a sustained attacker who stays just under this per-isolate, per-colo brake
// (see functions/_lib/ratelimit.js) can still consume real budget over a
// full day. The correct fix is per-caller quota enforcement in the
// rate-limiter Durable Object this project already has (the LIMITER service
// binding — see limiter/src/index.js and functions/api/generate.ts's use of
// it) — deliberately not wired up here in v1. This brake is a stopgap against
// the worst, easiest case, not the real control.
//
// Ordering note: like register.js, this checks the brake AFTER body
// parsing and validation, not before — the inverse of share.js's order
// (brake first, body read second). That is deliberate here too: a stream of
// malformed junk should not lock out humans from the only path that writes.
// If you are comparing this file to share.js and wondering why the order
// differs, that is why — not an oversight.
const overRateLimit = makeFloodBrake({ windowMs: 300_000, max: 5 })

const failure = () =>
  // One message for "no such user" and "wrong password": anything more
  // specific turns this endpoint into a username oracle.
  jsonResponse({ error: 'That username and password did not match.', code: 'bad-credentials' }, 401)

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
  const authHash = fromBase64(body?.authHash)
  if (!username || !authHash || authHash.length !== 32) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  // Test-only escape hatch — see the identical seam and rationale in
  // register.js. Production never sets it.
  if (!env.AUTH_TEST_BYPASS_RATE_LIMIT && overRateLimit(request)) {
    return jsonResponse({ error: 'Too many attempts — wait a few minutes and try again.', code: 'rate-limited' }, 429)
  }

  const userId = `local:${username}`
  let user, sessionId
  try {
    const recordRaw = await env.ACCOUNTS.get(passwordKey(userId))
    let record = dummyRecord()
    if (recordRaw) {
      try {
        record = JSON.parse(recordRaw)
      } catch {
        record = dummyRecord()
      }
    }

    const valid = await verifyAuth(record, authHash)
    // `!recordRaw` and `!valid` are answering two different questions, and
    // BOTH must gate the same return: `!recordRaw` rejects a username that
    // does not exist; `!valid` rejects a real username with the wrong
    // credential. The load-bearing part is that verifyAuth() runs — and this
    // line waits for it — on EVERY request, real user or not (see
    // dummyRecord() in password.js for what makes that record cost the same
    // PBKDF2 run as a real one). That is what keeps "no such user" from
    // answering faster than "wrong password". The obviously-safe-looking
    // refactor — hoisting `if (!recordRaw) return failure()` up above the
    // verifyAuth() call, to "avoid pointless work for a nonexistent user" —
    // reads as a harmless early-out and silently restores that timing
    // oracle. Nothing here would catch it: the oracle-freeness test in
    // auth-endpoints.test.mjs only compares response BODIES. The timing
    // regression test in auth-endpoints.unit.test.mjs is what catches it.
    if (!valid || !recordRaw) return failure()

    user = await upsertUser(env, { provider: 'local', subject: username, refreshAfterMs: REFRESH_AFTER_MS })
    sessionId = await createSession(env, user.id)
  } catch {
    // Same idiom as google/callback.js and register.js: an unexpected KV or
    // crypto failure gets our own JSON shape, not a bare platform 500.
    return jsonResponse({ error: 'Something went wrong signing you in — try again.', code: 'server-error' }, 500)
  }

  return jsonResponse({ user: publicUser(user) }, 200, { 'Set-Cookie': setSessionCookie(sessionId) })
}
