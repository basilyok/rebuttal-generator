// Cloudflare Pages Function: store and retrieve shared rebuttals.
//
// Publishing mints an unguessable id and stores the result in KV. Links are
// UNLISTED, not private — anyone holding the link can read it, and there is no
// browsable index. Nothing here is discoverable without the id.
//
// API keys never reach this endpoint: the client sends only the finished text.

const MAX_BYTES = 100_000
const MAX_FIELD = 40_000
/** Shared links expire after a year so abandoned content does not live forever. */
const TTL_SECONDS = 60 * 60 * 24 * 365
const ID_LENGTH = 16
const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Shared results are immutable; failures must never be cached
      'Cache-Control': status >= 400 ? 'no-store' : 'public, max-age=600',
    },
  })

/** Unguessable id — this is what makes an unlisted link unlisted. */
function makeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH))
  let id = ''
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length]
  return id
}

const asText = (value, limit = MAX_FIELD) =>
  typeof value === 'string' && value.trim() ? value.slice(0, limit) : undefined

/** Keep only citations that are real http(s) links. */
function cleanCitations(value) {
  if (!Array.isArray(value)) return undefined
  const out = []
  for (const item of value.slice(0, 20)) {
    const url = asText(item?.url, 2000)
    if (!url || !/^https?:\/\//i.test(url)) continue
    out.push({ url, title: asText(item?.title, 300) || '' })
  }
  return out.length ? out : undefined
}

export async function onRequestPost(context) {
  const store = context.env?.SHARES
  if (!store) return json({ error: 'Sharing is not configured on this deployment.' }, 501)

  const raw = await context.request.text()
  if (raw.length > MAX_BYTES) {
    return json({ error: 'That rebuttal is too large to share.' }, 413)
  }

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return json({ error: 'Malformed request.' }, 400)
  }

  const argument = asText(payload?.argument)
  const message = asText(payload?.message)
  const brief = asText(payload?.brief)
  const detailed = asText(payload?.detailed)
  // Accept the current shape (message) or the pre-constitution one (brief+detailed)
  if (!argument || !(message || (brief && detailed))) {
    return json({ error: 'A shared reply needs the argument and the message.' }, 400)
  }

  // Build the record field by field — never persist arbitrary client JSON, so a
  // stray key (an API key above all) cannot be smuggled into storage.
  // Note what is deliberately absent: the weak-link note and the briefing are private
  // notes to the sender. Publishing them would hand the recipient the sender's own doubts.
  const record = {
    argument,
    message,
    strategy: asText(payload?.strategy, 1000),
    brief,
    detailed,
    steelman: asText(payload?.steelman),
    citations: cleanCitations(payload?.citations),
    steelmanCitations: cleanCitations(payload?.steelmanCitations),
    modelLabel: asText(payload?.modelLabel, 200),
    providerLabel: asText(payload?.providerLabel, 200),
    articleUrl: /^https?:\/\//i.test(payload?.articleUrl || '') ? asText(payload.articleUrl, 2000) : undefined,
    articleTitle: asText(payload?.articleTitle, 500),
    createdAt: new Date().toISOString(),
  }

  const id = makeId()
  await store.put(id, JSON.stringify(record), { expirationTtl: TTL_SECONDS })
  return json({ id })
}

export async function onRequestGet(context) {
  const store = context.env?.SHARES
  if (!store) return json({ error: 'Sharing is not configured on this deployment.' }, 501)

  const id = new URL(context.request.url).searchParams.get('id')
  if (!id || !/^[A-Za-z0-9]{6,32}$/.test(id)) {
    return json({ error: 'That share link is not valid.' }, 400)
  }

  const stored = await store.get(id)
  if (!stored) {
    return json({ error: 'That shared rebuttal no longer exists — links expire after a year.' }, 404)
  }

  try {
    return json(JSON.parse(stored))
  } catch {
    return json({ error: 'That shared rebuttal could not be read.' }, 500)
  }
}
