// Sign out. POST-only so a stray <img> or link cannot log someone out.
//
// This clears the session only. The vault ciphertext stays on the server and the
// derived key stays in the browser's IndexedDB — signing out is not "forget my
// keys". The client clears its local key material separately (see src/vault.ts),
// which is what makes sign-out on a shared machine actually safe.

import { clearSessionCookie, destroySession, getSession, jsonResponse, requireAccounts } from '../../_lib/session.js'

export async function onRequestPost({ request, env }) {
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured

  const session = await getSession(request, env)
  await destroySession(env, session?.sessionId)

  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() })
}
