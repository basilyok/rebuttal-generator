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
