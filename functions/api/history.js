// Encrypted reply history — one ciphertext blob per account. Deliberately a
// near-clone of vault.js: same guard, same base64 validation, same
// {salt, iv, ciphertext, version} record, because the invariant is the same —
// this server must remain STRUCTURALLY unable to read what it stores. History
// is the most sensitive thing the app will ever hold (a longitudinal record of
// the user's disputes); it gets the vault treatment, not a smaller one.
import { getSession, jsonResponse, requireAccounts, historyKey } from '../_lib/session.js'

/** ~100 entries of realistic size, base64 — far more than the vault needs. */
const MAX_CIPHERTEXT_CHARS = 200_000
const BASE64 = /^[A-Za-z0-9+/=]+$/

const isBlob = (value, maxChars) =>
  typeof value === 'string' && value.length > 0 && value.length <= maxChars && BASE64.test(value)

export async function onRequestGet({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)

  const raw = await env.ACCOUNTS.get(historyKey(session.userId))
  if (!raw) return jsonResponse({ history: null })

  try {
    return jsonResponse({ history: JSON.parse(raw) })
  } catch {
    return jsonResponse({ history: null })
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
    return jsonResponse({ error: 'Malformed history payload.' }, 400)
  }

  const record = {
    salt: body.salt,
    iv: body.iv,
    ciphertext: body.ciphertext,
    // Lets the client recognise a blob written by an older key-derivation scheme
    version: Number.isInteger(body.version) ? body.version : 1,
    updatedAt: Date.now(),
  }

  await env.ACCOUNTS.put(historyKey(session.userId), JSON.stringify(record))
  return jsonResponse({ ok: true, updatedAt: record.updatedAt })
}

export async function onRequestDelete({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)

  await env.ACCOUNTS.delete(historyKey(session.userId))
  return jsonResponse({ ok: true })
}
