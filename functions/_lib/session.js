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
export const oauthKey = (state) => `oauth:${state}`

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

export async function createSession(env, userId) {
  const id = randomToken()
  await env.ACCOUNTS.put(sessionKey(id), JSON.stringify({ userId, createdAt: Date.now() }), {
    expirationTtl: SESSION_TTL_SECONDS,
  })
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
    return { sessionId, userId: session.userId, user: JSON.parse(userRaw) }
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
 */
export async function upsertUser(env, { provider, subject, email, name, picture }) {
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

  const user = {
    id: userId,
    provider,
    email: typeof email === 'string' ? email.slice(0, 320) : existing?.email || '',
    name: typeof name === 'string' ? name.slice(0, 200) : existing?.name || '',
    picture: typeof picture === 'string' && /^https:\/\//.test(picture) ? picture.slice(0, 500) : existing?.picture || '',
    // Preferences survive re-authentication — this is what makes a language choice
    // stick across logins rather than resetting on every sign-in.
    language: existing?.language || '',
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
