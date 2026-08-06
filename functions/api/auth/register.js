// Create a password account: validate, claim the username, store the re-hashed
// credential, mint a session.
//
// The server never sees the password — only authHash, already 600,000 PBKDF2
// rounds downstream of it (src/account.ts). Password rules beyond "authHash is
// 32 bytes" cannot be enforced here; they are the client's job, by design.

import {
  createSession,
  jsonResponse,
  passwordKey,
  publicUser,
  requireAccounts,
  setSessionCookie,
  upsertUser,
  userKey,
} from '../../_lib/session.js'
import { isSameOriginBrowserRequest } from '../../_lib/gate.js'
import { makeFloodBrake } from '../../_lib/ratelimit.js'
import { fromBase64, hashAuth } from '../../_lib/password.js'

const MAX_BODY_BYTES = 4_096
// Matched against the DISPLAY form (pre-lowercasing) with the `i` flag, not
// against the already-lowercased username. Matching the lowercased form
// would let a homoglyph through: U+212A KELVIN SIGN lowercases to plain 'k'
// (JS's own case folding does this), so a display name typed with a Kelvin
// sign instead of 'K' would pass a pattern check run AFTER lowercasing, and
// then get stored verbatim as the display name rendered in the UI. Checking
// the untouched display form rejects it, because U+212A is not itself in
// [A-Za-z] under case-insensitive (`i`) matching.
//
// That protection depends on this NOT also carrying the `u` flag. Verified:
// /^[a-z0-9_-]{3,32}$/i.test('Kelvin') is false, but
// /^[a-z0-9_-]{3,32}$/iu.test('Kelvin') is true — `u` switches matching
// to full Unicode case folding, which (unlike the ASCII-only folding `i`
// alone uses) DOES map U+212A to 'k', reopening exactly the hole this
// pattern exists to close. "Modernize the regex with `u`" is a real trap:
// it reads as a harmless correctness improvement everywhere else in this
// file's spirit, and it is the one change that silently defeats this
// specific check. See the Kelvin-sign rejection test in
// tests/auth-endpoints.unit.test.mjs before touching this flag.
const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/i
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}$/

// Names that would confuse ("admin" answering someone in a thread) or collide
// with app surfaces. Checked against the lowercased name.
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'staff', 'official', 'moderator', 'mod',
  'support', 'help', 'info', 'contact', 'about', 'security', 'abuse', 'postmaster', 'webmaster',
  'api', 'www', 'mail', 'account', 'accounts', 'login', 'logout', 'register', 'signin', 'signup',
  'settings', 'me', 'user', 'users', 'google', 'rebuttal', 'anonymous', 'null', 'undefined', 'deleted',
])

// Registering writes three KV rows (credential, user, session) and the free
// plan's write budget is 1000/day — this brake is about that budget, not about
// guessing (there is nothing to guess here). It sits AFTER validation so a
// stream of malformed junk cannot lock humans out of the only path that
// actually writes. 5 per 10 minutes is generous for a household NAT and
// useless for a single-address bot.
const overRateLimit = makeFloodBrake({ windowMs: 600_000, max: 5 })

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

  const displayName = typeof body?.username === 'string' ? body.username.trim() : ''
  const username = displayName.toLowerCase()
  if (!USERNAME_PATTERN.test(displayName)) {
    return jsonResponse(
      { error: 'Usernames are 3–32 characters: letters, numbers, - or _.', code: 'username-invalid' },
      400
    )
  }
  if (RESERVED.has(username)) {
    // Same code as a taken name: reserved names ARE taken, by the app itself
    return jsonResponse({ error: 'That username is taken.', code: 'username-taken' }, 409)
  }

  const authHash = fromBase64(body?.authHash)
  if (!authHash || authHash.length !== 32) {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (email && (email.length > 320 || !EMAIL_PATTERN.test(email))) {
    return jsonResponse({ error: 'That email address does not look right.', code: 'email-invalid' }, 400)
  }

  // Test-only escape hatch: tests/auth-endpoints.test.mjs re-runs against the
  // same long-lived `wrangler pages dev` process, and local dev never sends
  // CF-Connecting-IP (verified directly: a throwaway handler under a running
  // `wrangler pages dev` logged `request.headers.get('CF-Connecting-IP')` as
  // null for a plain local request), so every caller (the suite, the
  // maintainer's browser, anything else hitting localhost) shares this
  // brake's one "unknown" bucket — a second or third consecutive run would
  // otherwise trip it. Same pattern as generate.ts's INSTANT_TEST_ECHO gate:
  // set via a gitignored .dev.vars file, and production never sets it, so
  // real traffic always passes through this brake.
  if (!env.AUTH_TEST_BYPASS_RATE_LIMIT && overRateLimit(request)) {
    return jsonResponse({ error: 'Too many attempts — wait a few minutes and try again.', code: 'rate-limited' }, 429)
  }

  // Claim check. The user record's key doubles as the uniqueness index — ids
  // are derived from the lowercased name, so no second row is needed. KV has
  // no transactions: two simultaneous registrations of one name have a
  // milliseconds-wide race, the brake above keeps that unfarmable, and losing
  // it means one of the two immediately fails to log in — annoying, not
  // dangerous. A Durable Object reservation is the v2 fix if it ever matters.
  // Note: upsertUser() below re-reads this exact key (userKey(userId)) to
  // decide new-vs-existing — the two reads are meant to agree, since they are
  // both reading the one row that IS the index. Don't "clean up" one side.
  const userId = `local:${username}`

  let user, sessionId
  try {
    if (await env.ACCOUNTS.get(userKey(userId))) {
      return jsonResponse({ error: 'That username is taken.', code: 'username-taken' }, 409)
    }

    const credential = await hashAuth(authHash)
    await env.ACCOUNTS.put(passwordKey(userId), JSON.stringify(credential))
    user = await upsertUser(env, {
      provider: 'local',
      subject: username,
      email,
      // The name keeps the case the user typed; the id is lowercased so Basil
      // and basil can never become two accounts (or two different vault keys).
      name: displayName,
    })
    sessionId = await createSession(env, user.id)
  } catch (err) {
    // A KV outage or a thrown crypto call here would otherwise surface as a
    // bare platform 500 with no JSON body — the client can only render that
    // as a blank failure. Same idiom as google/callback.js's exchange-failure
    // handling: catch it, answer with our own shape. But that shape is also
    // why it would otherwise be invisible on our side: an uncaught throw used
    // to surface in `wrangler tail` / Workers Logs and count as a failed
    // invocation; a clean caught 500 doesn't, on its own. Log a marker — the
    // error's NAME only, never the object or its message (a WebCrypto
    // DataError is the one thing on this path that could carry input detail).
    console.error('auth/register failed', err?.name)
    return jsonResponse({ error: 'Something went wrong creating your account — try again.', code: 'server-error' }, 500)
  }

  return jsonResponse({ user: publicUser(user) }, 200, { 'Set-Cookie': setSessionCookie(sessionId) })
}
