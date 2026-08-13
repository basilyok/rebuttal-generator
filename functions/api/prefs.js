// Account preferences. Language only, and deliberately stored in plaintext.
//
// A language choice is not a secret, and keeping it outside the encrypted vault is
// what lets the interface appear in the right language the instant someone signs in
// on a new device — before, and regardless of whether, they unlock their keys.

import { getSession, jsonResponse, requireAccounts, userKey } from '../_lib/session.js'
import { overDurableBrake } from '../_lib/ratelimit.js'

/** Must match SUPPORTED in src/i18n/index.ts. */
const LANGUAGES = ['en', 'es', 'fr', 'de', 'pt-BR', 'it', 'ja', 'ko', 'zh-Hans', 'ar', 'hi', 'el']

export async function onRequestGet({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  const session = await getSession(request, env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)

  return jsonResponse({ language: session.user.language || '' })
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

  const language = typeof body?.language === 'string' ? body.language : ''
  // An empty string is legitimate: it means "follow this device's locale"
  if (language && !LANGUAGES.includes(language)) {
    return jsonResponse({ error: 'Unsupported language.' }, 400)
  }

  // Account-keyed, after validation, before the write — same reasoning as
  // vault.js. Changing language is a deliberate, rare act, so the cap is tight;
  // the client fires this fire-and-forget on every switch, which is exactly the
  // shape that turns a stuck control into a write-budget leak.
  if (await overDurableBrake(env, request, { name: 'prefs-put', windowMs: 600_000, max: 15, subject: session.userId })) {
    return jsonResponse({ error: 'Too many preference changes in a row — wait a moment and try again.' }, 429)
  }

  const updated = { ...session.user, language, lastSeenAt: Date.now() }
  await env.ACCOUNTS.put(userKey(session.userId), JSON.stringify(updated))

  return jsonResponse({ ok: true, language })
}
