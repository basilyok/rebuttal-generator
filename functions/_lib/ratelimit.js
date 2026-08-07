// Best-effort per-IP flood brake, shared by every endpoint that needs one.
// Per-isolate and per-colo, so a determined distributed attacker walks around
// it — the point is to cap what any single address can do to the KV write
// budget or the upstream spend, not to authenticate anyone. Each endpoint
// makes its own brake so tuning one never loosens another.
export function makeFloodBrake({ windowMs, max }) {
  const recentHits = new Map()
  /**
   * @param {{ headers: { get(name: string): string | null } }} request
   *   Only `headers.get` is used, so any object shaped like this — a real
   *   `Request`, or a test double — works. This is the shape generate.ts's
   *   `(request: Request): boolean` signature lost in the extraction; a
   *   Cloudflare `Request` satisfies it structurally.
   * @returns {boolean} true once this address has exceeded `max` hits inside
   *   the trailing `windowMs`.
   */
  return function overLimit(request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const now = Date.now()
    const hits = (recentHits.get(ip) || []).filter((t) => now - t < windowMs)
    hits.push(now)
    recentHits.set(ip, hits)
    // Bound the map itself: drop addresses whose whole window has passed
    if (recentHits.size > 5000) {
      for (const [key, stamps] of recentHits) {
        if (now - stamps[stamps.length - 1] >= windowMs) recentHits.delete(key)
      }
    }
    return hits.length > max
  }
}

// The durable second layer over makeFloodBrake, backed by the LIMITER
// Durable Object (limiter/src/index.js, POST /brake): one global SQLite
// counter, so its verdict holds across isolates and colos — the cap the
// in-memory layer above can only floor. Layering contract: callers run this
// AFTER their in-memory brake passes (and after validation) — the free local
// check absorbs single-isolate floods without spending a subrequest, and
// this settles what leaks past it.
//
// Fail-open on every failure mode (no binding, non-OK answer, thrown fetch,
// malformed JSON): a limiter outage must degrade to today's per-isolate
// behavior, never escalate into an auth lockout — login is the only door to
// the vault, and the in-memory brake still stands either way. Same
// direction as generate.ts's consume(), and deliberately further: consume()
// fails open only on a missing binding and a non-OK answer, while its fetch
// and json calls are uncaught — its call site sits outside any try, so a
// throw there is a platform 500 for /api/generate. Here a throw also fails
// open, because "the limiter broke" turning into "nobody can sign in" is
// precisely the failure this posture exists to rule out.
export async function overDurableBrake(env, request, { name, windowMs, max }) {
  if (!env.LIMITER) return false
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  try {
    const res = await env.LIMITER.fetch('https://limiter/brake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: `${name}:${ip}`, windowMs, max }),
    })
    if (!res.ok) {
      // Fail-open's own failure mode is silence — unmarked, a persistent
      // limiter outage just looks like softer caps. Log the status code
      // only, never response content.
      console.error('durable brake unavailable', res.status)
      return false
    }
    const data = await res.json()
    return data?.limited === true
  } catch (err) {
    // Same marker discipline as login.js's catch: the error's NAME only,
    // never the object or its message.
    console.error('durable brake unavailable', err?.name)
    return false
  }
}
