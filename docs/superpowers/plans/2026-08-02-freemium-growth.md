# Freemium Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved freemium design (spec: `docs/superpowers/specs/2026-08-02-freemium-growth-design.md`): an operator-paid "Instant mode" (3 anonymous / 6 signed-in replies per day) behind a structured-fields proxy with an availability ladder, quota counting in a SQLite Durable Object, vault-encrypted history for account holders, and `/s/<id>` share pages with real Open Graph unfurls.

**Architecture:** Three independently-shippable phases. **Phase A** (Tasks 1–5): a separate `m36x-limiter` Worker hosting the counting DO, a `/api/generate` Pages Function that assembles prompts server-side from structured fields and degrades explicitly (paid-first-reply → free pool → paid fallback → honest exhaustion), and the client Instant-mode path that activates exactly where the missing-API-key guard fires today. **Phase B** (Tasks 6–7): history as ciphertext-only sync riding the existing vault key. **Phase C** (Tasks 8–10): path-based share pages with per-share OG meta injected by HTMLRewriter (identical HTML for every requester), plus aggregate-only metrics.

**Tech Stack:** Cloudflare Pages Functions (existing), one new Cloudflare Worker with a SQLite-backed Durable Object, Cloudflare Turnstile (managed widget, `appearance: 'interactive-only'`), OpenRouter chat completions with a provisioned spend-capped key, WebCrypto AES-GCM (existing vault), React 18 + TS (existing), `node --test` + `tsx` for unit tests (new — the repo currently has no test runner).

**Non-negotiable invariants (from the spec — verify against these in every task):**
- The server must remain structurally unable to read history plaintext or API keys.
- `/api/generate` accepts structured fields only; it never accepts or forwards a client-built prompt.
- On the proxied path, a missing response envelope is an error after one retry — never raw model output.
- `/s/<id>` returns byte-identical HTML regardless of User-Agent.
- The sendable message never carries branding.
- No per-user analytics; metrics are daily aggregate integers.

---

## File structure

**Phase A — Instant mode**

| File | Status | Responsibility |
|---|---|---|
| `limiter/wrangler.toml` | create | The separate Worker's config: SQLite DO migration, no public URL |
| `limiter/src/index.js` | create | `Limiter` DO (atomic counters + metrics) and the Worker that routes to it |
| `tests/limiter.test.mjs` | create | HTTP tests against `wrangler dev` |
| `src/prompts.ts` | modify | `audienceTrusted` demotion; `instantPrompt` (message + weak-link in ONE envelope); `hasMessageEnvelope` |
| `tests/prompts.test.ts` | create | Unit tests for the three prompt changes |
| `functions/_lib/instant.js` | create | Caps/models/limits as config (the spec's "config, not constants") |
| `functions/api/generate.ts` | create | The proxy: gate → Turnstile → quota → ladder → envelope enforcement |
| `wrangler.toml` | modify | `[[services]]` binding LIMITER → m36x-limiter |
| `tests/generate.test.mjs` | create | HTTP tests (gate, validation, quota, ladder) with a no-spend echo seam |
| `src/instant.ts` | create | Client fetch wrapper + typed quota errors |
| `src/turnstile.ts` | create | Lazy Turnstile loader + per-request token |
| `src/App.tsx` | modify | Instant path replacing the missing-key dead-end; counter + exhausted states |
| `src/index.css` | modify | `.instant-quota`, `.instant-done` styles |
| `src/i18n/locales/*.ts` (12 files) | modify | ~10 new `instant.*` keys each |
| `README.md`, `PROJECT_SUMMARY.md`, `DEPLOYMENT_GUIDE.md` | modify | Privacy wording change + operator setup |

**Phase B — History**

| File | Status | Responsibility |
|---|---|---|
| `functions/_lib/session.js` | modify | Add `historyKey(id)` |
| `functions/api/history.js` | create | Ciphertext blob GET/PUT/DELETE (vault.js clone, bigger cap) |
| `src/vault.ts` | modify | Export generic `sealJson`/`openJson` built on the private helpers |
| `src/history.ts` | create | IndexedDB local store, encrypt/sync/merge, fetch wrappers |
| `tests/history.test.ts` | create | Crypto roundtrip + merge unit tests |
| `src/HistoryPanel.tsx` | create | List/restore/delete UI component |
| `src/App.tsx` | modify | Save-on-generate, pull-on-unlock, wipe-on-sign-out, panel mount |
| `src/i18n/locales/*.ts` | modify | ~8 new `history.*` keys each |

**Phase C — Share pages + metrics**

| File | Status | Responsibility |
|---|---|---|
| `functions/s/[id].js` | create | App shell + per-share OG meta via HTMLRewriter; 404 via 404.html |
| `src/share.ts` | modify | `/s/<id>` URLs; path-based detection alongside `?s=` |
| `functions/api/metric.js` | create | Allowlisted aggregate counter bridge to LIMITER |
| `functions/api/metrics.js` | create | Operator-only readback (email-gated) |
| `src/App.tsx` | modify | CTA beacon on share-page conversion |
| `tests/share-page.test.mjs` | create | OG assertions + UA-invariance test |

---

## Phase A — Instant mode

### Task 1: The limiter Worker (SQLite Durable Object)

**Goal:** A separate Worker `m36x-limiter` whose single Durable Object provides atomic daily counters (`/consume`), all-time first-use detection, and aggregate metrics (`/metric`, `/metrics`) — reachable only via service binding, never a public URL.

**Files:**
- Create: `limiter/wrangler.toml`
- Create: `limiter/src/index.js`
- Create: `tests/limiter.test.mjs`
- Modify: `package.json` (add `test` script + `tsx` devDependency — used from Task 2 onward)

**Acceptance Criteria:**
- [x] `POST /consume {key, cap}` increments atomically and returns `{allowed, remaining, count, first, resetAt}`; the (cap+1)th call on a UTC day returns `allowed: false`
- [x] `first` is true only on the very first consume EVER for a key (across days), false after
- [x] Counters reset at UTC midnight (next-day consume starts at 1); rows older than 2 days are pruned
- [x] `POST /metric {name}` and `GET /metrics` accumulate and report daily integers
- [x] `workers_dev = false` (no public URL) and unknown routes return 404

**Verify:** terminal 1: `cd limiter && npx wrangler dev --port 8787` — then `node --test tests/limiter.test.mjs` → all pass.

**Steps:**

- [x] **Step 1: Write the Worker config**

`limiter/wrangler.toml`:

```toml
# The rate-limiter / metrics Worker. Lives OUTSIDE the Pages project because
# Pages cannot define Durable Object classes; the Pages Functions reach it via
# a service binding (see [[services]] in the root wrangler.toml), so it needs
# no route and no public URL — workers_dev stays false on purpose.
name = "m36x-limiter"
main = "src/index.js"
compatibility_date = "2026-07-01"
workers_dev = false

[[durable_objects.bindings]]
name = "LIMITER_DO"
class_name = "Limiter"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Limiter"]
```

- [x] **Step 2: Write the DO + Worker**

`limiter/src/index.js`:

```js
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
```

- [x] **Step 3: Add the test runner to the repo**

In `package.json`, add to `scripts`:

```json
"test": "node --import tsx --test tests/"
```

and to `devDependencies`:

```json
"tsx": "^4.19.0"
```

Run: `npm install` → lockfile updates, no errors. (`tsx` lets `node --test` execute the `.test.ts` files that arrive in Task 2; this task's own test is plain `.mjs` and doesn't need it, but the script and dependency land once, here.)

- [x] **Step 4: Write the failing test**

`tests/limiter.test.mjs`:

```js
// HTTP tests against a locally running limiter: `cd limiter && npx wrangler dev --port 8787`.
// Each run uses fresh random keys, so re-running against the same dev session is fine.
import test from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.LIMITER_URL || 'http://127.0.0.1:8787'
const rand = () => `test:${crypto.randomUUID()}`

const consume = (key, cap) =>
  fetch(`${BASE}/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, cap }),
  }).then((r) => r.json())

test('counts to the cap, then refuses', async () => {
  const key = rand()
  for (let i = 1; i <= 3; i++) {
    const r = await consume(key, 3)
    assert.equal(r.allowed, true, `call ${i} should be allowed`)
    assert.equal(r.count, i)
    assert.equal(r.remaining, 3 - i)
  }
  const fourth = await consume(key, 3)
  assert.equal(fourth.allowed, false)
  assert.equal(fourth.remaining, 0)
  assert.match(fourth.resetAt, /^\d{4}-\d{2}-\d{2}T00:00:00/)
})

test('first is true exactly once per key, ever', async () => {
  const key = rand()
  const a = await consume(key, 5)
  const b = await consume(key, 5)
  assert.equal(a.first, true)
  assert.equal(b.first, false)
})

test('separate keys do not interfere', async () => {
  const a = rand()
  const b = rand()
  await consume(a, 1)
  const refusedA = await consume(a, 1)
  const freshB = await consume(b, 1)
  assert.equal(refusedA.allowed, false)
  assert.equal(freshB.allowed, true)
})

test('metric accumulates and reads back', async () => {
  await fetch(`${BASE}/metric`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test_metric' }),
  })
  const res = await fetch(`${BASE}/metrics?days=1`).then((r) => r.json())
  const row = res.metrics.find((m) => m.name === 'test_metric')
  assert.ok(row && row.n >= 1)
})

test('bad input is rejected', async () => {
  const r = await fetch(`${BASE}/consume`, { method: 'POST', body: 'not json' })
  assert.equal(r.status, 400)
  const r2 = await consume('', 3)
  assert.equal(r2.error, 'key and cap are required.')
})
```

- [x] **Step 5: Run test to verify it fails (no server)**

Run: `node --test tests/limiter.test.mjs`
Expected: FAIL — `fetch failed` / ECONNREFUSED (nothing listening yet proves the test really talks to the Worker).

- [x] **Step 6: Start the Worker and verify tests pass**

Terminal 1: `cd limiter && npx wrangler dev --port 8787`
Terminal 2: `node --test tests/limiter.test.mjs`
Expected: `# pass 5`, `# fail 0`.

- [x] **Step 7: Commit**

```bash
git add limiter/ tests/limiter.test.mjs package.json package-lock.json
git commit -m "Add the m36x-limiter Worker: atomic quota counting in a SQLite Durable Object"
```

### Task 2: Prompt changes — demoted audience trust and the single-call instant envelope

**Goal:** `src/prompts.ts` gains (a) an `audienceTrusted` switch so the proxied path can demote the recipient hint from "authoritative" to "unverified", (b) `instantPrompt()` producing message + weak-link in ONE response envelope (the spec's one-upstream-call anonymous reply), and (c) `hasMessageEnvelope()` for server-side envelope enforcement.

**Files:**
- Modify: `src/prompts.ts` (PromptContext at :114-128, contextBlock at :147-161, MARKERS at :270)
- Create: `tests/prompts.test.ts`

**Context you need:** `src/prompts.ts` is environment-pure (only a type-only import from `./providers` and pure-data `./i18n/persuasion`) — it will be imported by the Pages Function in Task 3 unchanged. The envelope markers live in `MARKERS` (line 270: `['STRATEGY','CONTEXT','MESSAGE','WEAKLINK','CHECK','THEIRCASE','ANSWERED']`) — `WEAKLINK` is already a known marker, so `section(raw, 'WEAKLINK')` works on the merged response with no parser change. The line being demoted is prompts.ts:150: `` `WHO WILL READ THIS (from the sender, authoritative — trust it over your own inference): ${audience.trim()}` ``.

**Acceptance Criteria:**
- [ ] `contextBlock` output is unchanged for every existing caller (default stays trusted)
- [ ] With `audienceTrusted: false`, the audience line reads as an unverified hint and the "trust it over your own inference" wording is absent
- [ ] `instantPrompt(context, citations)` contains the three message sections AND `<<<WEAKLINK>>>`, includes `sourcesBlock` when citations exist, and writes the weak-link in `briefingLanguage`
- [ ] `hasMessageEnvelope` is true for `<<<MESSAGE>>>`, `**MESSAGE**`, and `MESSAGE:` variants (same tolerance as `markerPattern`), false for prose without any marker
- [ ] `npm run build` still passes (`tsc`)

**Verify:** `node --import tsx --test tests/prompts.test.ts` → all pass; `npm run build` → exits 0.

**Steps:**

- [ ] **Step 1: Write the failing tests**

`tests/prompts.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  messagePrompt,
  instantPrompt,
  hasMessageEnvelope,
  parseMessage,
  section,
  type PromptContext,
} from '../src/prompts'

const base: PromptContext = { isArticle: false, replyLanguage: 'en', briefingLanguage: 'en' }

test('audience stays authoritative by default (existing behaviour unchanged)', () => {
  const p = messagePrompt({ ...base, audience: 'my uncle, over text' })
  assert.match(p, /WHO WILL READ THIS \(from the sender, authoritative — trust it over your own inference\): my uncle, over text/)
})

test('audienceTrusted: false demotes the hint', () => {
  const p = messagePrompt({ ...base, audience: 'my uncle, over text', audienceTrusted: false })
  assert.doesNotMatch(p, /authoritative/)
  assert.doesNotMatch(p, /trust it over your own inference/)
  assert.match(p, /WHO MIGHT READ THIS \(an unverified hint from the requester/)
  assert.match(p, /my uncle, over text/)
})

test('instantPrompt merges message and weak-link into one envelope', () => {
  const p = instantPrompt(base)
  for (const marker of ['<<<STRATEGY>>>', '<<<CONTEXT>>>', '<<<MESSAGE>>>', '<<<WEAKLINK>>>']) {
    assert.ok(p.includes(marker), `missing ${marker}`)
  }
  assert.doesNotMatch(p, /<<<CHECK>>>/) // the claims list stays a BYOK-only feature
})

test('instantPrompt carries citations and briefing language', () => {
  const p = instantPrompt(
    { ...base, briefingLanguage: 'fr' },
    [{ url: 'https://example.com/a', title: 'A source' }]
  )
  assert.match(p, /RETRIEVED SOURCES/)
  assert.match(p, /https:\/\/example\.com\/a/)
  assert.match(p, /French/) // weak-link note written in the sender's language
})

test('hasMessageEnvelope accepts the tolerant marker variants', () => {
  assert.equal(hasMessageEnvelope('<<<MESSAGE>>>\nhello'), true)
  assert.equal(hasMessageEnvelope('**MESSAGE**\nhello'), true)
  assert.equal(hasMessageEnvelope('MESSAGE:\nhello'), true)
  assert.equal(hasMessageEnvelope('just prose with the word message in it'), false)
})

test('a merged response parses with the existing parsers', () => {
  const raw = '<<<STRATEGY>>>\nCalm them.\n<<<CONTEXT>>>\npersuade | uncle, text | short\n<<<MESSAGE>>>\nHere is the reply.\n<<<WEAKLINK>>>\nYour own weakest point is X.'
  const parsed = parseMessage(raw)
  assert.equal(parsed.message, 'Here is the reply.')
  assert.equal(parsed.strategy, 'Calm them.')
  assert.equal(section(raw, 'WEAKLINK'), 'Your own weakest point is X.')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/prompts.test.ts`
Expected: FAIL — `instantPrompt`, `hasMessageEnvelope` not exported; `audienceTrusted` not a known property.

- [ ] **Step 3: Implement in `src/prompts.ts`**

(a) Add to `PromptContext` (after the `briefingLanguage` member, prompts.ts:122-127):

```ts
  /**
   * False on the operator-paid proxy path, where the recipient line arrives from
   * an unauthenticated requester: the hint is offered to the model, never made
   * authoritative — an attacker must not be able to outrank the model's own
   * reading of the text. Omitted (or true) everywhere the user pays.
   */
  audienceTrusted?: boolean
```

(b) In `contextBlock` (prompts.ts:147-161), replace the single audience push at line 150 with:

```ts
  if (audience?.trim()) {
    lines.push(
      context.audienceTrusted === false
        ? `WHO MIGHT READ THIS (an unverified hint from the requester — weigh it against your own reading of the text, and where they disagree, trust the text): ${audience.trim()}`
        : `WHO WILL READ THIS (from the sender, authoritative — trust it over your own inference): ${audience.trim()}`
    )
  }
```

(`contextBlock` receives the whole `context` — check its current signature; if it destructures only `{ audience, venue, isArticle }`, widen it to also read `context.audienceTrusted`.)

(c) Add the merged envelope and builder (place after `honestCheckPrompt`, around prompts.ts:229):

```ts
/**
 * The one-call variant for Instant mode: the honest check folds into the same
 * response as a fourth section, halving cost and latency while keeping the
 * weak-link note — the product's integrity signature. The <<<CHECK>>> claims
 * list stays BYOK-only; it is the least essential output per token.
 */
const instantEnvelope = (briefingLanguage: string) =>
  [
    ENVELOPE,
    '',
    'Then add ONE more section:',
    '',
    '<<<WEAKLINK>>>',
    'The genuinely weakest point in the position you just argued — one or two frank sentences to the sender, not the recipient. ' +
      briefingLanguageLine(briefingLanguage),
  ].join('\n')

export function instantPrompt(context: PromptContext, citations: Citation[] = []): string {
  const language = context.replyLanguage || 'en'
  return [
    ROLE,
    INPUT_IS_DATA,
    contextBlock(context),
    languageBlock(language),
    rulesFor(language),
    sourcesBlock(citations),
    instantEnvelope(context.briefingLanguage || 'en'),
  ]
    .filter(Boolean)
    .join('\n\n')
}
```

(Adjust the `briefingLanguageLine` call to its actual signature at prompts.ts:141-145 — it returns a full sentence like "Write this note in French. …"; if it begins with "Write this note", concatenating after the weak-link sentence reads fine.)

(d) Add the envelope probe next to `markerPattern` (prompts.ts:277-278):

```ts
/** True when the response contains a MESSAGE marker in any tolerated variant. */
export const hasMessageEnvelope = (raw: string): boolean => markerPattern('MESSAGE').test(raw)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test tests/prompts.test.ts`
Expected: PASS (6/6). Also run `npm run build` → exits 0 (no existing caller breaks, since `audienceTrusted` is optional).

- [ ] **Step 5: Commit**

```bash
git add src/prompts.ts tests/prompts.test.ts
git commit -m "Add the instant one-call envelope and demote audience trust on untrusted paths"
```

---

### Task 3: `/api/generate` — the structured-fields proxy with the availability ladder

**Goal:** A Pages Function that turns `{argument, recipientLine?, replyLanguage?, briefingLanguage?, citations?, turnstileToken?}` into one upstream OpenRouter call on the operator key — same-origin-gated, Turnstile-verified, quota-checked in the limiter DO, routed paid-first-reply → free pool → paid fallback, with the envelope enforced server-side (one retry, then error — never raw output).

**Files:**
- Create: `functions/_lib/instant.js`
- Create: `functions/api/generate.ts` (TypeScript — Pages Functions' esbuild compiles it; it imports `../../src/prompts`)
- Modify: `wrangler.toml` (add the LIMITER service binding)
- Create: `tests/generate.test.mjs`

**Context you need:** `functions/_lib/session.js` exports `getSession(request, env)` → `{sessionId, userId, user} | null` (cookie `rb_session`, KV `ACCOUNTS`), `jsonResponse(data, status)`, and the key builders. The same-origin gate pattern already exists in `functions/api/share.js:32-45`. The user record has NO entitlements field yet — this task reads `session.user.entitlements?.instantCap` defensively so the paid tier can flip on later by writing that field.

**Acceptance Criteria:**
- [ ] Requests without a browser same-origin signal → 403; oversize argument → 413; malformed body → 400
- [ ] Anonymous quota keys off an `rb_device` HttpOnly cookie (set on first response); signed-in quota keys off the session's userId with the higher cap
- [ ] 4th anonymous call in a day → 429 with `{resetAt, signedIn: false}` and NO upstream call
- [ ] A key's first-ever reply uses the paid model; later replies try the free model and fall back to paid on 429/5xx/empty
- [ ] A response with no MESSAGE envelope after one retry → 502, and the raw text is never returned
- [ ] With `TURNSTILE_SECRET` set, a missing/invalid token → 403 `{code: 'turnstile'}`; with it unset (local dev), the check is skipped
- [ ] Missing `OPENROUTER_PROXY_KEY` → 501 (Instant mode unconfigured — BYOK unaffected)

**Verify:** terminal 1: `cd limiter && npx wrangler dev --port 8787`; terminal 2: `npx wrangler pages dev dist` (wrangler's local dev registry connects the LIMITER service binding between the two sessions); terminal 3: `node --test tests/generate.test.mjs` → all pass. Tests use the `INSTANT_TEST_ECHO` seam (below) so no real OpenRouter spend occurs.

**Steps:**

- [ ] **Step 1: The config module — caps as config, not constants**

`functions/_lib/instant.js`:

```js
// Every number the funnel design fixed lives here, because the spec's Section 1
// requires caps to be config: raising a free limit later is easy, cutting one
// churns users. Change values here, redeploy, done.
export const INSTANT = {
  anonCap: 3, // one argument + two iterations — never end the taste mid-dissatisfaction
  userCap: 6, // signed-in headroom kept low so a future paid tier has somewhere to stand
  inputMaxChars: 12_000, // the cheapest attack was a huge paste; this is the cheapest fix
  recipientMaxChars: 300,
  maxCitations: 8,
  // First-ever reply routes PAID: the highest-leverage output in the funnel
  // must not depend on the shared, burnable :free pool.
  paidModel: 'openai/gpt-5.6-luna',
  freeModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  maxTokens: 1600,
  upstreamTimeoutMs: 90_000,
}
```

- [ ] **Step 2: Add the service binding to the root `wrangler.toml`**

Append:

```toml
# The rate-limiter Worker (limiter/). Service-bound so only our own Functions
# can reach it — it has no public URL. Deploy it first: cd limiter && npx wrangler deploy
[[services]]
binding = "LIMITER"
service = "m36x-limiter"
```

- [ ] **Step 3: Write the failing tests**

`tests/generate.test.mjs`:

```js
// Runs against `npx wrangler pages dev dist` (default http://127.0.0.1:8788)
// with the limiter dev session also running (see Task 3 Verify). The pages dev
// environment must have a .dev.vars file containing:
//   OPENROUTER_PROXY_KEY=dev-placeholder
//   INSTANT_TEST_ECHO=1
// INSTANT_TEST_ECHO makes the function return a canned envelope instead of
// calling OpenRouter — gate/quota/validation logic is fully exercised with
// zero spend. Production never sets it.
import test from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.PAGES_URL || 'http://127.0.0.1:8788'
const ORIGIN = { Origin: BASE.replace(/\/$/, ''), 'Content-Type': 'application/json' }

const post = (body, headers = {}, cookie) =>
  fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { ...ORIGIN, ...headers, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })

const VALID = { argument: 'Cats are obviously better than dogs because they are quiet.' }

test('cross-site and headerless requests are refused', async () => {
  const noHeaders = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(VALID),
  })
  assert.equal(noHeaders.status, 403)
  const evil = await post(VALID, { Origin: 'https://evil.example' })
  assert.equal(evil.status, 403)
})

test('validation: oversize and malformed input', async () => {
  const big = await post({ argument: 'x'.repeat(13_000) })
  assert.equal(big.status, 413)
  const empty = await post({ argument: '   ' })
  assert.equal(empty.status, 400)
  const notJson = await fetch(`${BASE}/api/generate`, { method: 'POST', headers: ORIGIN, body: '{{{' })
  assert.equal(notJson.status, 400)
})

test('happy path returns an enveloped reply, quota fields, and a device cookie', async () => {
  const res = await post(VALID)
  assert.equal(res.status, 200)
  const setCookie = res.headers.get('set-cookie') || ''
  assert.match(setCookie, /rb_device=/)
  assert.match(setCookie, /HttpOnly/i)
  const data = await res.json()
  assert.match(data.text, /<<<MESSAGE>>>/)
  assert.equal(typeof data.remaining, 'number')
  assert.equal(data.cap, 3)
})

test('anonymous quota: 4th call in a day is refused with resetAt', async () => {
  // Pin one device identity across calls so the count is ours alone
  const device = `rb_device=${crypto.randomUUID()}`
  let last
  for (let i = 0; i < 3; i++) last = await post(VALID, {}, device)
  assert.equal(last.status, 200)
  const fourth = await post(VALID, {}, device)
  assert.equal(fourth.status, 429)
  const body = await fourth.json()
  assert.match(body.resetAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(body.signedIn, false)
})

test('citations are validated field-by-field', async () => {
  const bad = await post({ ...VALID, citations: [{ url: 'javascript:alert(1)', title: 'x' }] })
  assert.equal(bad.status, 400)
  const tooMany = await post({
    ...VALID,
    citations: Array.from({ length: 9 }, (_, i) => ({ url: `https://e.com/${i}`, title: 't' })),
  })
  assert.equal(tooMany.status, 400)
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `node --test tests/generate.test.mjs` (with both dev servers up)
Expected: FAIL — `/api/generate` 404s (function does not exist yet).

- [ ] **Step 5: Implement `functions/api/generate.ts`**

```ts
// Instant mode: the one endpoint where OUR key pays for the reply. Everything
// about its shape follows from that: it accepts structured fields and builds
// the prompt itself (nobody turns our key into a general LLM API), the
// recipient hint is demoted to untrusted, and a missing envelope is an error —
// the raw-output fallback that is correct UX on BYOK would be an exfiltration
// channel here. Spend is bounded twice: our daily cap in the limiter DO, and
// the provisioned key's own daily limit enforced on OpenRouter's servers.
import { instantPrompt, hasMessageEnvelope, type PromptContext } from '../../src/prompts'
import type { Citation } from '../../src/providers'
import { getSession, jsonResponse } from '../_lib/session.js'
import { INSTANT } from '../_lib/instant.js'

// Structural types on purpose — the repo does not depend on
// @cloudflare/workers-types, and these two methods are all we use.
interface Env {
  OPENROUTER_PROXY_KEY?: string
  TURNSTILE_SECRET?: string
  INSTANT_TEST_ECHO?: string
  LIMITER?: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }
  ACCOUNTS?: { get(key: string): Promise<string | null> }
}

const DEVICE_COOKIE = 'rb_device'
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/

// Same gate as functions/api/share.js:32-45 — browser-set headers only.
function isSameOriginBrowserRequest(request: Request): boolean {
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

function readDeviceId(request: Request): string | null {
  const cookies = request.headers.get('Cookie') || ''
  const match = cookies.match(/(?:^|;\s*)rb_device=([A-Za-z0-9-]{8,64})/)
  return match ? match[1] : null
}

function cleanCitations(value: unknown): Citation[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > INSTANT.maxCitations) return null
  const out: Citation[] = []
  for (const item of value) {
    const url = typeof item?.url === 'string' ? item.url.slice(0, 2000) : ''
    if (!/^https?:\/\//i.test(url)) return null
    out.push({
      url,
      title: typeof item?.title === 'string' ? item.title.slice(0, 300) : '',
      snippet: typeof item?.snippet === 'string' ? item.snippet.slice(0, 500) : undefined,
    })
  }
  return out
}

async function verifyTurnstile(env: Env, token: unknown, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true // not configured (local dev) — skip
  if (typeof token !== 'string' || !token) return false
  const form = new FormData()
  form.set('secret', env.TURNSTILE_SECRET)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    // Verification outage must not take the funnel down — the quota and the
    // spend caps still hold. Fail open, count it.
    return true
  }
}

async function consume(env: Env, key: string, cap: number) {
  if (!env.LIMITER) {
    // Missing binding = misconfigured deploy. Fail open ON PURPOSE: the
    // provisioned key's OpenRouter-side daily limit still bounds the damage,
    // and refusing everyone would hand an outage to every legitimate visitor.
    return { allowed: true, remaining: cap - 1, first: false, resetAt: '' }
  }
  const res = await env.LIMITER.fetch('https://limiter/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, cap }),
  })
  if (!res.ok) return { allowed: true, remaining: cap - 1, first: false, resetAt: '' }
  return (await res.json()) as { allowed: boolean; remaining: number; first: boolean; resetAt: string }
}

function metric(ctx: { waitUntil(p: Promise<unknown>): void }, env: Env, name: string) {
  if (!env.LIMITER) return
  ctx.waitUntil(
    env.LIMITER.fetch('https://limiter/metric', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => {})
  )
}

async function callUpstream(env: Env, model: string, system: string, userContent: string) {
  if (env.INSTANT_TEST_ECHO) {
    // Test seam: full pipeline, zero spend. Never set in production.
    return {
      ok: true as const,
      status: 200,
      text: '<<<STRATEGY>>>\nEcho.\n<<<CONTEXT>>>\ntest | test | short\n<<<MESSAGE>>>\nEcho reply for testing.\n<<<WEAKLINK>>>\nEcho weak link.',
    }
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_PROXY_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://rebuttal.m36x.com',
      'X-Title': 'Rebuttal Generator (Instant)',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      max_tokens: INSTANT.maxTokens,
      // 'low', not 'none': Nemotron is a reasoning model and fully starving it
      // yields empty output (the bug fixed for BYOK in providers.ts) — low keeps
      // it cheap without re-introducing that failure.
      reasoning: { effort: 'low' },
    }),
    signal: AbortSignal.timeout(INSTANT.upstreamTimeoutMs),
  })
  if (!res.ok) return { ok: false as const, status: res.status, text: '' }
  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const text = data?.choices?.[0]?.message?.content?.trim() || ''
  return { ok: text.length > 0, status: res.status, text }
}

export async function onRequestPost(context: { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }) {
  const { request, env } = context
  if (!isSameOriginBrowserRequest(request)) {
    return jsonResponse({ error: 'This endpoint only serves the Rebuttal Generator app.' }, 403)
  }
  if (!env.OPENROUTER_PROXY_KEY) {
    return jsonResponse({ error: 'Instant mode is not configured on this deployment.' }, 501)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Malformed request.' }, 400)
  }

  const argument = typeof body.argument === 'string' ? body.argument.trim() : ''
  if (!argument) return jsonResponse({ error: 'An argument is required.' }, 400)
  if (argument.length > INSTANT.inputMaxChars) {
    return jsonResponse({ error: `That text is too long for Instant mode (limit ${INSTANT.inputMaxChars} characters). Shorten it, or use your own API key.` }, 413)
  }
  const recipientLine =
    typeof body.recipientLine === 'string' ? body.recipientLine.trim().slice(0, INSTANT.recipientMaxChars) : ''
  const replyLanguage = typeof body.replyLanguage === 'string' && LANG.test(body.replyLanguage) ? body.replyLanguage : 'en'
  const briefingLanguage =
    typeof body.briefingLanguage === 'string' && LANG.test(body.briefingLanguage) ? body.briefingLanguage : 'en'
  const citations = cleanCitations(body.citations)
  if (citations === null) return jsonResponse({ error: 'Malformed citations.' }, 400)

  const ip = request.headers.get('CF-Connecting-IP')
  if (!(await verifyTurnstile(env, body.turnstileToken, ip))) {
    metric(context, env, 'turnstile_reject')
    return jsonResponse({ error: 'Verification failed — reload the page and try again.', code: 'turnstile' }, 403)
  }

  // Quota identity: the session when signed in, a device cookie otherwise.
  // Never the IP — CGNAT makes an IP a whole campus (spec, Section 1).
  const session = env.ACCOUNTS ? await getSession(request, env) : null
  const entitledCap = (session?.user as { entitlements?: { instantCap?: number } } | undefined)?.entitlements?.instantCap
  const cap = Number.isInteger(entitledCap) && entitledCap! > 0 ? entitledCap! : session ? INSTANT.userCap : INSTANT.anonCap
  let device = session ? null : readDeviceId(request)
  const newDevice = !session && !device ? crypto.randomUUID() : null
  if (newDevice) device = newDevice
  const quotaKey = session ? `u:${session.userId}` : `d:${device}`

  const quota = await consume(env, quotaKey, cap)
  const headers: Record<string, string> = {}
  if (newDevice) {
    headers['Set-Cookie'] = `${DEVICE_COOKIE}=${newDevice}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
  }
  if (!quota.allowed) {
    metric(context, env, 'instant_exhausted')
    return jsonResponse(
      { error: 'Free replies are done for today.', resetAt: quota.resetAt, remaining: 0, cap, signedIn: !!session },
      429,
      headers
    )
  }

  const promptContext: PromptContext = {
    audience: recipientLine || undefined,
    isArticle: false,
    replyLanguage,
    briefingLanguage,
    audienceTrusted: false, // ALWAYS untrusted on this path
  }
  const system = instantPrompt(promptContext, citations)

  // The availability ladder (spec, Section 2): first-ever reply goes paid;
  // after that try the shared free pool and fall back to paid when it is busy.
  // Free-pool starvation is an expected state, not an exception.
  const primary = quota.first ? INSTANT.paidModel : INSTANT.freeModel
  let used = primary
  let result = await callUpstream(env, primary, system, argument)
  if (!result.ok && primary === INSTANT.freeModel) {
    metric(context, env, 'instant_free_fallback')
    used = INSTANT.paidModel
    result = await callUpstream(env, used, system, argument)
  }
  // Envelope enforcement: one retry, then refuse. Raw output never leaves.
  if (result.ok && !hasMessageEnvelope(result.text)) {
    metric(context, env, 'instant_envelope_retry')
    result = await callUpstream(env, used, system, argument)
    if (result.ok && !hasMessageEnvelope(result.text)) result = { ok: false, status: 502, text: '' }
  }
  if (!result.ok) {
    metric(context, env, 'instant_upstream_error')
    return jsonResponse(
      { error: 'The reply could not be generated right now — try again in a moment, or use your own API key.', remaining: quota.remaining, cap },
      502,
      headers
    )
  }

  metric(context, env, 'instant_reply')
  return jsonResponse(
    { text: result.text, model: used, remaining: quota.remaining, cap, resetAt: quota.resetAt },
    200,
    headers
  )
}
```

Note: `jsonResponse` in `functions/_lib/session.js:35-40` must accept a third `headers` argument — it already does (`jsonResponse(data, status = 200, headers = {})`). If its signature differs, extend it there rather than duplicating the helper.

- [ ] **Step 6: Create `.dev.vars` for local testing (gitignored)**

```
OPENROUTER_PROXY_KEY=dev-placeholder
INSTANT_TEST_ECHO=1
```

Confirm `.dev.vars` is in `.gitignore`; add it if not. **Never commit this file.**

- [ ] **Step 7: Build, run both dev servers, verify tests pass**

Run: `npm run build` (generate.ts imports src/prompts — tsc must stay green), then with limiter dev (8787) and `npx wrangler pages dev dist` (8788) up:
`node --test tests/generate.test.mjs`
Expected: `# pass 5`, `# fail 0`. Also confirm in the pages-dev log that no request ever reached openrouter.ai (the echo seam short-circuits).

- [ ] **Step 8: Commit**

```bash
git add functions/_lib/instant.js functions/api/generate.ts wrangler.toml tests/generate.test.mjs .gitignore
git commit -m "Add the Instant-mode proxy: structured fields, quota, Turnstile, availability ladder"
```

### Task 4: Client Instant mode — the funnel UI

**Goal:** A visitor with no API key who presses Generate gets an Instant reply instead of today's "Please set your API key" dead-end; after the first reply a quota counter appears; exhaustion renders the honest sign-in/BYOK state, never an error.

**Files:**
- Create: `src/instant.ts`
- Create: `src/turnstile.ts`
- Modify: `src/App.tsx` (the guard at :605-612 becomes the Instant branch; counter near the submit block :1457-1478; exhausted panel in the :1480 error region)
- Modify: `src/index.css`
- Modify: all 12 files in `src/i18n/locales/` (10 new keys each)

**Context you need:** `generateReply` (App.tsx:595-733) currently returns early at :605-612 when `provider.requiresKey && !apiKey`. The Tavily search step (:655-670) and `parseMessage`/`section` parsing (:701-707) are reusable as-is. `reply` state is set once via `setReply({...})` (:709-718) — the Instant path populates the same shape, with `weakLink` from `section(raw, 'WEAKLINK')` and `toVerify: []`. Sign-in state: `auth.user` (App.tsx:216). The i18n pattern: add each key to `src/i18n/locales/en.ts` plus the 11 translations; missing keys fall back to English automatically (`i18n/index.ts:88,103`).

**Acceptance Criteria:**
- [ ] With no key saved, Generate produces a real reply via `/api/generate`; strategy, message, chips, and the weak-link note all render
- [ ] No counter is visible before the first generation; after it, "N free replies left today" shows
- [ ] A 429 renders the `.instant-done` panel: sign-in button when signed out, BYOK settings link always, reset time in the user's locale — and it is not styled as an error
- [ ] Turnstile stays invisible for a normal user (`appearance: 'interactive-only'`); with `TURNSTILE_SITE_KEY` empty the widget is skipped entirely
- [ ] BYOK path is byte-for-byte unaffected (a saved key short-circuits all of this)
- [ ] All new strings resolve in all 12 locales (`npm run build` + spot-check `?lang` switching)

**Verify:** `npm run build`; then with the three local servers from Task 3 up, open `http://127.0.0.1:8788`, remove any saved key, generate → reply renders, counter shows "2 free replies left today"; two more replies → exhausted panel with reset time.

**Steps:**

- [ ] **Step 1: The fetch wrapper with typed errors**

`src/instant.ts`:

```ts
// Client half of Instant mode. The server assembles the prompt; this module
// only ships structured fields and interprets the three failure shapes the
// UI must distinguish: out of quota (a product state), turnstile (reload),
// and everything else (a plain error).
import type { Citation } from './providers'

export interface InstantReply {
  text: string
  model: string
  remaining: number
  cap: number
  resetAt: string
}

export class InstantQuotaError extends Error {
  constructor(
    readonly resetAt: string,
    readonly signedIn: boolean
  ) {
    super('quota')
  }
}

export class InstantTurnstileError extends Error {
  constructor() {
    super('turnstile')
  }
}

export async function generateInstant(args: {
  argument: string
  recipientLine?: string
  replyLanguage?: string
  briefingLanguage?: string
  citations?: Citation[]
  turnstileToken?: string
}): Promise<InstantReply> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(120_000),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 429) throw new InstantQuotaError(data.resetAt || '', !!data.signedIn)
  if (res.status === 403 && data.code === 'turnstile') throw new InstantTurnstileError()
  if (!res.ok) throw new Error(data.error || 'Instant mode is unavailable right now.')
  return data as InstantReply
}
```

- [ ] **Step 2: The Turnstile loader**

`src/turnstile.ts`:

```ts
// Invisible-until-challenged bot check. One managed widget with
// appearance 'interactive-only': honest users see nothing; an address the
// signals distrust gets the interactive challenge — the spec's two modes in
// one widget. Tokens are single-use, so every generation fetches a fresh one.
//
// Operator fills this after creating the site in the Cloudflare dashboard
// (Task 5). Empty string = Turnstile disabled end to end (the server skips
// verification when TURNSTILE_SECRET is unset, so dev works with no setup).
export const TURNSTILE_SITE_KEY = ''

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, opts: Record<string, unknown>): string
      reset(id: string): void
    }
  }
}

let scriptPromise: Promise<void> | null = null
let widgetId: string | null = null
let container: HTMLElement | null = null

function loadScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      el.async = true
      el.onload = () => resolve()
      el.onerror = () => reject(new Error('turnstile-load'))
      document.head.appendChild(el)
    })
  }
  return scriptPromise
}

/** Resolve a fresh single-use token, or '' when Turnstile is not configured. */
export async function getTurnstileToken(deviceHint: string): Promise<string> {
  if (!TURNSTILE_SITE_KEY) return ''
  await loadScript()
  if (!window.turnstile) return ''
  if (!container) {
    container = document.createElement('div')
    container.className = 'turnstile-slot'
    document.body.appendChild(container)
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(''), 20_000) // never block a reply on the checker
    const finish = (token: string) => {
      clearTimeout(timeout)
      resolve(token)
    }
    if (widgetId !== null) {
      window.turnstile!.reset(widgetId)
    }
    widgetId = window.turnstile!.render(container!, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: 'interactive-only',
      cData: deviceHint.slice(0, 255),
      callback: finish,
      'error-callback': () => finish(''),
    })
  })
}
```

- [ ] **Step 3: Wire the Instant branch into `generateReply`**

In `src/App.tsx`, add state near the other generation state (after line ~200):

```ts
  const [instantQuota, setInstantQuota] = useState<{ remaining: number; cap: number } | null>(null)
  const [instantDone, setInstantDone] = useState<{ resetAt: string; signedIn: boolean } | null>(null)
```

Replace the guard at :605-612 with:

```ts
    const instant = provider.requiresKey && !apiKey
```

then, inside the existing `try` (after the Tavily search step at :655-670 and the `lastRequestRef.current = ...` line at :674, both of which run unchanged), branch before the two-call block at :689:

```ts
      if (instant) {
        // Instant mode: no key, our server pays. One upstream call — the
        // honest check arrives folded into the same envelope (see instantPrompt).
        setProviderStatus(t('instant.working'))
        const token = await getTurnstileToken(localStorage.getItem('ai_provider') || 'anon')
        const instantReply = await generateInstant({
          argument,
          recipientLine: audience || undefined,
          replyLanguage: promptContext.replyLanguage,
          briefingLanguage: promptContext.briefingLanguage,
          citations,
          turnstileToken: token || undefined,
        })
        const parsed = parseMessage(instantReply.text)
        const verified = stripUnverifiedUrls(parsed.message, citations)
        setReply({
          message: verified.text,
          strategy: parsed.strategy,
          context: parsed.context,
          citations: verified.used,
          strippedUrls: verified.stripped,
          unusedCitations: verified.unused,
          weakLink: section(instantReply.text, 'WEAKLINK'),
          toVerify: [],
        })
        setInstantQuota({ remaining: instantReply.remaining, cap: instantReply.cap })
        setInstantDone(null)
        if (searchNote) setError(searchNote)
        return
      }
```

(Match the exact property list of the existing `setReply` at :709-718 — if it includes fields not shown here, carry them with the same values the BYOK path would produce, e.g. `theirCase: undefined`. `section` and `parseMessage` are already imported from `./prompts`; add `generateInstant`/errors from `./instant` and `getTurnstileToken` from `./turnstile`. `stripUnverifiedUrls`'s exact signature is at its App.tsx call site :704-707 — mirror it; if its return shape is `{text, used, stripped, unused}` under different names, use those.)

In the surrounding `catch` (:723-728), add before the generic branch:

```ts
        if (err instanceof InstantQuotaError) {
          setInstantDone({ resetAt: err.resetAt, signedIn: err.signedIn })
          return
        }
        if (err instanceof InstantTurnstileError) {
          setError(t('instant.turnstile'))
          return
        }
```

Also note: the briefing expander is powered by a BYOK model call (`toggleBriefing`, :739-766). On an Instant reply there is no key — guard `toggleBriefing`'s entry with `if (provider.requiresKey && !apiKey) return` so the expander header simply does not render for instant replies: wrap the briefing JSX block (:1562-1614) in `{!instantForReply && (...)}` where `instantForReply` is a boolean stored alongside the reply (add `instant?: boolean` to the reply state object, set `true` in the branch above).

- [ ] **Step 4: The counter and the exhausted panel**

After the submit-button block (below :1478, above the error div at :1480):

```tsx
        {instantQuota && !instantDone && (
          <p className="instant-quota">
            {t('instant.left', { n: instantQuota.remaining })}
          </p>
        )}
        {instantDone && (
          <div className="instant-done">
            <h3>{t('instant.done.title')}</h3>
            <p>
              {t('instant.done.body', {
                time: instantDone.resetAt
                  ? new Date(instantDone.resetAt).toLocaleTimeString(language, { hour: 'numeric', minute: '2-digit' })
                  : '',
              })}
            </p>
            {!auth.user && auth.configured && (
              <button className="button button-primary" onClick={() => signIn('google')}>
                {t('instant.done.signIn')}
              </button>
            )}
            <button
              className="link-button"
              onClick={() => {
                setShowSettings(true)
                setShowApiKeyInput(true)
              }}
            >
              {t('instant.done.byok')}
            </button>
          </div>
        )}
```

`src/index.css` additions:

```css
.instant-quota {
  margin: 8px 0 0;
  font-size: 0.85rem;
  opacity: 0.8;
  text-align: center;
}

/* A product state, not an error — no red, no warning glyph */
.instant-done {
  margin-top: 16px;
  padding: 20px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.12);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
.instant-done h3 {
  margin: 0;
}

.turnstile-slot {
  position: fixed;
  inset-block-end: 12px;
  inset-inline-end: 12px;
  z-index: 50;
}
```

- [ ] **Step 5: The strings — all 12 locales**

Add to `src/i18n/locales/en.ts` (new `// --- instant ---` section; then translate the same 10 keys in es, fr, de, pt-BR, it, ja, ko, zh-Hans, ar, hi, el — keep `{n}`/`{time}` placeholders verbatim):

```ts
  // --- instant mode ---
  'instant.working': 'Writing your reply (no key needed)…',
  'instant.left': '{n} free replies left today',
  'instant.leftOne': '1 free reply left today',
  'instant.done.title': 'Free replies are done for today',
  'instant.done.body': 'They come back at {time}. Sign in for a bigger daily allowance, or add your own API key for unlimited replies that never touch our servers.',
  'instant.done.signIn': 'Sign in with Google',
  'instant.done.byok': 'Use my own API key instead',
  'instant.turnstile': 'Verification failed — reload the page and try again.',
  'instant.error': 'Instant mode is unavailable right now — try again shortly, or use your own API key.',
  'instant.badge': 'Instant mode',
```

(Use `instant.leftOne` when `remaining === 1`: `t(instantQuota.remaining === 1 ? 'instant.leftOne' : 'instant.left', { n: instantQuota.remaining })`.)

- [ ] **Step 6: Verify in the browser**

`npm run build`, restart `npx wrangler pages dev dist` (still with limiter dev + `.dev.vars` echo seam). In the browser at `127.0.0.1:8788`: clear localStorage keys `api_key_*`, generate → echo reply renders with strategy/message/weak-link; counter reads "2 free replies left today"; two more generations → `.instant-done` panel with a reset time and both escape hatches; add any API key → BYOK path unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/instant.ts src/turnstile.ts src/App.tsx src/index.css src/i18n/locales/
git commit -m "Add client Instant mode: keyless replies, quota counter, honest exhaustion state"
```

---

### Task 5: Phase A operations, privacy wording, deploy

**Goal:** The limiter and proxy run in production with real secrets (operator-performed), the README's privacy claim is rewritten the same day the proxy ships (a spec requirement), and Phase A is verified end-to-end on rebuttal.m36x.com.

**Files:**
- Modify: `README.md` (the "never sent to this app's own servers" claim + a new Instant mode section)
- Modify: `PROJECT_SUMMARY.md`, `DEPLOYMENT_GUIDE.md`
- Modify: `src/turnstile.ts` (paste the real sitekey)

**Acceptance Criteria:**
- [ ] All operator steps below are done by the USER (keys and secrets are never typed by the agent — hand over the exact commands and wait)
- [ ] README no longer claims text never reaches this app's servers; it says: only in Instant mode, only the argument text, never API keys
- [ ] Production: keyless generate returns a reply; 4th anonymous reply → the exhaustion panel; `curl` without Origin → 403; BYOK still browser-direct (verify in devtools: no `/api/generate` call when a key is saved)
- [ ] Docs cover: limiter deploy, both secrets, Turnstile site creation, the provisioned key's daily limit

**Verify:** production checks in Step 4.

**Steps:**

- [ ] **Step 1: Operator setup (hand these to the user — do not run the secret-bearing ones yourself)**

```bash
cd limiter && npx wrangler deploy
```

Then the user, interactively:
1. **OpenRouter provisioned key:** openrouter.ai → Settings → Provisioning API keys → create a runtime key with a **daily spend limit (start: $2/day)**. Then `npx wrangler pages secret put OPENROUTER_PROXY_KEY --project-name=m36x-rebuttal` and paste it.
2. **Turnstile:** Cloudflare dashboard → Turnstile → Add site (domain `rebuttal.m36x.com`, widget type **Managed**). Copy the sitekey into `TURNSTILE_SITE_KEY` in `src/turnstile.ts` (public, committable), then `npx wrangler pages secret put TURNSTILE_SECRET --project-name=m36x-rebuttal` with the secret key.
3. Secrets bind at deploy time — the Step 3 deploy below must happen AFTER the secrets are set (this bit us before: d97801d).

- [ ] **Step 2: Rewrite the privacy claims**

In `README.md`, find the claim that text is never sent to this app's own servers (near line 27, and the privacy section near line 434) and replace with wording equivalent to:

```markdown
Your API keys never touch this app's servers — BYOK calls go browser-direct to
the provider you chose. Your argument text stays in the browser too, with one
explicit exception: **Instant mode** (the free, keyless taste) sends the
argument text — and nothing else — to this app's `/api/generate` function so
our key can pay for the reply. No account required, nothing stored, and adding
your own key turns Instant mode off entirely.
```

Update `DEPLOYMENT_GUIDE.md` with: `cd limiter && npx wrangler deploy` (first, so the service binding resolves), both `secret put` commands, the Turnstile site step, and the note that ACCOUNTS KV creation is documented in wrangler.toml comments. Update `PROJECT_SUMMARY.md`'s architecture list with the limiter Worker and `/api/generate`.

- [ ] **Step 3: Deploy and verify in production**

```bash
npm run build
npx wrangler pages deploy dist --project-name=m36x-rebuttal --commit-dirty=true
```

- [ ] **Step 4: Production verification**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://rebuttal.m36x.com/api/generate -H "Content-Type: application/json" -d "{\"argument\":\"test\"}"
```
Expected: `403` (no browser origin). Then in a private browser window on rebuttal.m36x.com with no saved keys: one real generate (this spends ~$0.002 — the paid first reply) → reply renders with the weak-link note; the counter appears; confirm in DevTools → Network that with a saved key no request to `/api/generate` is made. Confirm the Turnstile widget did not visibly appear.

- [ ] **Step 5: Commit and push**

```bash
git add README.md PROJECT_SUMMARY.md DEPLOYMENT_GUIDE.md src/turnstile.ts
git commit -m "Ship Instant mode: docs, operator setup, and the honest privacy wording"
git push
```

---

## Phase B — Vault-encrypted history (independent of Phase A)

### Task 6: History data layer — ciphertext sync + local store

**Goal:** History entries save locally to IndexedDB on every generation (signed in or not), and sync to `ACCOUNTS` KV as ONE encrypted blob per account using the existing vault key. The server stores ciphertext only — same invariant, same code shape, as the key vault.

**Files:**
- Modify: `functions/_lib/session.js` (add `historyKey`)
- Create: `functions/api/history.js`
- Modify: `src/vault.ts` (export generic `sealJson`/`openJson`)
- Create: `src/history.ts`
- Create: `tests/history.test.ts`

**Context you need:** `functions/api/vault.js` is the template — clone its guard pattern (`requireAccounts` → `getSession` → 401), its base64 `isBlob` validation, and its `{salt, iv, ciphertext, version, updatedAt}` record, changing only the KV key prefix and the size cap. In `src/vault.ts`, `sealWith(key, bundle, salt)` (:191-206) and `decryptWith(key, blob)` (:141-160) are module-private and typed to `KeyBundle` — the new exports generalize them to any JSON value. The device key lives in IndexedDB `rebuttal-vault`/`keys` under id `'vault-key'` via `cachedKey()` (:100-101); `forgetDeviceKey()` (:107) already runs on sign-out.

**Acceptance Criteria:**
- [ ] `GET/PUT/DELETE /api/history` behave exactly like `/api/vault` (401 signed out, 501 unconfigured, field-validated PUT) with `MAX_CIPHERTEXT_CHARS = 200_000`
- [ ] `sealJson`/`openJson` round-trip an arbitrary object; a fresh 12-byte IV every seal; tampered ciphertext throws, never returns garbage
- [ ] `mergeEntries(local, remote)` unions by id, newest-first, caps at 100 — and is a pure function
- [ ] Local store works signed out; nothing in `src/history.ts` ever sends plaintext to any endpoint
- [ ] `npm run build` passes

**Verify:** `node --import tsx --test tests/history.test.ts` → pass (crypto + merge, in Node's WebCrypto); then with `npx wrangler pages dev dist`: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8788/api/history` → `401` (or `501` if ACCOUNTS is unbound locally — both prove the guard runs).

**Steps:**

- [ ] **Step 1: Write the failing tests**

`tests/history.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { sealJson, openJson } from '../src/vault'
import { mergeEntries, type HistoryEntry } from '../src/history'

// Node ships WebCrypto on globalThis.crypto (Node 20+), so the exact browser
// code paths run here unmodified.

async function testKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

test('sealJson/openJson round-trip arbitrary JSON', async () => {
  const key = await testKey()
  const value = { entries: [{ id: 'a', argument: 'x', createdAt: 1 }], v: 1 }
  const blob = await sealJson(key, value)
  assert.notEqual(blob.iv, '')
  const back = await openJson(key, blob)
  assert.deepEqual(back, value)
})

test('every seal uses a fresh IV', async () => {
  const key = await testKey()
  const a = await sealJson(key, { x: 1 })
  const b = await sealJson(key, { x: 1 })
  assert.notEqual(a.iv, b.iv)
  assert.notEqual(a.ciphertext, b.ciphertext)
})

test('tampered ciphertext throws', async () => {
  const key = await testKey()
  const blob = await sealJson(key, { x: 1 })
  const tampered = { ...blob, ciphertext: blob.ciphertext.slice(0, -4) + 'AAAA' }
  await assert.rejects(() => openJson(key, tampered))
})

const entry = (id: string, createdAt: number): HistoryEntry => ({
  id,
  createdAt,
  argument: `arg-${id}`,
  message: `msg-${id}`,
})

test('mergeEntries unions by id, newest first, capped at 100', () => {
  const local = [entry('a', 3), entry('b', 1)]
  const remote = [entry('a', 3), entry('c', 2)]
  const merged = mergeEntries(local, remote)
  assert.deepEqual(merged.map((e) => e.id), ['a', 'c', 'b'])

  const many = Array.from({ length: 150 }, (_, i) => entry(`m${i}`, i))
  assert.equal(mergeEntries(many, []).length, 100)
  assert.equal(mergeEntries(many, [])[0].id, 'm149') // newest kept
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/history.test.ts`
Expected: FAIL — `sealJson`, `openJson`, `mergeEntries` not exported.

- [ ] **Step 3: Server side**

In `functions/_lib/session.js`, next to `vaultKey` (:19):

```js
export const historyKey = (userId) => `history:${userId}`
```

`functions/api/history.js`:

```js
// Encrypted reply history — one ciphertext blob per account. Deliberately a
// near-clone of vault.js: same guard, same base64 validation, same
// {salt, iv, ciphertext, version} record, because the invariant is the same —
// this server must remain STRUCTURALLY unable to read what it stores. History
// is the most sensitive thing the app will ever hold (a longitudinal record of
// the user's disputes); it gets the vault treatment, not a smaller one.
import { getSession, jsonResponse, requireAccounts, historyKey } from '../_lib/session.js'

const MAX_CIPHERTEXT_CHARS = 200_000 // ~100 entries of realistic size, base64
const BASE64 = /^[A-Za-z0-9+/=]+$/
const isBlob = (value, maxChars) =>
  typeof value === 'string' && value.length > 0 && value.length <= maxChars && BASE64.test(value)

export async function onRequestGet(context) {
  const unconfigured = requireAccounts(context.env)
  if (unconfigured) return unconfigured
  const session = await getSession(context.request, context.env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)
  const raw = await context.env.ACCOUNTS.get(historyKey(session.userId))
  if (!raw) return jsonResponse({ history: null })
  try {
    return jsonResponse({ history: JSON.parse(raw) })
  } catch {
    return jsonResponse({ history: null })
  }
}

export async function onRequestPut(context) {
  const unconfigured = requireAccounts(context.env)
  if (unconfigured) return unconfigured
  const session = await getSession(context.request, context.env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)
  let body
  try {
    body = await context.request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON.' }, 400)
  }
  if (!isBlob(body?.salt, 64) || !isBlob(body?.iv, 64) || !isBlob(body?.ciphertext, MAX_CIPHERTEXT_CHARS)) {
    return jsonResponse({ error: 'Malformed history payload.' }, 400)
  }
  const record = {
    salt: body.salt,
    iv: body.iv,
    ciphertext: body.ciphertext,
    version: Number.isInteger(body.version) ? body.version : 1,
    updatedAt: Date.now(),
  }
  await context.env.ACCOUNTS.put(historyKey(session.userId), JSON.stringify(record))
  return jsonResponse({ ok: true, updatedAt: record.updatedAt })
}

export async function onRequestDelete(context) {
  const unconfigured = requireAccounts(context.env)
  if (unconfigured) return unconfigured
  const session = await getSession(context.request, context.env)
  if (!session) return jsonResponse({ error: 'Not signed in.' }, 401)
  await context.env.ACCOUNTS.delete(historyKey(session.userId))
  return jsonResponse({ ok: true })
}
```

(Check vault.js:20-21 for the exact `isBlob` it uses and keep the two in lockstep; if `requireAccounts` returns a Response vs null contract differs from shown, mirror vault.js exactly.)

- [ ] **Step 4: Generalize the crypto in `src/vault.ts`**

Add near the existing private helpers (after `sealWith`, ~:206), reusing `toBase64`/`fromBase64` (:56-62) and the `VaultBlob` type:

```ts
/**
 * Generic AES-GCM JSON sealing for other vault-key consumers (history).
 * Same key, same blob shape, fresh 12-byte IV per call — IV reuse under GCM
 * is catastrophic, so the IV is ALWAYS generated here, never passed in.
 */
export async function sealJson(key: CryptoKey, value: unknown): Promise<VaultBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return {
    salt: toBase64(crypto.getRandomValues(new Uint8Array(16))), // unused for decryption here; kept for blob-shape compatibility
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    version: VAULT_VERSION,
  }
}

export async function openJson<T = unknown>(key: CryptoKey, blob: VaultBlob): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) },
    key,
    fromBase64(blob.ciphertext)
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}
```

Also export the existing `cachedKey` if it is not already exported (history needs the device key): check :100-101; if private, add `export` — it returns `Promise<CryptoKey | null>`.

- [ ] **Step 5: The history module**

`src/history.ts`:

```ts
// Reply history: local-first, encrypted-sync second. Every generation lands in
// IndexedDB immediately (signed in or not); when the vault key is available,
// the newest 100 entries also sync to /api/history as ONE ciphertext blob —
// one KV write per save, and the server never sees plaintext. Losing the vault
// key loses the synced history by design; the local copy is unaffected.
import { sealJson, openJson, cachedKey, type VaultBlob } from './vault'
import type { Citation } from './providers'

export interface HistoryEntry {
  id: string
  createdAt: number
  argument: string
  message: string
  strategy?: string
  weakLink?: string
  citations?: Citation[]
  modelLabel?: string
  articleTitle?: string
  articleUrl?: string
}

export const HISTORY_CAP = 100
const DB_NAME = 'rebuttal-history'
const STORE = 'entries'

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null) // private browsing: history is a nice-to-have, never an error
    } catch {
      resolve(null)
    }
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function listEntries(): Promise<HistoryEntry[]> {
  const all = (await idb<HistoryEntry[]>('readonly', (s) => s.getAll())) || []
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, HISTORY_CAP)
}

export async function saveEntry(entry: HistoryEntry): Promise<void> {
  await idb('readwrite', (s) => s.put(entry))
}

export async function deleteEntry(id: string): Promise<void> {
  await idb('readwrite', (s) => s.delete(id))
}

export async function clearAllEntries(): Promise<void> {
  await idb('readwrite', (s) => s.clear())
}

/** Union by id, newest first, capped — pure, so it is unit-testable. */
export function mergeEntries(local: HistoryEntry[], remote: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>()
  for (const e of [...local, ...remote]) {
    if (!byId.has(e.id)) byId.set(e.id, e)
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, HISTORY_CAP)
}

// --- sync (same transport contract as fetchVault/saveVault in vault.ts) ---

export async function fetchHistoryBlob(): Promise<VaultBlob | null> {
  const res = await fetch('/api/history', { credentials: 'same-origin' }).catch(() => null)
  if (!res || res.status === 401 || res.status === 501) return null
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  return data?.history ?? null
}

export async function pushHistory(entries: HistoryEntry[]): Promise<void> {
  const key = await cachedKey()
  if (!key) return // no unlocked vault on this device — local-only, silently
  const blob = await sealJson(key, { v: 1, entries: entries.slice(0, HISTORY_CAP) })
  await fetch('/api/history', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(blob),
  }).catch(() => {}) // a failed sync is not worth interrupting the user (same policy as syncVault)
}

/** Pull the remote blob, merge with local, write the merge back locally. Returns the merged list. */
export async function pullAndMergeHistory(): Promise<HistoryEntry[] | null> {
  const key = await cachedKey()
  if (!key) return null
  const blob = await fetchHistoryBlob()
  const local = await listEntries()
  if (!blob) return local
  try {
    const remote = await openJson<{ v: number; entries: HistoryEntry[] }>(key, blob)
    const merged = mergeEntries(local, Array.isArray(remote?.entries) ? remote.entries : [])
    for (const e of merged) await saveEntry(e)
    return merged
  } catch {
    return local // wrong key or corrupt blob: local history still works
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --import tsx --test tests/history.test.ts` → PASS. `npm run build` → exits 0. Then `npx wrangler pages dev dist` and `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8788/api/history` → `401` or `501`.

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/session.js functions/api/history.js src/vault.ts src/history.ts tests/history.test.ts
git commit -m "Add vault-encrypted history: local-first store and ciphertext-only sync"
```

---

### Task 7: History UI — panel, hooks, sign-out wipe

**Goal:** A History panel for browsing/restoring/deleting past replies; every generation saves an entry; unlocking the vault pulls and merges; sign-out wipes the device copy (entries AND key), leaving server ciphertext for next sign-in.

**Files:**
- Create: `src/HistoryPanel.tsx`
- Modify: `src/App.tsx` (save hook in `generateReply`, pull hook in the vault-unlock effect :301-337, wipe in `handleSignOut` :823-832, panel mount + toggle)
- Modify: `src/index.css`
- Modify: all 12 `src/i18n/locales/*.ts` (8 keys)

**Acceptance Criteria:**
- [ ] Every successful generation (BYOK and Instant) appears in the panel immediately
- [ ] Restore repopulates the transcript and the full reply (message, strategy, weak-link, citations)
- [ ] Per-entry delete and clear-all work locally and push the change when the vault is unlocked
- [ ] Sign-out clears the local history store (verify IndexedDB `rebuttal-history` is empty after)
- [ ] Signed-out users still get local history; the panel shows the honest note that sync needs sign-in + vault
- [ ] `npm run build` passes; strings resolve in all 12 locales

**Verify:** browser flow in Step 5.

**Steps:**

- [ ] **Step 1: The component**

`src/HistoryPanel.tsx`:

```tsx
import type { HistoryEntry } from './history'
import type { TFunction } from './i18n'

interface Props {
  t: TFunction
  language: string
  entries: HistoryEntry[]
  synced: boolean
  onRestore: (entry: HistoryEntry) => void
  onDelete: (id: string) => void
  onClear: () => void
}

export default function HistoryPanel({ t, language, entries, synced, onRestore, onDelete, onClear }: Props) {
  if (!entries.length) {
    return <p className="history-empty">{t('history.empty')}</p>
  }
  return (
    <div className="history-panel">
      <p className="history-note">{synced ? t('history.synced') : t('history.localOnly')}</p>
      <ul className="history-list">
        {entries.map((entry) => (
          <li key={entry.id} className="history-item">
            <button className="history-restore" onClick={() => onRestore(entry)}>
              <span className="history-date">
                {new Date(entry.createdAt).toLocaleDateString(language, { month: 'short', day: 'numeric' })}
              </span>
              <span className="history-snippet">{entry.argument.slice(0, 80)}</span>
            </button>
            <button
              className="link-button history-delete"
              aria-label={t('history.delete')}
              onClick={() => onDelete(entry.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button className="link-button history-clear" onClick={onClear}>
        {t('history.clear')}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: App wiring**

In `src/App.tsx`:

(a) State + imports:

```ts
import HistoryPanel from './HistoryPanel'
import { listEntries, saveEntry, deleteEntry, clearAllEntries, pushHistory, pullAndMergeHistory, type HistoryEntry } from './history'
```

```ts
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
```

Load once on mount: `useEffect(() => { listEntries().then(setHistoryEntries) }, [])`.

(b) Save hook — one helper, called from BOTH reply paths (right after each `setReply({...})` in `generateReply`):

```ts
  const recordHistory = (message: string, strategy: string, weakLink: string, citationsUsed: Citation[]) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      argument: transcript.trim(),
      message,
      strategy,
      weakLink,
      citations: citationsUsed,
      modelLabel: model?.label,
      articleTitle: article?.title,
      articleUrl: article?.url,
    }
    saveEntry(entry).then(async () => {
      const all = await listEntries()
      setHistoryEntries(all)
      if (vaultState === 'unlocked') void pushHistory(all) // one KV write per save, ciphertext only
    })
  }
```

(c) Pull on unlock — in the existing vault effect (:301-337), after the branch that sets `vaultState('unlocked')`:

```ts
        void pullAndMergeHistory().then((merged) => {
          if (merged) {
            setHistoryEntries(merged)
            // Sign-in uploads the device backlog: entries generated while
            // signed out are in the merge, so pushing it completes the sync.
            void pushHistory(merged)
          }
        })
```

(and the same block in `handleVaultSubmit`'s successful-unlock branch, :856-882).

(d) Wipe on sign-out — in `handleSignOut` (:823-832), alongside `forgetDeviceKey()`:

```ts
    await clearAllEntries()
    setHistoryEntries([])
```

(e) Restore:

```ts
  const restoreFromHistory = (entry: HistoryEntry) => {
    setTranscript(entry.argument)
    setReply({
      message: entry.message,
      strategy: entry.strategy || '',
      context: null,
      citations: entry.citations || [],
      strippedUrls: [],
      unusedCitations: [],
      weakLink: entry.weakLink || '',
      toVerify: [],
      instant: true, // no lastRequestRef for a restored reply — suppress the briefing expander
    })
    setShowHistory(false)
  }
```

(Match the reply-state property list exactly as in Task 4.)

(f) Mount — a toggle button next to the settings toggle, and the panel below it:

```tsx
        <button className="link-button" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? t('history.hide') : t('history.show')}
        </button>
        {showHistory && (
          <HistoryPanel
            t={t}
            language={language}
            entries={historyEntries}
            synced={vaultState === 'unlocked'}
            onRestore={restoreFromHistory}
            onDelete={(id) => {
              deleteEntry(id).then(async () => {
                const all = await listEntries()
                setHistoryEntries(all)
                if (vaultState === 'unlocked') void pushHistory(all)
              })
            }}
            onClear={() => {
              if (!window.confirm(t('history.clearConfirm'))) return
              clearAllEntries().then(() => {
                setHistoryEntries([])
                if (vaultState === 'unlocked') void pushHistory([])
              })
            }}
          />
        )}
```

- [ ] **Step 3: Styles**

`src/index.css`:

```css
.history-panel { margin-top: 12px; }
.history-note { font-size: 0.8rem; opacity: 0.7; margin: 0 0 8px; }
.history-empty { font-size: 0.85rem; opacity: 0.7; }
.history-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.history-item { display: flex; align-items: center; gap: 8px; }
.history-restore {
  flex: 1; display: flex; gap: 10px; align-items: baseline; text-align: start;
  background: rgba(255, 255, 255, 0.08); border: none; border-radius: 8px;
  padding: 8px 12px; color: inherit; cursor: pointer;
}
.history-restore:hover { background: rgba(255, 255, 255, 0.16); }
.history-date { font-size: 0.75rem; opacity: 0.7; white-space: nowrap; }
.history-snippet { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-delete { opacity: 0.6; }
.history-clear { margin-top: 8px; font-size: 0.8rem; }
```

(Logical properties — `text-align: start` — keep RTL working, matching the codebase convention at index.css:892-897.)

- [ ] **Step 4: Strings ×12 locales**

`en.ts` (translate in the other 11):

```ts
  // --- history ---
  'history.show': 'History',
  'history.hide': 'Hide history',
  'history.empty': 'No saved replies yet — every reply you generate is saved here, on this device.',
  'history.localOnly': 'Saved on this device only. Sign in and unlock your vault to sync it, encrypted, across devices.',
  'history.synced': 'Encrypted and synced to your account. Only your devices can read it.',
  'history.delete': 'Delete this entry',
  'history.clear': 'Clear all history',
  'history.clearConfirm': 'Delete all saved replies? The synced copy is cleared too. This cannot be undone.',
```

- [ ] **Step 5: Verify in the browser, deploy, commit**

`npm run build`; `npx wrangler pages dev dist`; generate (echo seam or BYOK) → entry appears; restore an entry → transcript + reply repopulate; delete → gone; sign-out (if signed in locally) → panel empties and IndexedDB `rebuttal-history` is cleared (DevTools → Application). Deploy + spot-check production, then:

```bash
npm run build
npx wrangler pages deploy dist --project-name=m36x-rebuttal --commit-dirty=true
git add src/HistoryPanel.tsx src/App.tsx src/index.css src/i18n/locales/ 
git commit -m "Add reply history: local-first panel with encrypted account sync"
git push
```

---

## Phase C — Share pages and aggregate metrics (independent of Phases A/B, except metrics wiring uses Task 1's Worker)

### Task 8: `/s/<id>` — real share pages with per-share Open Graph meta

**Goal:** Share links become `https://rebuttal.m36x.com/s/<id>`, served by a Pages Function that returns the app shell with per-share OG tags injected — **byte-identical for every requester** (no User-Agent branching; per-share URLs make per-share content cache-safe). Old `?s=` links keep working.

**Files:**
- Create: `functions/s/[id].js`
- Modify: `src/share.ts` (`shareUrlFor` → path form; `sharedIdFromLocation` also reads the path; `clearSharedIdFromLocation` resets to `/`)
- Create: `tests/share-page.test.mjs`

**Context you need:** `public/404.html` exists, so Cloudflare Pages serves a 404 (not the SPA shell) for unknown paths — `/s/<id>` therefore MUST be a function route; functions take precedence over static assets. `env.ASSETS.fetch()` is implicitly available in Pages Functions (unused so far in this repo). The share record in `SHARES` KV has `{argument, message?, brief?/detailed? (legacy), citations?, articleTitle?, articleUrl?, createdAt?}` — the briefing and weak-link are NOT in the record, so the unfurl structurally cannot leak them. `index.html`'s head has `<title>` (line 17) and `<meta name="description">` (line 6) and no og: tags at all. `sw.js` treats `/s/*` as network-first navigations and only falls back to the cached shell when offline — no SW change needed. The client detects shares via `sharedIdFromLocation()` (share.ts:86-89, `?s=` only today) and renders the shared view (App.tsx:1027-1083) which already has the `share.writeYourOwn` CTA.

**Acceptance Criteria:**
- [ ] `GET /s/<valid-id>` → 200, the app shell with: rewritten `<title>`, rewritten meta description, `og:title`, `og:description` (first ~140 chars of the message, HTML-escaped), `og:type`, `og:url`, `og:site_name`, `twitter:card`
- [ ] Responses are byte-identical for a browser UA and a crawler UA (asserted in the test)
- [ ] Unknown/expired id → 404 with the 404.html body (noindex)
- [ ] The SPA on `/s/<id>` renders the shared view (path-based detection), and legacy `?s=` links still render
- [ ] New shares copy `/s/<id>` URLs; `Cache-Control: public, max-age=300` on success
- [ ] Nothing from the record beyond title/message-prefix reaches the meta; all injected values are HTML-escaped

**Verify:** `node --test tests/share-page.test.mjs` against `npx wrangler pages dev dist` (create a share first via curl in the test itself).

**Steps:**

- [ ] **Step 1: Write the failing tests**

`tests/share-page.test.mjs`:

```js
// Against `npx wrangler pages dev dist` with the SHARES KV bound (wrangler
// pages dev provides a local KV automatically from wrangler.toml).
import test from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.PAGES_URL || 'http://127.0.0.1:8788'
const ORIGIN = { Origin: BASE.replace(/\/$/, ''), 'Content-Type': 'application/json' }

async function createShare() {
  const res = await fetch(`${BASE}/api/share`, {
    method: 'POST',
    headers: ORIGIN,
    body: JSON.stringify({
      argument: 'Pineapple belongs on pizza because sweetness balances salt.',
      message: 'I hear the point about balance — and <b>this</b> is where I differ: acidity, not sweetness, is doing that work.',
      articleTitle: 'The Great Pizza Debate',
    }),
  })
  const { id } = await res.json()
  assert.ok(id, 'share creation must succeed')
  return id
}

test('share page carries per-share OG meta, escaped', async () => {
  const id = await createShare()
  const res = await fetch(`${BASE}/s/${id}`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('cache-control') || '', /max-age=300/)
  const html = await res.text()
  assert.match(html, /<meta property="og:title" content="Re: The Great Pizza Debate"/)
  assert.match(html, /<meta property="og:description" content="I hear the point about balance/)
  assert.match(html, /&lt;b&gt;/) // the <b> in the message must arrive escaped
  assert.doesNotMatch(html, /<meta property="og:description"[^>]*<b>/)
  assert.match(html, /<meta property="og:type" content="article"/)
  assert.match(html, /<meta name="twitter:card" content="summary"/)
  assert.match(html, /<title>Re: The Great Pizza Debate/)
  assert.match(html, /id="root"/) // still the app shell — the SPA renders the content
})

test('byte-identical for browser and crawler user agents', async () => {
  const id = await createShare()
  const [chrome, bot] = await Promise.all([
    fetch(`${BASE}/s/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126.0' } }).then((r) => r.text()),
    fetch(`${BASE}/s/${id}`, { headers: { 'User-Agent': 'Twitterbot/1.0' } }).then((r) => r.text()),
  ])
  assert.equal(chrome, bot)
})

test('unknown id is a 404 with the not-found page', async () => {
  const res = await fetch(`${BASE}/s/zzzzzzzzzzzzzzzz`)
  assert.equal(res.status, 404)
  const html = await res.text()
  assert.match(html, /noindex/)
})

test('malformed id is a 404, not an error', async () => {
  const res = await fetch(`${BASE}/s/..%2F..%2Fetc`)
  assert.equal(res.status, 404)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/share-page.test.mjs`
Expected: FAIL — `/s/<id>` returns the static 404 page with no OG meta.

- [ ] **Step 3: Implement `functions/s/[id].js`**

```js
// The share page: the app shell with THIS share's Open Graph meta injected.
// Two rules carried over from hard-won incidents and the spec:
//   1. IDENTICAL bytes for every requester. Serving crawlers different HTML
//      than humans is the same URL-keyed cache-poisoning class this app dug
//      out of on 2026-07-31 — per-share URLs already make per-share content
//      cache-safe, so there is nothing to gain and an outage to lose.
//   2. The unfurl draws ONLY from fields the user chose to publish. The
//      briefing and weak-link never reach the share record at all (see
//      functions/api/share.js), so they cannot leak here even by bug.
const ID_PATTERN = /^[A-Za-z0-9]{6,32}$/
const DESCRIPTION_CHARS = 140

const escapeHtml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const truncate = (value, max) => {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

async function notFound(context) {
  const page = await context.env.ASSETS.fetch(new URL('/404.html', context.request.url))
  return new Response(page.body, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function onRequestGet(context) {
  const id = String(context.params.id || '')
  if (!ID_PATTERN.test(id) || !context.env.SHARES) return notFound(context)

  const raw = await context.env.SHARES.get(id)
  if (!raw) return notFound(context)
  let record
  try {
    record = JSON.parse(raw)
  } catch {
    return notFound(context)
  }

  const message = record.message || record.brief || ''
  const title = record.articleTitle ? `Re: ${record.articleTitle}` : 'A considered reply'
  const description = truncate(message, DESCRIPTION_CHARS) || 'A reply written to change one specific mind.'
  const pageUrl = new URL(context.request.url)
  pageUrl.search = ''

  const og = [
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:url" content="${escapeHtml(pageUrl.toString())}" />`,
    `<meta property="og:site_name" content="Rebuttal Generator" />`,
    `<meta name="twitter:card" content="summary" />`,
    // Locale of the CONTENT (spec: "locale from the share") — present only on
    // shares published after the language field ships; older records omit it.
    ...(typeof record.language === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(record.language)
      ? [`<meta property="og:locale" content="${escapeHtml(record.language.replace('-', '_'))}" />`]
      : []),
  ].join('\n    ')

  // Aggregate metric, fire-and-forget — a daily integer, no per-user trail.
  if (context.env.LIMITER) {
    context.waitUntil(
      context.env.LIMITER.fetch('https://limiter/metric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'share_view' }),
      }).catch(() => {})
    )
  }

  const shell = await context.env.ASSETS.fetch(new URL('/index.html', context.request.url))
  const rewritten = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(`${title} — Rebuttal Generator`)
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', description)
      },
    })
    .on('head', {
      element(el) {
        el.append(`\n    ${og}\n`, { html: true })
      },
    })
    .transform(new Response(shell.body, shell))

  return new Response(rewritten.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
```

- [ ] **Step 3b: Carry the content language into the share record**

Three one-line changes so `og:locale` has data:

1. `functions/api/share.js` — add to the field-by-field record build (:78-92, alongside `articleTitle`):

```js
    language: /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(payload?.language || '') ? payload.language : undefined,
```

2. `src/share.ts` — add `language?: string` to `SharedRebuttal` (:16-30) and to the `publishResult` payload type.
3. `src/App.tsx` `handleShare` (:473-497) — pass `language: lastRequestRef.current?.promptContext.replyLanguage` in the `publishResult({...})` call.

- [ ] **Step 4: Client-side path handling in `src/share.ts`**

Replace `shareUrlFor` (:83) and extend `sharedIdFromLocation` (:86-89) / `clearSharedIdFromLocation` (:92-96):

```ts
/** New links are path-based so the share function can serve per-share OG meta. */
export const shareUrlFor = (id: string) => `${window.location.origin}/s/${id}`

const ID_PATTERN = /^[A-Za-z0-9]{6,32}$/

export function sharedIdFromLocation(): string | null {
  // Path form first (the canonical shape) …
  const pathMatch = window.location.pathname.match(/^\/s\/([A-Za-z0-9]{6,32})\/?$/)
  if (pathMatch) return pathMatch[1]
  // … then the legacy query form — old links keep working indefinitely.
  const id = new URLSearchParams(window.location.search).get('s')
  return id && ID_PATTERN.test(id) ? id : null
}

export function clearSharedIdFromLocation(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('s')
  if (/^\/s\//.test(url.pathname)) url.pathname = '/'
  window.history.replaceState(null, '', url.toString())
}
```

(Keep the existing exact function names — App.tsx:458-465 and :467-471 call them; no App changes needed for detection.)

- [ ] **Step 5: Run tests, build, verify the client**

`npm run build`; restart `npx wrangler pages dev dist`; `node --test tests/share-page.test.mjs` → PASS (4/4). In the browser: publish a share (echo/BYOK reply → share row), copy link → it is `/s/<id>`; open it in a private window → shared view renders; open a legacy `/?s=<id>` URL → still renders.

- [ ] **Step 6: Commit**

```bash
git add functions/s/ functions/api/share.js src/share.ts src/App.tsx tests/share-page.test.mjs
git commit -m "Serve share links from /s/<id> with per-share Open Graph meta, UA-invariant"
```

---

### Task 9: Aggregate metrics — the counter bridge, the CTA beacon, the operator readback

**Goal:** The four funnel numbers the spec names (share views, CTA clicks, instant replies, exhaustion hits) accumulate as daily integers in the limiter DO; the share-page CTA beacons its click; the operator — and only the operator — can read the totals.

**Files:**
- Create: `functions/api/metric.js`
- Create: `functions/api/metrics.js`
- Modify: `src/App.tsx` (beacon in `dismissShared`, :467-471)
- Modify: `tests/limiter.test.mjs` (no change needed — metric routes already covered; extend only if gaps found)

**Acceptance Criteria:**
- [ ] `POST /api/metric {name}` accepts ONLY allowlisted names, requires the same-origin gate, forwards to LIMITER, returns 204
- [ ] Clicking the shared-view CTA fires a `share_cta` beacon (visible in dev tools / limiter metrics)
- [ ] `GET /api/metrics` returns totals only for a signed-in user whose email equals `OPERATOR_EMAIL`; 404 otherwise (existence unadvertised); 501 when the var is unset
- [ ] No metric call ever carries user data — name only

**Verify:** `curl -X POST http://127.0.0.1:8788/api/metric -H "Origin: http://127.0.0.1:8788" -H "Content-Type: application/json" -d "{\"name\":\"share_cta\"}"` → 204; same with `name:"bogus"` → 400; `curl http://127.0.0.1:8788/api/metrics` → 404/501.

**Steps:**

- [ ] **Step 1: `functions/api/metric.js`**

```js
// Aggregate-only event counting. A metric is a NAME and nothing else — no ids,
// no payload, no user agent, no referrer stored. The allowlist is the whole
// schema; anything not on it is a client bug, not a new metric.
import { jsonResponse } from '../_lib/session.js'

const ALLOWED = new Set(['share_cta', 'share_view', 'instant_reply', 'instant_exhausted'])

function isSameOriginBrowserRequest(request) {
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
```

- [ ] **Step 2: `functions/api/metrics.js` (operator readback)**

```js
// Reading the totals requires being signed in AS the operator. Everyone else
// gets a 404 — the endpoint's existence is not worth advertising with a 403.
import { getSession, jsonResponse, requireAccounts } from '../_lib/session.js'

export async function onRequestGet(context) {
  const { env, request } = context
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
```

Operator setup (user-run, alongside Task 5's secrets): `npx wrangler pages secret put OPERATOR_EMAIL --project-name=m36x-rebuttal` (their Google-account email).

- [ ] **Step 3: The CTA beacon**

In `src/App.tsx`, `dismissShared` (:467-471) — fire before clearing:

```ts
  const dismissShared = () => {
    // Aggregate loop-conversion signal — a name, nothing else (spec, Section 4)
    try {
      navigator.sendBeacon('/api/metric', new Blob([JSON.stringify({ name: 'share_cta' })], { type: 'application/json' }))
    } catch {
      /* metrics must never break navigation */
    }
    setShared(null)
    setSharedError('')
    clearSharedIdFromLocation()
  }
```

(`sendBeacon` sends the Origin header, so the gate passes. Keep whatever else the current `dismissShared` body does — this adds one statement at the top.)

- [ ] **Step 4: Verify and commit**

Run the three curl checks from **Verify** above; in the browser open a share page, click the CTA, then `curl "http://127.0.0.1:8788/api/metrics"` → 404 (signed out). Confirm via the limiter directly: `curl "http://127.0.0.1:8787/metrics?days=1"` shows `share_cta` and `share_view` rows.

```bash
git add functions/api/metric.js functions/api/metrics.js src/App.tsx
git commit -m "Count the funnel in daily aggregates: metric bridge, CTA beacon, operator readback"
```

---

### Task 10: Phase C ship — docs, deploy, and the cross-phase verification sweep

**Goal:** Everything deployed and verified against production; docs reflect the new share URLs, history, and metrics; the plan's invariants re-checked end to end.

**Files:**
- Modify: `README.md` (share section: `/s/<id>` links, old links still work; history section; stale line 6 of `index.html`'s description — update it to "Write the reply that actually changes their mind" while touching meta)
- Modify: `index.html` (the generic meta description — see above)
- Modify: `PROJECT_SUMMARY.md`, `DEPLOYMENT_GUIDE.md` (OPERATOR_EMAIL secret; the full secret list in one place)

**Acceptance Criteria:**
- [ ] Production: a fresh share unfurls (curl shows OG tags on rebuttal.m36x.com), old `?s=` links render, history syncs for a signed-in+unlocked account, Instant mode live
- [ ] The UA-invariance check passes IN PRODUCTION (chrome vs Twitterbot UA → identical bytes)
- [ ] `npm test` green (all five test files), `npm run build` green
- [ ] Every spec invariant re-verified (checklist in Step 3)

**Steps:**

- [ ] **Step 1: Docs**

README: add a "Share pages" paragraph (canonical `/s/<id>`, per-share unfurls, legacy `?s=` supported), a "History" paragraph (local-first, vault-encrypted sync, lost-key-loses-synced-history stated plainly), and the metrics stance (aggregate daily integers, no third-party analytics). Update index.html line 6's description. DEPLOYMENT_GUIDE: consolidated secrets table — `OPENROUTER_PROXY_KEY`, `TURNSTILE_SECRET`, `OPERATOR_EMAIL` (+ the pre-existing Google OAuth pair), and the two-step deploy (`limiter/` first, Pages second).

- [ ] **Step 2: Deploy**

```bash
npm run build
npx wrangler pages deploy dist --project-name=m36x-rebuttal --commit-dirty=true
```

- [ ] **Step 3: The invariant sweep (production)**

```bash
curl -s https://rebuttal.m36x.com/s/<a-real-id> | grep -c "og:title"
```
→ `1`; repeat with `-H "User-Agent: Twitterbot/1.0"` and diff the two outputs → identical. Then: `/api/generate` without Origin → 403; a share POST cross-origin → 403; `/api/metrics` signed out → 404; a generated message contains no watermark or footer (read one end to end); DevTools on a BYOK generation shows zero requests to any `/api/*` generation endpoint.

- [ ] **Step 4: Commit and push**

```bash
git add README.md PROJECT_SUMMARY.md DEPLOYMENT_GUIDE.md index.html
git commit -m "Document and ship the growth loop: share unfurls, history, aggregate metrics"
git push
```

---

## Execution order and dependencies

```
Task 1 (limiter) ──┬─→ Task 3 (proxy) ─→ Task 4 (client) ─→ Task 5 (ship A)
Task 2 (prompts) ──┘
Task 6 (history data) ─→ Task 7 (history UI)                  [independent of A]
Task 8 (/s/ pages) ─→ Task 9 (metrics; also needs Task 1) ─→ Task 10 (ship C)
```

Phases can be executed A→B→C or interleaved; each phase ends with a deploy of working software.





