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
