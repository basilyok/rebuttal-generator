// Reading the totals requires being signed in AS the operator. Everyone else
// gets a 404 — the endpoint's existence is not worth advertising with a 403.
import { getSession, jsonResponse, requireAccounts } from '../_lib/session.js'

export async function onRequestGet(context) {
  const { env, request } = context
  // Unset OPERATOR_EMAIL is a deploy-configuration state, not an access-control
  // decision, so it wins over both the accounts-configured check and the
  // not-found response below.
  if (!env.OPERATOR_EMAIL) return jsonResponse({ error: 'Not configured.' }, 501)
  const unconfigured = requireAccounts(env)
  if (unconfigured) return unconfigured
  const session = await getSession(request, env)
  if (!session || session.user?.email !== env.OPERATOR_EMAIL) {
    return jsonResponse({ error: 'Not found.' }, 404)
  }
  if (!env.LIMITER) return jsonResponse({ metrics: [] })
  const days = new URL(request.url).searchParams.get('days') || '7'
  const res = await env.LIMITER.fetch(`https://limiter/metrics?days=${encodeURIComponent(days)}`)
  return jsonResponse(await res.json())
}
