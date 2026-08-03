// Aggregate-only event counting. A metric is a NAME and nothing else — no ids,
// no payload, no user agent, no referrer stored. The allowlist is the whole
// schema; anything not on it is a client bug, not a new metric.
import { jsonResponse } from '../_lib/session.js'
import { isSameOriginBrowserRequest } from '../_lib/gate.js'

const ALLOWED = new Set(['share_cta', 'share_view', 'instant_reply', 'instant_exhausted'])

export async function onRequestPost(context) {
  if (!isSameOriginBrowserRequest(context.request)) {
    return jsonResponse({ error: 'This endpoint only serves the Rebuttal Generator app.' }, 403)
  }
  let body
  try {
    body = await context.request.json()
  } catch {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }
  if (!ALLOWED.has(body?.name)) return jsonResponse({ error: 'Unknown metric.' }, 400)
  if (context.env.LIMITER) {
    context.waitUntil(
      context.env.LIMITER.fetch('https://limiter/metric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: body.name }),
      }).catch(() => {})
    )
  }
  return new Response(null, { status: 204 })
}
