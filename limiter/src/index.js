// One SQLite-backed Durable Object holds every counter. Workers KV was
// explicitly rejected for this job (no atomic increment, ~60s propagation,
// 1000 writes/day on the free plan); SQLite in a DO is genuinely atomic and
// free-plan eligible. A single global instance is fine at this scale — the
// hot path is one UPSERT per reply.

const DAY_MS = 86_400_000

const utcDay = (now) => new Date(now).toISOString().slice(0, 10)
const nextUtcMidnight = (now) => new Date(Math.floor(now / DAY_MS) * DAY_MS + DAY_MS).toISOString()

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export class Limiter {
  constructor(ctx) {
    this.sql = ctx.storage.sql
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS counters (
         k TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (k, day))`
    )
    // All-time totals exist so "first ever" survives the daily reset — the
    // paid-first-reply routing keys off this, not off today's count.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS totals (
         k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)`
    )
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS metrics (
         day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (day, name))`
    )
    // Fixed-window brake counters for the auth endpoints (/brake below).
    // These rows are keyed per caller IP (`auth-login:<ip>`) — the only
    // place in this DO that stores an address — so they are deliberately
    // transient: each row carries its own absolute expiry, stamped at
    // insert, and /brake prunes on it every call. An address lives here for
    // at most one window.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS brakes (
         k TEXT NOT NULL, bucket INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0,
         expiresAt INTEGER NOT NULL,
         PRIMARY KEY (k, bucket))`
    )
  }

  async fetch(request) {
    const url = new URL(request.url)
    const now = Date.now()

    if (request.method === 'POST' && url.pathname === '/consume') {
      let body
      try {
        body = await request.json()
      } catch {
        return json({ error: 'Malformed request.' }, 400)
      }
      const key = typeof body?.key === 'string' && body.key.length > 0 && body.key.length <= 200 ? body.key : null
      const cap = Number.isInteger(body?.cap) && body.cap > 0 && body.cap <= 1000 ? body.cap : null
      if (!key || !cap) return json({ error: 'key and cap are required.' }, 400)

      const day = utcDay(now)
      const row = this.sql
        .exec(
          `INSERT INTO counters (k, day, n) VALUES (?, ?, 1)
           ON CONFLICT (k, day) DO UPDATE SET n = n + 1
           RETURNING n`,
          key,
          day
        )
        .one()
      const total = this.sql
        .exec(
          `INSERT INTO totals (k, n) VALUES (?, 1)
           ON CONFLICT (k) DO UPDATE SET n = n + 1
           RETURNING n`,
          key
        )
        .one()
      // Opportunistic prune — cheap, and keeps the table bounded without alarms
      this.sql.exec(`DELETE FROM counters WHERE day < ?`, utcDay(now - 2 * DAY_MS))

      return json({
        allowed: row.n <= cap,
        count: row.n,
        remaining: Math.max(0, cap - row.n),
        first: total.n === 1,
        resetAt: nextUtcMidnight(now),
      })
    }

    if (request.method === 'POST' && url.pathname === '/brake') {
      // Durable half of the per-IP auth flood brakes (functions/api/auth/*):
      // the in-memory brake in each Function is per-isolate and per-colo, so
      // its cap is really a floor; this counter is global and atomic, so it
      // can be an actual cap. Fixed-window on purpose — coarser than the
      // in-memory brake's sliding window, but one UPSERT per call and never
      // more than one live row per (key, window).
      let body
      try {
        body = await request.json()
      } catch {
        return json({ error: 'Malformed request.' }, 400)
      }
      const key = typeof body?.key === 'string' && body.key.length > 0 && body.key.length <= 200 ? body.key : null
      const windowMs =
        Number.isInteger(body?.windowMs) && body.windowMs >= 1_000 && body.windowMs <= DAY_MS ? body.windowMs : null
      const max = Number.isInteger(body?.max) && body.max >= 1 && body.max <= 1000 ? body.max : null
      if (!key || !windowMs || !max) return json({ error: 'key, windowMs, and max are required.' }, 400)

      const bucket = Math.floor(now / windowMs)
      const windowEndsAt = (bucket + 1) * windowMs
      const row = this.sql
        .exec(
          `INSERT INTO brakes (k, bucket, n, expiresAt) VALUES (?, ?, 1, ?)
           ON CONFLICT (k, bucket) DO UPDATE SET n = n + 1
           RETURNING n`,
          key,
          bucket,
          windowEndsAt
        )
        .one()
      // Opportunistic prune, same posture as /consume's — but keyed on an
      // absolute expiry stamped at insert, because bucket numbers from
      // different windowMs values are not comparable to each other (bucket
      // 12 of a 5-minute window and bucket 12 of a 10-minute window are
      // different moments). Once `now` passes a row's window end that
      // (k, bucket) pair can never be incremented again, so deleting at that
      // instant is exact, not a heuristic — and it is what keeps the
      // IP-keyed rows above transient rather than an address log.
      this.sql.exec(`DELETE FROM brakes WHERE expiresAt <= ?`, now)

      return json({
        limited: row.n > max,
        count: row.n,
        retryAfterMs: windowEndsAt - now,
      })
    }

    if (request.method === 'POST' && url.pathname === '/metric') {
      let body
      try {
        body = await request.json()
      } catch {
        return json({ error: 'Malformed request.' }, 400)
      }
      const name = typeof body?.name === 'string' && /^[a-z_]{1,40}$/.test(body.name) ? body.name : null
      if (!name) return json({ error: 'name is required.' }, 400)
      this.sql.exec(
        `INSERT INTO metrics (day, name, n) VALUES (?, ?, 1)
         ON CONFLICT (day, name) DO UPDATE SET n = n + 1`,
        utcDay(now),
        name
      )
      return json({ ok: true })
    }

    if (request.method === 'GET' && url.pathname === '/metrics') {
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 7))
      const since = utcDay(now - days * DAY_MS)
      const rows = this.sql
        .exec(`SELECT day, name, n FROM metrics WHERE day >= ? ORDER BY day DESC, name ASC`, since)
        .toArray()
      return json({ metrics: rows })
    }

    return json({ error: 'Not found.' }, 404)
  }
}

export default {
  async fetch(request, env) {
    // Single global instance: every caller agrees on one name, so every
    // counter lives in one SQLite file with real transactions.
    const id = env.LIMITER_DO.idFromName('global')
    return env.LIMITER_DO.get(id).fetch(request)
  },
}
