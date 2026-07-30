// Begin Google sign-in: OAuth 2.0 Authorization Code flow with PKCE.
//
// PKCE is not strictly required for a confidential client that holds a secret, but
// it costs nothing here and closes authorization-code interception outright. The
// state and the PKCE verifier are held server-side in KV under a short TTL rather
// than in a cookie, so a stolen cookie alone cannot complete somebody's sign-in.

import { jsonResponse, oauthKey, randomToken, base64Url, googleConfigured, OAUTH_TTL_SECONDS } from '../../../_lib/session.js'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

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
