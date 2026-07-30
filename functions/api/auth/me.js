// Who am I? Also tells the client which sign-in methods this deployment offers, so
// the UI can hide buttons that would only lead to a 501.

import { getSession, googleConfigured, jsonResponse, publicUser } from '../../_lib/session.js'

export async function onRequestGet({ request, env }) {
  const providers = googleConfigured(env) ? ['google'] : []
  const session = await getSession(request, env)
  return jsonResponse({
    configured: providers.length > 0,
    providers,
    user: publicUser(session?.user),
  })
}
