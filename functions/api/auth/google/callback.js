// Complete Google sign-in: validate state, exchange the code, verify the ID token
// claims, then mint a session.

import {
  createSession,
  googleConfigured,
  jsonResponse,
  oauthKey,
  setSessionCookie,
  upsertUser,
} from '../../../_lib/session.js'
import { redirectUri } from './start.js'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/** Decode a JWT payload. Does NOT verify — see verifyClaims for why that is sound here. */
function decodePayload(idToken) {
  const parts = String(idToken).split('.')
  if (parts.length !== 3) throw new Error('Malformed ID token')
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/**
 * Validate the identity claims.
 *
 * The signature is deliberately not checked. This token did not arrive from the
 * browser — we fetched it ourselves over TLS from Google's token endpoint,
 * authenticated with our client secret. Google documents that tokens obtained this
 * way need no signature verification, and an attacker able to forge that channel
 * could equally serve their own JWKS. What still matters is that the token is for
 * OUR client, from Google, unexpired, and tied to the nonce we just issued — an
 * unvalidated `aud` is how a token minted for a different app gets replayed here.
 */
function verifyClaims(claims, env, expectedNonce) {
  if (!ISSUERS.includes(claims.iss)) throw new Error('Unexpected token issuer')
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error('Token was not issued for this application')
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) throw new Error('Token has expired')
  if (claims.nonce !== expectedNonce) throw new Error('Token does not match this sign-in attempt')
  if (!claims.sub) throw new Error('Token carries no subject')
  return claims
}

/** Send the user back to the app with a message rather than raw JSON. */
function failure(request, reason) {
  const url = new URL('/', new URL(request.url).origin)
  url.searchParams.set('auth_error', reason)
  return Response.redirect(url.toString(), 302)
}

export async function onRequestGet({ request, env }) {
  if (!googleConfigured(env)) {
    return jsonResponse({ error: 'Google sign-in is not configured on this deployment.' }, 501)
  }

  const url = new URL(request.url)
  if (url.searchParams.get('error')) {
    // The user pressed Cancel on Google's consent screen — not an error worth shouting about
    return failure(request, 'cancelled')
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return failure(request, 'incomplete')

  // Single use: consume the state immediately so a replayed callback finds nothing
  const pendingRaw = await env.ACCOUNTS.get(oauthKey(state))
  if (!pendingRaw) return failure(request, 'expired')
  await env.ACCOUNTS.delete(oauthKey(state))

  let pending
  try {
    pending = JSON.parse(pendingRaw)
  } catch {
    return failure(request, 'expired')
  }

  let tokenData
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(request),
        grant_type: 'authorization_code',
        code_verifier: pending.verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    tokenData = await response.json()
    if (!response.ok || !tokenData?.id_token) return failure(request, 'exchange_failed')
  } catch {
    return failure(request, 'exchange_failed')
  }

  let claims
  try {
    claims = verifyClaims(decodePayload(tokenData.id_token), env, pending.nonce)
  } catch {
    return failure(request, 'invalid_token')
  }

  const user = await upsertUser(env, {
    provider: 'google',
    subject: claims.sub,
    // Identity is keyed on `sub`, never on email, so an unverified address cannot be
    // used to slide into somebody else's account. The address is stored for display only.
    email: claims.email_verified ? claims.email : '',
    name: claims.name || claims.given_name || '',
    picture: claims.picture || '',
  })

  const sessionId = await createSession(env, user.id)
  const destination = new URL(pending.next || '/', new URL(request.url).origin)

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.toString(),
      'Set-Cookie': setSessionCookie(sessionId),
      'Cache-Control': 'no-store',
    },
  })
}
