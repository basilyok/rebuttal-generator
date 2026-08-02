// Shared browser-same-origin gate, used by every API endpoint that must never
// be reachable from another website (share, article, generate). Browsers
// attach at least one of Origin, Sec-Fetch-Site, or Referer to every fetch,
// and none of them can be forged *from a browser* — so this shuts out other
// websites using our endpoints from their pages. A non-browser client can
// still fake these headers; this closes the drive-by door rather than
// authenticating anyone. Real per-caller quotas are enforced separately
// (the rate-limiter Durable Object, and the per-IP flood brakes alongside
// each endpoint's own call site).
export function isSameOriginBrowserRequest(request) {
  const self = new URL(request.url).origin
  const origin = request.headers.get('Origin')
  if (origin) return origin === self
  const site = request.headers.get('Sec-Fetch-Site')
  if (site) return site === 'same-origin'
  const referer = request.headers.get('Referer')
  if (!referer) return false
  try {
    return new URL(referer).origin === self
  } catch {
    return false
  }
}
