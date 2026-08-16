// The wrapped-DEK record: two copies of the same data key, one openable by the
// password, one by the recovery code. Both are ciphertext this server cannot
// open — the same posture as vault.js, and the reason this endpoint can be a
// near-clone of it.
//
// The DEK itself is what encrypts the vault and history blobs. Losing this
// record while those blobs are v2 would make them permanently unreadable, so
// setup and migration always write THIS record before re-encrypting anything.
import { getSession, jsonResponse, requireAccounts, dekKey } from '../_lib/session.js'
import { overDurableBrake } from '../_lib/ratelimit.js'

const MAX_FIELD = 512
const BASE64 = /^[A-Za-z0-9+/=]*$/

const isWrapped = (value) =>
  !!value &&
  typeof value.iv === 'string' &&
  value.iv.length > 0 &&
  value.iv.length <= MAX_FIELD &&
  BASE64.test(value.iv) &&
  typeof value.ciphertext === 'string' &&
  value.ciphertext.length > 0 &&
  value.ciphertext.length <= MAX_FIELD &&
  BASE64.test(value.ciphertext)

const clean = (value) => ({ iv: value.iv, ciphertext: value.ciphertext, version: 1 })

export async function onRequestGet({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured
  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)

  const raw = await env.ACCOUNTS.get(dekKey(session.userId))
  if (!raw) return jsonResponse({ dek: null })
  try {
    return jsonResponse({ dek: JSON.parse(raw) })
  } catch {
    return jsonResponse({ dek: null })
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
  if (!isWrapped(body?.byPassword) || !isWrapped(body?.byRecovery)) {
    return jsonResponse({ error: 'Malformed DEK payload.' }, 400)
  }

  // After validation, before the write — same placement as vault.js, so
  // neither junk nor a refused request costs the shared KV write budget.
  if (await overDurableBrake(env, request, { name: 'dek-put', windowMs: 600_000, max: 20, subject: session.userId })) {
    return jsonResponse({ error: 'Too many key updates in a row — wait a moment and try again.' }, 429)
  }

  const record = {
    byPassword: clean(body.byPassword),
    byRecovery: clean(body.byRecovery),
    version: 1,
    updatedAt: Date.now(),
  }
  await env.ACCOUNTS.put(dekKey(session.userId), JSON.stringify(record))
  return jsonResponse({ ok: true, updatedAt: record.updatedAt })
}
