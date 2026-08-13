// The encrypted API-key vault. This endpoint is deliberately, structurally unable
// to read what it stores.
//
// It accepts three opaque values — salt, iv, ciphertext — and hands the same three
// back. The AES-GCM key is derived in the user's browser from a passphrase that is
// never transmitted (see src/vault.ts). There is no code path here that could
// decrypt a vault, and none should ever be added: the whole point is that a dump of
// this KV namespace, or a compromise of this Worker, yields nothing spendable.
//
// If a future change makes the server able to read provider keys, the app has
// become a custodian of credentials that cost real money, and README's privacy
// claims become false. Treat that as a breaking change, not a refactor.

import { getSession, jsonResponse, requireAccounts, vaultKey } from '../_lib/session.js'
import { overDurableBrake } from '../_lib/ratelimit.js'

/** Generous enough for a dozen provider keys, small enough to bound abuse. */
const MAX_CIPHERTEXT_CHARS = 20_000
const BASE64 = /^[A-Za-z0-9+/=]+$/

const isBlob = (value, maxChars) =>
  typeof value === 'string' && value.length > 0 && value.length <= maxChars && BASE64.test(value)

export async function onRequestGet({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)

  const raw = await env.ACCOUNTS.get(vaultKey(session.userId))
  if (!raw) return jsonResponse({ vault: null })

  try {
    return jsonResponse({ vault: JSON.parse(raw) })
  } catch {
    return jsonResponse({ vault: null })
  }
}

export async function onRequestPut({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON.' }, 400)
  }

  // Field-by-field, never the raw body — the same rule the share endpoint follows.
  // Storing arbitrary client JSON is how a storage bucket becomes someone's CDN.
  if (!isBlob(body?.salt, 64) || !isBlob(body?.iv, 64) || !isBlob(body?.ciphertext, MAX_CIPHERTEXT_CHARS)) {
    return jsonResponse({ error: 'Malformed vault payload.' }, 400)
  }

  // Keyed by account, not address: this write belongs to a signed-in user, so
  // CGNAT neighbours must not share a quota and changing network must not shed
  // one. Placed after validation so a malformed payload cannot burn the limit,
  // and before the write because capping writes is the whole point. Fails open
  // — a limiter outage must not stop someone saving their keys.
  if (await overDurableBrake(env, request, { name: 'vault-put', windowMs: 600_000, max: 20, subject: session.userId })) {
    return jsonResponse({ error: 'Too many vault saves in a row — wait a moment and try again.' }, 429)
  }

  const record = {
    salt: body.salt,
    iv: body.iv,
    ciphertext: body.ciphertext,
    // Lets the client recognise a vault written by an older key-derivation scheme
    version: Number.isInteger(body.version) ? body.version : 1,
    updatedAt: Date.now(),
  }

  await env.ACCOUNTS.put(vaultKey(session.userId), JSON.stringify(record))
  return jsonResponse({ ok: true, updatedAt: record.updatedAt })
}

export async function onRequestDelete({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)

  await env.ACCOUNTS.delete(vaultKey(session.userId))
  return jsonResponse({ ok: true })
}
