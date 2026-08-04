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
