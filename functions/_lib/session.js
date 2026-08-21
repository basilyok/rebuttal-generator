// Session and account storage, shared by every /api/auth endpoint.
//
// Sessions live in KV under session:<id> with a TTL, and the browser holds only
// an opaque random id in an HttpOnly cookie. Nothing about the user is stored in
// the cookie, so there is no token to forge — an attacker needs a live KV entry.
//
// IMPORTANT: this module deliberately knows nothing about API keys. Those live in
// vault:<id> as ciphertext the server cannot decrypt (see src/vault.ts). Keep it
// that way: the moment this file can read a provider key, the app becomes a
// custodian of credentials that spend the user's money.

const SESSION_COOKIE = 'rb_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
/** OAuth round-trips are short; anything older is a stale or replayed callback. */
export const OAUTH_TTL_SECONDS = 600

export const sessionKey = (id) => `session:${id}`
export const userKey = (id) => `user:${id}`
export const vaultKey = (id) => `vault:${id}`
export const historyKey = (id) => `history:${id}`
export const passwordKey = (id) => `password:${id}`
export const oauthKey = (state) => `oauth:${state}`
/** The DEK wrapped twice — under the password key and under the recovery key. */
export const dekKey = (id) => `dek:${id}`
/** The verifier for the recovery code, shaped exactly like the password record. */
export const recoveryKey = (id) => `recovery:${id}`

/** URL-safe random token. 32 bytes is well past guessing range. */
export function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return base64Url(buf)
}

export function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

/** Every auth endpoint needs the binding; without it the feature is simply off. */
export function requireAccounts(env) {
  if (!env.ACCOUNTS) {
    return jsonResponse(
      { error: 'Accounts are not configured on this deployment.', configured: false },
      501
    )
  }
  return null
}

/** Sign-in is only available when the operator has provisioned OAuth credentials. */
export function googleConfigured(env) {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.ACCOUNTS)
}

function cookieAttributes(maxAgeSeconds) {
  // Lax (not Strict) because the OAuth provider redirects back here cross-site and
  // the session must survive that top-level navigation. Lax still blocks the
  // cross-site subrequests that matter for CSRF.
  return [
    `Max-Age=${maxAgeSeconds}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ')
}

export function setSessionCookie(sessionId) {
  return `${SESSION_COOKIE}=${sessionId}; ${cookieAttributes(SESSION_TTL_SECONDS)}`
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; ${cookieAttributes(0)}`
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || ''
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}

/** The version a session must carry to be current. One reader, one writer, one rule. */
export const credentialVersionOf = (record) =>
  Number.isInteger(record?.credentialVersion) ? record.credentialVersion : 0

/**
 * Mint a session for an already-authenticated user.
 *
 * Takes the user RECORD, not the id: the stamped version and the id must come
 * from the same record, and a signature letting a caller supply one without the
 * other invites a session stamped 0 against a non-zero account — which
 * getSession rejects on the next request, producing a sign-in loop with no
 * error anywhere to find it by (successful sign-in, immediate sign-out, no
 * non-200, no log line). Deriving both here makes that unrepresentable rather
 * than merely discouraged.
 *
 * LIMITATION — the invalidation this enables is eventual, not immediate. The
 * bound is "within the KV consistency window", and a concurrent user-record
 * write can revert it: upsertUser reads-modifies-writes the user record, so a
 * read that predates a reset's bump will write the old integer back and revive
 * the sessions the reset had evicted. Reaching it needs a >24h-idle local login
 * (the only path whose refreshAfterMs guard lets the write fire) landing inside
 * the ~60s window right after a reset. Closing it properly means a dedicated
 * credver:<id> key no rebuild touches, at the cost of one extra KV read on
 * every authenticated request, permanently — judged the wrong trade at this
 * scale. Accepted knowingly; revisit if resets ever become routine.
 */
export async function createSession(env, user) {
  const id = randomToken()
  // The version is stamped INTO the session, not looked up per request: that
  // is what lets a password reset invalidate every existing session by
  // bumping one integer on the user record, without an index of a user's
  // sessions (there is none, and KV cannot enumerate cheaply).
  await env.ACCOUNTS.put(
    sessionKey(id),
    JSON.stringify({ userId: user.id, createdAt: Date.now(), credentialVersion: credentialVersionOf(user) }),
    { expirationTtl: SESSION_TTL_SECONDS }
  )
  return id
}

/**
 * Resolve the caller's session, or null. Returns the user record too, since every
 * caller needs it and it saves a second KV read.
 */
export async function getSession(request, env) {
  if (!env.ACCOUNTS) return null
  const sessionId = readCookie(request, SESSION_COOKIE)
  if (!sessionId) return null

  const raw = await env.ACCOUNTS.get(sessionKey(sessionId))
  if (!raw) return null

  let session
  try {
    session = JSON.parse(raw)
  } catch {
    return null
  }
  if (!session?.userId) return null

  const userRaw = await env.ACCOUNTS.get(userKey(session.userId))
  if (!userRaw) return null

  try {
    const user = JSON.parse(userRaw)
    // Absent on both sides means "never reset" — existing records need no
    // backfill, and a session minted before this field existed still works.
    const stamped = credentialVersionOf(session)
    // The two sides are treated ASYMMETRICALLY on purpose. A junk value on the
    // session collapses to 0, which is the strictest reading and rejects it.
    // The same collapse on the USER record would read as "never reset" and
    // admit every session — switching the mechanism off silently on exactly
    // the one account whose record went bad, which is the invisible-failure
    // shape this whole field exists to avoid. So the user side fails closed:
    // present-but-not-an-integer is unreadable, not zero.
    const raw = user.credentialVersion
    if (raw !== undefined && !Number.isInteger(raw)) return null
    const current = Number.isInteger(raw) ? raw : 0
    // `stamped > current` is accepted deliberately: that direction means the
    // user record went BACKWARDS (a stale read, or a restore), and refusing a
    // session that proved a newer credential would lock out the person the
    // reset was for.
    if (stamped < current) return null // credentials changed since this session was minted
    return { sessionId, userId: session.userId, user }
  } catch {
    return null
  }
}

export async function destroySession(env, sessionId) {
  if (sessionId) await env.ACCOUNTS.delete(sessionKey(sessionId))
}

/**
 * Create or update the user record for a verified identity.
 *
 * The id is namespaced by provider so two providers asserting the same subject can
 * never collide, and so adding Meta/Apple later cannot silently merge accounts.
 * Only fields we explicitly name are persisted — never the raw provider payload,
 * which carries more personal data than this app has any reason to keep.
 *
 * `refreshAfterMs` is an opt-in write-avoidance guard: when given, and the
 * existing record's `lastSeenAt` is already newer than that window, this
 * skips the `put` entirely and returns the existing record instead. It
 * exists because `lastSeenAt` has no reader anywhere in this repo today — a
 * write that only refreshes it is pure KV write-budget cost with no
 * observable benefit (see functions/api/auth/login.js, which is the only
 * caller that passes it: every successful login would otherwise cost a user
 * write on top of the session write it can't avoid). Callers that omit
 * `refreshAfterMs` keep the original always-write behaviour — in particular
 * the Google callback, which must always land fresh profile fields
 * (name/email/picture) and cannot skip on staleness alone.
 *
 * IMPORTANT: when the skip fires, every field the CALLER passed this
 * invocation — email, name, picture, all of it — is silently discarded, not
 * merged. Only `id` is corrected before returning (see below); nothing else
 * from `existing` is touched. A future caller doing
 * `upsertUser(env, { ..., name: 'New Name', refreshAfterMs })` expecting
 * that name to land gets a silent no-op instead — this guard is only safe
 * for callers (like login.js) that never pass fresh fields to begin with.
 */
export async function upsertUser(env, { provider, subject, email, name, picture, refreshAfterMs }) {
  const userId = `${provider}:${subject}`
  const existingRaw = await env.ACCOUNTS.get(userKey(userId))
  let existing = null
  if (existingRaw) {
    try {
      existing = JSON.parse(existingRaw)
    } catch {
      existing = null
    }
  }

  if (
    refreshAfterMs != null &&
    existing &&
    typeof existing.lastSeenAt === 'number' &&
    Date.now() - existing.lastSeenAt < refreshAfterMs
  ) {
    // `id` must always be userId (provider:subject) — never trusted from
    // storage. createSession(env, user) takes the record this function
    // returns and is a privilege-binding call: it mints a session for
    // whatever `id` that record carries. The write path (below) always
    // derives id fresh; this skip path must match, not return whatever
    // happens to already be sitting in the stored record.
    return { ...existing, id: userId }
  }

  const user = {
    id: userId,
    provider,
    email: typeof email === 'string' ? email.slice(0, 320) : existing?.email || '',
    name: typeof name === 'string' ? name.slice(0, 200) : existing?.name || '',
    picture: typeof picture === 'string' && /^https:\/\//.test(picture) ? picture.slice(0, 500) : existing?.picture || '',
    // Preferences survive re-authentication — this is what makes a language choice
    // stick across logins rather than resetting on every sign-in.
    language: existing?.language || '',
    // Survives re-authentication for a sharper reason than `language` above:
    // this integer is what invalidates sessions after a password reset, and a
    // rebuild that dropped it would silently reset it to 0 and make every
    // session the reset had killed resolve again. The failure is invisible —
    // no error, no log, just an account that quietly stops being protected.
    credentialVersion: credentialVersionOf(existing),
    createdAt: existing?.createdAt || Date.now(),
    lastSeenAt: Date.now(),
  }

  await env.ACCOUNTS.put(userKey(userId), JSON.stringify(user))
  return user
}

/** What the client is allowed to see about itself. Never leak internal fields. */
export function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    provider: user.provider,
    email: user.email,
    name: user.name,
    picture: user.picture,
    language: user.language || '',
  }
}
