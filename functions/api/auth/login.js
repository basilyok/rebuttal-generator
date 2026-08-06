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
import { fromBase64, verifyAuth } from '../../_lib/password.js'

const MAX_BODY_BYTES = 4_096

// Per IP, deliberately NOT per username: a per-username throttle would let
// anyone lock a victim out by failing logins on their behalf. 10/minute
// absorbs fat-fingered retries without opening a guessing window that matters
// against a 600k-round derivation.
const overRateLimit = makeFloodBrake({ windowMs: 60_000, max: 10 })

// A syntactically-valid record to verify against when the username does not
// exist, so both failure paths cost one PBKDF2 run — otherwise the fast
// "no such user" path would be a username oracle by timing. The hash decodes
// to exactly 32 bytes (a real PBKDF2-SHA256 digest length), so verifyAuth's
// length check never short-circuits it — confirmed empirically, see PW Task 3
// notes.
const DUMMY_RECORD = {
  salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
  hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  iterations: 1_000,
}

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

  if (overRateLimit(request)) {
    return jsonResponse({ error: 'Too many attempts — wait a minute and try again.', code: 'rate-limited' }, 429)
  }

  const userId = `local:${username}`
  const recordRaw = await env.ACCOUNTS.get(passwordKey(userId))
  let record = DUMMY_RECORD
  if (recordRaw) {
    try {
      record = JSON.parse(recordRaw)
    } catch {
      record = DUMMY_RECORD
    }
  }

  const valid = await verifyAuth(record, authHash)
  if (!valid || !recordRaw) return failure()

  // The same call the Google callback makes on every sign-in: refreshes
  // lastSeenAt and preserves everything else (name, email, language) through
  // upsertUser's existing-field discipline.
  const user = await upsertUser(env, { provider: 'local', subject: username })

  const sessionId = await createSession(env, user.id)
  return jsonResponse({ user: publicUser(user) }, 200, { 'Set-Cookie': setSessionCookie(sessionId) })
}
