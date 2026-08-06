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
  // provider === 'google' is load-bearing, not redundant with the email check:
  // a password account's email (functions/api/auth/register.js) is an
  // unverified, non-unique claim the sign-up form accepts as-is, never proven
  // to belong to the registrant — anyone can register a local account with
  // email set to OPERATOR_EMAIL (public in the git log) and pass an
  // email-only check. Google's address IS proof of ownership: it is only
  // ever stored when the ID token says email_verified (google/callback.js),
  // and identity there is keyed on `sub`, not email, so this is the one
  // provider where "email equals OPERATOR_EMAIL" means "is the operator".
  if (!session || session.user?.provider !== 'google' || session.user?.email !== env.OPERATOR_EMAIL) {
    return jsonResponse({ error: 'Not found.' }, 404)
  }
  if (!env.LIMITER) return jsonResponse({ metrics: [] })
  const days = new URL(request.url).searchParams.get('days') || '7'
  const res = await env.LIMITER.fetch(`https://limiter/metrics?days=${encodeURIComponent(days)}`)
  return jsonResponse(await res.json())
}
