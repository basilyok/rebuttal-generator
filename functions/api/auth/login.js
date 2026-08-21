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
import { makeFloodBrake, overDurableBrake } from '../../_lib/ratelimit.js'
import { dummyRecord, fromBase64, verifyAuth } from '../../_lib/password.js'

const MAX_BODY_BYTES = 4_096

// Skip the user-record write on a login that doesn't need one. Every
// SUCCESSFUL login costs at least one KV write (the session, via
// createSession — there is no way around that one). Before this guard it
// ALSO cost a second write every time, unconditionally, because login called
// upsertUser() the same way the Google callback does. But unlike Google,
// login carries no fresh profile fields (no name/email/picture from a login
// attempt) — that write only ever refreshed `lastSeenAt`, a field with no
// consumer other than the staleness guard right below (functions/api/prefs.js:42
// also writes it, on an unrelated path). So the write was pure write-budget
// cost for no observable benefit. refreshAfterMs makes upsertUser() a no-op
// read when the existing record is already fresh — see
// functions/_lib/session.js.
//
// Net KV-write cost of a successful login: 1 row (session only) whenever the
// account was already touched within the last ~24h — which includes the
// very first login right after registration, because registering ALREADY
// stamps lastSeenAt (verified directly: register() → 3 puts; an immediate
// first login() right after → 1 put). 2 rows (session + user) only once an
// account has gone genuinely stale — no login for a full ~24h (verified: force
// a stored lastSeenAt to 25h old, then login() → 2 puts).
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000 // A placeholder, not a reasoned figure: nothing reads lastSeenAt today (see above), so any window is equally "correct" — this just bounds how stale it can get if a reader ever appears.

// Per IP, deliberately NOT per username: a per-username throttle would let
// anyone lock a victim out by failing logins on their behalf.
//
// This brake is real, load-bearing defense against password guessing — not
// merely a write-budget stopgap. (This paragraph has been rewritten twice
// before and been wrong both times, including one version that dismissed
// the brake's guessing-resistance value entirely. If you're about to touch
// this again: verify the mechanism against src/account.ts and password.js
// before you change the words.) The KDF salt is
// 'rebuttal|v1|' + normalizeUsername(username) (src/account.ts) — entirely
// public and derivable from nothing but a username, with no server-side
// pepper. So a rational online attacker does NOT search authHash's raw
// 2^256 space; they guess PASSWORDS — computing
// masterKey = PBKDF2(guess, salt, 600k) then authHash = PBKDF2(masterKey,
// guess, 1) themselves (exactly what deriveCredentials() runs client-side),
// then POSTing the result here. That means the 600,000 client rounds ARE
// fully in the attacker's path, paid once per candidate: measured directly
// against deriveCredentials() (node --import tsx, this machine),
// ~254ms/candidate, ~4 guesses/sec/core. That cost — not this brake, and
// not the server's own re-hash — is the primary defense against a strong
// password. SERVER_ITERATIONS = 1,000 adds only ~1ms on top of a
// derivation that already cost ~254ms; it is real for making a KV dump
// non-replayable (see password.js's header comment), not for slowing an
// online guesser.
//
// So why does a per-IP cap on top of a ~4-guesses/sec/core wall matter?
// Because PASSWORD_MIN_LENGTH (10 chars, src/account.ts) is enforced
// CLIENT-SIDE ONLY — register.js's own header comment says so explicitly —
// so nothing stops a caller who skips the browser and talks to this API
// directly from registering a short, dictionary-guessable password. For
// that account the 600k-round wall still taxes every guess, but a weak
// enough password can sit inside a small enough dictionary that "~4/sec"
// adds up. The brakes here are the only server-side limit on how many
// candidates one address can throw at any single password, and they come in
// two layers with different guarantees. This in-memory one: 5 per 5
// minutes, ~1440 login submissions/day — per ISOLATE, so for a caller who
// reaches multiple colos (or waits out isolate recycling) it is a floor,
// not a cap. The durable one (overDurableBrake below, backed by the LIMITER
// Durable Object): the same 5/5min counted once, globally, atomically —
// that IS a cap, for as long as the limiter is up. When it isn't, the
// durable check fails open (see ratelimit.js for why that direction) and
// the per-isolate floor is what remains.
//
// It also bounds something unrelated: the free plan's 1000-writes/day KV
// budget. A FAILED login costs zero writes (both failure paths return
// before any write — see the oracle-property comment below), so the only
// writes that matter here are from a caller who keeps succeeding, e.g. one
// IP hammering its OWN valid account: at the old 10/min cap, with the old
// always-write upsertUser() call, that was 10 x 2 = 20 writes/min =
// 1200/hour — over budget in under an hour, which is one of the failures
// this brake exists to prevent. At 5/5min with the write-skip above, that
// same sustained pattern costs roughly 1 write/attempt in steady state
// (occasional 2-write hits, when a gap exceeds ~24h, are a rounding error
// against the volume below) — about 5 x 12 x 24 = 1440 writes/day if one
// address never stops. For this in-memory brake alone that number is a
// FLOOR, not a cap: it is per-isolate and per-colo (see
// functions/_lib/ratelimit.js), so a caller reaching multiple edge
// locations clears multiple independent 5/5min buckets in parallel — real
// damage can exceed it. The durable layer (overDurableBrake below, backed
// by the LIMITER Durable Object — the v2 item earlier versions of this
// comment tracked from docs/superpowers/plans/2026-08-05-password-accounts.md;
// it shipped here) closes exactly that gap: one global atomic 5/5min window
// per address makes 1440/day a genuine per-address CEILING — but ONLY while
// the limiter is healthy, because the durable check fails open on any
// limiter failure (see ratelimit.js) and an outage drops us back to the
// per-isolate floor. Even AT the ceiling, 1440 against a 1000/day budget is
// 144% of it: one address running flat out exhausts the ENTIRE daily budget
// in roughly 17 hours (1000 writes / 60 writes-per-hour), not a slice of
// it. The session write is irreducible per login; neither layer eliminates
// that half of the problem — the in-memory brake narrows the window from
// under an hour to about seventeen, and the durable one keeps a distributed
// or isolate-cycling caller from shrinking it back down. For the guessing
// problem above, this pair is not a stopgap — it is the actual control, for
// as long as 5/5min per address holds.
//
// Ordering note: like register.js, this checks the brakes AFTER body
// parsing and validation, not before — the inverse of share.js's order
// (brake first, body read second). That is deliberate here too: a stream of
// malformed junk should not lock out humans from the only path that writes.
// If you are comparing this file to share.js and wondering why the order
// differs, that is why — not an oversight. Both layers follow this order;
// the durable one is additionally pinned BEFORE the per-username KV read —
// see the comment at its call site for what that placement protects.
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
  // register.js. It gates BOTH brake layers: the durable one persists in the
  // limiter's SQLite across dev-server restarts, so without the bypass a
  // test run would poison the next in a way the in-memory brake never could.
  // Production never sets it.
  if (!env.AUTH_TEST_BYPASS_RATE_LIMIT) {
    if (overRateLimit(request)) {
      return jsonResponse({ error: 'Too many attempts — wait a few minutes and try again.', code: 'rate-limited' }, 429)
    }
    // Durable layer, consulted only once the free in-memory check passes.
    // Placement is load-bearing: it sits BEFORE the ACCOUNTS read below so
    // every request — real username or not — does identical work in the same
    // order up to the failure() line, keeping the durable subrequest's
    // latency out of the timing-oracle picture entirely; and AFTER
    // validation, so malformed junk cannot burn a global slot. Same 429
    // shape as the in-memory path on purpose: the client mapping cannot and
    // should not tell the layers apart.
    if (await overDurableBrake(env, request, { name: 'auth-login', windowMs: 300_000, max: 5 })) {
      return jsonResponse({ error: 'Too many attempts — wait a few minutes and try again.', code: 'rate-limited' }, 429)
    }
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
    sessionId = await createSession(env, user)
  } catch (err) {
    // Same idiom as google/callback.js and register.js: an unexpected KV or
    // crypto failure gets our own JSON shape, not a bare platform 500. But
    // that shape is also why it would otherwise be invisible: before this
    // catch existed, an uncaught throw here surfaced in `wrangler tail` /
    // Workers Logs and counted as a failed invocation; now it returns a
    // clean 500 and produces zero platform signal on its own. Log a marker so
    // it isn't silent — the error's NAME only, never the object or its
    // message: a WebCrypto DataError is the one thing on this path that
    // could carry input-derived detail.
    console.error('auth/login failed', err?.name)
    return jsonResponse({ error: 'Something went wrong signing you in — try again.', code: 'server-error' }, 500)
  }

  return jsonResponse({ user: publicUser(user) }, 200, { 'Set-Cookie': setSessionCookie(sessionId) })
}
