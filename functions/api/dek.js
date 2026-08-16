// The wrapped-DEK record: two copies of the same data key, one openable by the
// password, one by the recovery code. Both are ciphertext this server cannot
// open — the same posture as vault.js, and the reason this endpoint can be a
// near-clone of it.
//
// The DEK itself is what encrypts the vault and history blobs. Losing this
// record while those blobs are v2 would make them permanently unreadable, so
// setup and migration always write THIS record before re-encrypting anything.
//
// There is deliberately no onRequestDelete here, unlike vault.js: deleting this
// record does not free the user of anything, it strands every v2 blob the
// record could have opened. Rotation happens by PUTting a new pair, never by
// clearing first.
import { getSession, jsonResponse, requireAccounts, dekKey } from '../_lib/session.js'
import { overDurableBrake } from '../_lib/ratelimit.js'
import { isBlob } from '../_lib/base64.js'

// Both fields are fixed-size by construction: a 12-byte GCM iv is 16 base64
// chars, and a wrapped 32-byte DEK plus its 16-byte tag is 64. 512 is ~8x the
// largest legitimate value — loose enough to survive a future cipher with a
// bigger key or a longer nonce, tight enough that this record can never become
// a place to park data. It is a sanity bound, not a fit.
const MAX_FIELD = 512

const isWrapped = (value) => !!value && isBlob(value.iv, MAX_FIELD) && isBlob(value.ciphertext, MAX_FIELD)

// Stamps version 1 rather than honouring `body.version` the way vault.js does,
// and the difference is intentional: vault.js passes a version through for a
// client that must recognise its own older key-derivation scheme, whereas this
// server validates exactly one wrap format above. Echoing a client-supplied
// version would label a record with a format nothing here checked for.
const clean = (value) => ({ iv: value.iv, ciphertext: value.ciphertext, version: 1 })

const corrupt = () =>
  jsonResponse({ error: 'The stored key record is unreadable.', code: 'dek-corrupt' }, 500)

export async function onRequestGet({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured
  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)

  const raw = await env.ACCOUNTS.get(dekKey(session.userId))
  if (!raw) return jsonResponse({ dek: null })

  // A record that exists but will not parse is corruption, not absence, and the
  // two must never look alike: the client's response to "absent" is to generate
  // a fresh DEK and overwrite, which would permanently orphan v2 blobs the
  // stored record could still have opened. vault.js can safely collapse the two
  // (a lost vault means "paste your keys again"); here the same line would turn
  // a bad read into unrecoverable data loss with no error raised anywhere. Same
  // rule src/recovery.ts follows for a truncated record — see dc3fdde.
  let dek
  try {
    dek = JSON.parse(raw)
  } catch {
    return corrupt()
  }
  // Parsing is not enough: `{}` is valid JSON and would reach the client as a
  // present-but-useless record, which fails later and further from the cause.
  if (!isWrapped(dek?.byPassword) || !isWrapped(dek?.byRecovery)) return corrupt()
  return jsonResponse({ dek })
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
