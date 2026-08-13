// Begin Google sign-in: OAuth 2.0 Authorization Code flow with PKCE.
//
// PKCE is not strictly required for a confidential client that holds a secret, but
// it costs nothing here and closes authorization-code interception outright. The
// state and the PKCE verifier are held server-side in KV under a short TTL rather
// than in a cookie, so a stolen cookie alone cannot complete somebody's sign-in.

import { jsonResponse, oauthKey, randomToken, base64Url, googleConfigured, OAUTH_TTL_SECONDS } from '../../../_lib/session.js'
import { makeFloodBrake, overDurableBrake } from '../../../_lib/ratelimit.js'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

// This endpoint writes a KV record on every single call, and until 2026-08-11
// it did so with no authentication, no origin check and no brake — the whole
// free-plan budget of 1000 writes/day was one unauthenticated `while true`
// loop away, and exhausting it does not merely break sign-in: vault saves,
// history sync and preferences all write to the same namespace.
//
// It is NOT gated to same-origin like /api/share and /api/article. Those are
// fetches from our own page, where a browser always supplies Origin or
// Sec-Fetch-Site. This is a top-level navigation, reachable from a bookmark,
// a typed URL, or a fresh tab — none of which carry a same-origin signal, so
// the gate that fits those endpoints would break legitimate sign-in here.
// A per-address rate limit is the tool that fits a navigation.
//
// Ten starts per ten minutes per address: a person clicking "Sign in with
// Google" does it once or twice, and a stalled attempt costs one more.
const RATE = { windowMs: 600_000, max: 10 }
const overRateLimit = makeFloodBrake(RATE)

/** Send the user back to the app with a message rather than raw JSON — same
 *  shape as callback.js's failure(), because this is a navigation too. */
function failure(request, reason) {
  const url = new URL('/', new URL(request.url).origin)
  url.searchParams.set('auth_error', reason)
  return Response.redirect(url.toString(), 302)
}

async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

/** The redirect URI must match Google's console entry exactly, origin included. */
export function redirectUri(request) {
  return `${new URL(request.url).origin}/api/auth/google/callback`
}

export async function onRequestGet({ request, env }) {
  if (!googleConfigured(env)) {
    return jsonResponse({ error: 'Google sign-in is not configured on this deployment.', configured: false }, 501)
  }

  // Both brakes run BEFORE the KV write below — the whole point is to cap
  // writes, so a limited request must cost nothing. In-memory first (free,
  // per-isolate), then the durable counter (one subrequest, global), matching
  // the layering contract in _lib/ratelimit.js. Both fail open: a limiter
  // outage must never become "nobody can sign in", since sign-in is the only
  // door to the vault.
  if (overRateLimit(request) || (await overDurableBrake(env, request, { name: 'auth-start', ...RATE }))) {
    return failure(request, 'rate_limited')
  }

  const url = new URL(request.url)
  // Where to send the user afterwards. Path-only, so this cannot be turned into an
  // open redirect that bounces people to an attacker's site after a real login.
  const rawNext = url.searchParams.get('next') || '/'
  const next = /^\/(?!\/)[\w\-./?=&%]*$/.test(rawNext) ? rawNext : '/'

  const state = randomToken()
  const verifier = randomToken(48)
  const nonce = randomToken()

  await env.ACCOUNTS.put(
    oauthKey(state),
    JSON.stringify({ verifier, nonce, next, createdAt: Date.now() }),
    { expirationTtl: OAUTH_TTL_SECONDS }
  )

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    // Identity only. This app has no business reading anyone's mail or files.
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })

  return Response.redirect(`${AUTHORIZE_URL}?${params}`, 302)
}
