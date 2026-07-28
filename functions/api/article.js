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
/** Ceiling on how much HTML we will pull down, so a huge page cannot exhaust the isolate. */
const MAX_BYTES = 4_000_000

// HTMLRewriter hands back raw source text, so entities arrive undecoded.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  sbquo: '‚', bdquo: '„', mdash: '—', ndash: '–',
  hellip: '…', bull: '•', middot: '·', deg: '°',
  laquo: '«', raquo: '»', prime: '′', Prime: '″',
  trade: '™', reg: '®', copy: '©', euro: '€',
  pound: '£', yen: '¥', cent: '¢', sect: '§',
  para: '¶', dagger: '†', permil: '‰', times: '×',
  divide: '÷', plusmn: '±', frac12: '½', frac14: '¼',
  ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '', zwj: '', lrm: '', rlm: '',
}

function decodeEntities(text) {
  if (!text.includes('&')) return text
  return text.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, entity) => {
    if (entity[0] === '#') {
      const codePoint =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10)
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return match
      }
    }
    const named = NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()]
    return named === undefined ? match : named
  })
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const PAYWALL_MARKERS =
  /(subscribe to (continue|read)|already a (subscriber|member)|this (article|story) is for subscribers|create an account to (read|continue)|sign in to (read|continue)|you'?ve reached your (article )?limit|become a member to)/i

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Never cache failures: they are often transient (archive.org rate limits,
      // upstream hiccups) and a cached 4xx makes the user's retry a silent no-op.
      'Cache-Control': status >= 400 ? 'no-store' : 'public, max-age=300',
    },
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

  // A trailing dot is preserved by URL parsing and would slip past exact matches
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return null

  // Reject IPv6 literals outright — URL serialises them in brackets
  if (host.startsWith('[')) return null

  const labels = host.split('.')
  if (labels.length < 2) return null // bare hostnames are never public
  if (labels.includes('localhost')) return null
  if (['internal', 'local', 'localdomain', 'home', 'lan', 'intranet', 'corp'].includes(labels[labels.length - 1])) {
    return null
  }

  // Numeric literals: block every non-public IPv4 range. Note new URL() has
  // already normalised decimal/octal/hex forms (e.g. 2130706433, 0177.0.0.1)
  // into dotted-decimal, so this sees the canonical address.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number)
    if (
      a === 0 || a === 127 || a === 10 ||
      a >= 224 || // multicast and reserved
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 198 && (b === 18 || b === 19)) // benchmarking
    ) {
      return null
    }
  }

  return parsed.toString()
}

/** Pull prose out of an HTML document using Cloudflare's streaming parser. */
async function extractText(response) {
  const blocks = []
  const seen = new Set()
  let title = ''
  let buffer = ''
  let skipDepth = 0
  let totalChars = 0

  // Emit whatever has accumulated as one block. Called at every block boundary
  // — both starts and ends — so text is never discarded when elements nest or
  // when an optional end tag (</p>, </li>) is omitted.
  const flush = () => {
    if (!buffer) return
    const text = decodeEntities(buffer).replace(/\s+/g, ' ').trim()
    buffer = ''
    if (!text) return
    // Short fragments without sentence punctuation are nav/menu items
    if (text.length <= 40 && !/[.!?:]$/.test(text)) return
    const key = text.slice(0, 80)
    if (seen.has(key)) return // repeated boilerplate
    seen.add(key)
    blocks.push(text)
    totalChars += text.length
  }

  // Inside SVG/MathML the parser honours `/>`, and lol-html rejects an end-tag
  // handler on a self-closing element. Losing that bookkeeping must not abort
  // extraction or strand the skip counter.
  const onEndTag = (el, handler, onUnavailable) => {
    try {
      el.onEndTag(handler)
    } catch {
      onUnavailable?.()
    }
  }

  const rewriter = new HTMLRewriter()
    .on('title', {
      text(chunk) {
        if (title.length < 500) title += chunk.text
      },
    })
    // Content in these containers is chrome, not article prose
    .on('script, style, noscript, nav, header, footer, aside, form, figure, iframe', {
      element(el) {
        skipDepth++
        onEndTag(
          el,
          () => {
            skipDepth--
          },
          // Self-closing: there is no content to skip, so undo immediately
          () => {
            skipDepth--
          }
        )
      },
    })
    .on('p, h1, h2, h3, h4, blockquote, li', {
      element(el) {
        flush()
        onEndTag(el, flush)
      },
      text(chunk) {
        // Stop accumulating well past the cap; the tail is discarded anyway
        if (skipDepth === 0 && totalChars < MAX_CHARS * 2) buffer += chunk.text
      },
    })

  // Drain the transformed stream without materialising it — the rewritten
  // bytes are never read, only the handler side effects matter.
  await rewriter.transform(response).body.pipeTo(new WritableStream())
  flush()

  return { title: decodeEntities(title).replace(/\s+/g, ' ').trim(), body: blocks.join('\n\n') }
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
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > MAX_BYTES) return { ok: false, status: 413 }

  const { title, body } = await extractText(response)
  const words = countWords(body)
  // A real article that merely carries a subscription prompt is still usable;
  // only a short stub that is *mostly* the prompt counts as a paywall capture.
  const usable = words >= MIN_WORDS && !(words < 200 && PAYWALL_MARKERS.test(body))
  return { ok: true, usable, title, body, words }
}

/** "id_" returns the original capture without the Wayback navigation chrome. */
const snapshotUrl = (timestamp, original) => `https://web.archive.org/web/${timestamp}id_/${original}`

/**
 * Locate a public archived copy. Two lookups, because the availability API
 * intermittently answers 200 with an empty result set when archive.org is under
 * load — the CDX index usually still responds in that window.
 */
async function findArchivedCopy(url, diag) {
  try {
    const response = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    })
    diag.waybackStatus = response.status
    if (response.ok) {
      const data = await response.json().catch(() => null)
      const snapshot = data?.archived_snapshots?.closest
      diag.waybackSnapshot = snapshot?.url ?? null
      if (snapshot?.available && String(snapshot.status).startsWith('2') && snapshot.timestamp) {
        return snapshotUrl(snapshot.timestamp, url)
      }
    }
  } catch (err) {
    diag.waybackError = String(err).slice(0, 120)
  }

  try {
    const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
      url
    )}&output=json&limit=-1&filter=statuscode:200&fl=timestamp,original`
    const response = await fetch(cdx, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
    diag.cdxStatus = response.status
    if (!response.ok) return null
    const rows = await response.json().catch(() => null)
    // Row 0 is the column header; the most recent capture follows
    const row = Array.isArray(rows) && rows.length > 1 ? rows[rows.length - 1] : null
    if (!row?.[0]) return null
    diag.cdxSnapshot = row[0]
    return snapshotUrl(row[0], row[1] || url)
  } catch (err) {
    diag.cdxError = String(err).slice(0, 120)
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
