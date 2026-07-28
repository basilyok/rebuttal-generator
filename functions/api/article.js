// Cloudflare Pages Function: extract readable text from an article URL.
//
// Browsers cannot fetch arbitrary pages (CORS), so extraction happens here at
// the edge. When the live page cannot be read — paywall, login wall, bot check
// — we look for a publicly archived copy in the Internet Archive's Wayback
// Machine, which is itself unreachable from browser JS.
//
// This endpoint only ever receives a public article URL. API keys stay in the
// browser and never pass through here.

const MAX_CHARS = 20_000
const MIN_WORDS = 120
const FETCH_TIMEOUT_MS = 20_000

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const PAYWALL_MARKERS =
  /(subscribe to (continue|read)|already a (subscriber|member)|this (article|story) is for subscribers|create an account to (read|continue)|sign in to (read|continue)|you'?ve reached your (article )?limit|become a member to)/i

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  })

const countWords = (text) => (text.trim().match(/\S+/g) || []).length

/** Reject anything that is not a public http(s) address. */
function validateUrl(input) {
  let parsed
  try {
    parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    return null
  }
  if (!/^https?:$/.test(parsed.protocol)) return null
  const host = parsed.hostname.toLowerCase()
  if (!host.includes('.')) return null
  // Never let this be used to probe private or link-local address space
  if (
    host === 'localhost' ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    return null
  }
  return parsed.toString()
}

/** Pull prose out of an HTML document using Cloudflare's streaming parser. */
async function extractText(response) {
  const blocks = []
  let title = ''
  let buffer = ''
  let skipDepth = 0

  const rewriter = new HTMLRewriter()
    .on('title', {
      text(chunk) {
        title += chunk.text
      },
    })
    // Content in these containers is chrome, not article prose
    .on('script, style, noscript, nav, header, footer, aside, form, figure, iframe', {
      element(el) {
        skipDepth++
        el.onEndTag(() => {
          skipDepth--
        })
      },
    })
    .on('p, h1, h2, h3, h4, blockquote, li', {
      element(el) {
        buffer = ''
        el.onEndTag(() => {
          const text = buffer.replace(/\s+/g, ' ').trim()
          // Short fragments without sentence punctuation are nav/menu items
          if (text && (text.length > 40 || /[.!?:]$/.test(text))) blocks.push(text)
          buffer = ''
        })
      },
      text(chunk) {
        if (skipDepth === 0) buffer += chunk.text
      },
    })

  await rewriter.transform(response).arrayBuffer()

  // De-duplicate repeated boilerplate lines while preserving order
  const seen = new Set()
  const body = blocks
    .filter((b) => {
      const key = b.slice(0, 80)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join('\n\n')

  return { title: title.replace(/\s+/g, ' ').trim(), body }
}

async function readPage(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) return { ok: false, status: response.status }
  const type = response.headers.get('content-type') || ''
  if (!/text\/html|application\/xhtml/i.test(type)) return { ok: false, status: 415 }

  const { title, body } = await extractText(response)
  const words = countWords(body)
  // A real article that merely carries a subscription prompt is still usable;
  // only a short stub that is *mostly* the prompt counts as a paywall capture.
  const usable = words >= MIN_WORDS && !(words < 200 && PAYWALL_MARKERS.test(body))
  return { ok: true, usable, title, body, words }
}

async function findArchivedCopy(url, diag) {
  try {
    const response = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    })
    diag.waybackStatus = response.status
    if (!response.ok) return null
    const data = await response.json().catch(() => null)
    const snapshot = data?.archived_snapshots?.closest
    diag.waybackSnapshot = snapshot?.url ?? null
    if (!snapshot?.available || !String(snapshot.status).startsWith('2')) return null
    // "id_" returns the original capture without the Wayback navigation chrome
    return String(snapshot.url).replace(/^http:/, 'https:').replace(/\/web\/(\d+)\//, '/web/$1id_/')
  } catch (err) {
    diag.waybackError = String(err).slice(0, 120)
    return null
  }
}

export async function onRequestGet(context) {
  const params = new URL(context.request.url).searchParams
  const target = params.get('url')
  const debug = params.get('debug') === '1'
  const diag = {}

  if (!target) return json({ error: 'Missing url parameter.' }, 400)

  const url = validateUrl(target)
  if (!url) return json({ error: 'That is not a valid public web address.' }, 400)

  let result
  try {
    result = await readPage(url)
  } catch (err) {
    diag.sourceError = String(err).slice(0, 120)
    result = { ok: false, status: 0 }
  }
  diag.sourceOk = result.ok
  diag.sourceStatus = result.status
  diag.sourceWords = result.words

  let via = 'source'

  if (!result.ok || !result.usable) {
    const snapshot = await findArchivedCopy(url, diag)
    if (snapshot) {
      try {
        const archived = await readPage(snapshot)
        diag.archiveOk = archived.ok
        diag.archiveStatus = archived.status
        diag.archiveWords = archived.words
        if (archived.ok && archived.usable) {
          result = archived
          via = 'archive'
        }
      } catch (err) {
        diag.archiveError = String(err).slice(0, 120)
      }
    }
  }

  if (!result.ok || !result.usable) {
    return json(
      {
        error:
          "This article can't be read automatically — it's likely behind a paywall or login, and no public archived copy was found. Open the article yourself and paste its text into the box instead.",
        ...(debug ? { diag } : {}),
      },
      422
    )
  }

  const truncated = result.body.length > MAX_CHARS
  const text = truncated ? `${result.body.slice(0, MAX_CHARS).trimEnd()}…` : result.body

  return json({
    title: result.title || 'Untitled article',
    text,
    url,
    via,
    truncated,
    words: countWords(text),
    ...(debug ? { diag } : {}),
  })
}
