// Article fetching for URL input.
//
// Virtually no publisher sends permissive CORS headers, so the browser cannot
// fetch an article page directly. Two paths, in order:
//
//  1. /api/article — a Cloudflare Pages Function that runs at the edge, where
//     CORS does not apply. It can also reach the Internet Archive's Wayback
//     Machine, which blocks browser requests, so it is the only path that can
//     recover an article whose live page is unreadable.
//  2. Jina Reader (r.jina.ai) — a CORS-enabled reader service, used when the
//     function is unavailable (e.g. `npm run dev`, which serves no functions).
//
// Only the public article URL is ever sent anywhere. API keys stay in the
// browser and never touch either service.

export interface Article {
  title: string
  text: string
  url: string
  /** Where the readable copy came from */
  via: 'source' | 'archive'
  truncated: boolean
  words: number
}

const READER = 'https://r.jina.ai/'

/** Keep prompts (and cost) bounded — roughly 5,000 words. */
const MAX_CHARS = 20_000
/** Below this, the "article" is a stub: a paywall notice, a bot check, or nothing. */
const MIN_WORDS = 120

export class ArticleError extends Error {}

export function normalizeUrl(input: string): string {
  const raw = input.trim()
  if (!raw) throw new ArticleError('Enter the address of an article first.')
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    throw new ArticleError(`"${input.trim()}" is not a valid web address.`)
  }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) {
    throw new ArticleError(`"${input.trim()}" is not a valid web address.`)
  }
  return parsed.toString()
}

/** Reader output is markdown, but entities can still survive in it. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  mdash: '—', ndash: '–', hellip: '…', bull: '•',
}

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const codePoint =
        entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return match
      }
    }
    return NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/** Strip markdown noise so the model sees prose, not navigation chrome. */
function cleanMarkdown(markdown: string): string {
  return decodeEntities(markdown)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> their text
    .replace(/^\s*[*+-]\s*$/gm, '')
    .replace(/^={3,}$|^-{3,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    // Drop leftover nav/boilerplate lines: very short, no sentence punctuation
    .filter((line, i, all) => {
      const t = line.trim()
      if (!t) return all[i - 1]?.trim() !== ''
      return t.length > 40 || /[.!?:]$/.test(t) || /^#{1,6}\s/.test(t)
    })
    .join('\n')
    .trim()
}

const countWords = (text: string) => (text.trim().match(/\S+/g) || []).length

interface ReaderResult {
  title: string
  body: string
  blocked: boolean
}

async function readViaReader(url: string): Promise<ReaderResult> {
  let response: Response
  try {
    response = await fetch(READER + url, { signal: AbortSignal.timeout(45_000) })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ArticleError('That page took too long to load. Try again, or paste the text instead.')
    }
    throw new ArticleError('Could not reach the article reader service. Check your connection and try again.')
  }

  if (response.status === 429) {
    throw new ArticleError('The free article reader is rate-limited right now. Wait a moment, or paste the text instead.')
  }
  if (!response.ok) {
    throw new ArticleError(`The article could not be loaded (HTTP ${response.status}). Try pasting the text instead.`)
  }

  const raw = await response.text()
  const title = (raw.match(/^Title:\s*(.+)$/m)?.[1] || '').trim()
  // Reader emits metadata lines, then "Markdown Content:" followed by the body
  const split = raw.split(/^Markdown Content:\s*$/m)
  const body = cleanMarkdown((split[1] ?? split[0] ?? '').trim())

  const blocked =
    /Warning:.*(CAPTCHA|authoriz)/i.test(raw) ||
    // Reader falls back to the bare domain as the title when it gets no article
    /^[\w.-]+\.[a-z]{2,}$/i.test(title) ||
    countWords(body) < MIN_WORDS

  return { title, body, blocked }
}

/** Marker phrases that indicate we captured a paywall notice rather than the article. */
const PAYWALL_MARKERS =
  /(subscribe to (continue|read)|already a (subscriber|member)|this (article|story) is for subscribers|create an account to (read|continue)|sign in to (read|continue)|you'?ve reached your (article )?limit|become a member to)/i

function looksLikePaywallStub(text: string): boolean {
  // A real article that merely carries a subscription prompt is still usable;
  // only a short stub that is *mostly* the prompt counts as a paywall capture.
  return countWords(text) < 200 && PAYWALL_MARKERS.test(text)
}

const NOT_READABLE =
  "This article can't be read automatically — it's likely behind a paywall or login, and no public archived copy was found. " +
  'Open the article yourself and paste its text into the box instead.'

/**
 * Try the edge function. Returns null when it isn't deployed (local dev) so the
 * caller can fall back; throws ArticleError when it ran and refused the URL.
 */
async function fetchViaFunction(url: string): Promise<Article | null> {
  let response: Response
  try {
    response = await fetch(`/api/article?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(60_000) })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ArticleError('That page took too long to load. Try again, or paste the text instead.')
    }
    return null
  }

  // No function deployed: the SPA fallback serves index.html instead of JSON
  if (response.status === 404) return null
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return null

  const data = await response.json().catch(() => null)
  if (!data) return null
  if (!response.ok) throw new ArticleError(data.error || NOT_READABLE)

  return {
    title: data.title,
    text: data.text,
    url: data.url ?? url,
    via: data.via === 'archive' ? 'archive' : 'source',
    truncated: !!data.truncated,
    words: data.words ?? countWords(data.text ?? ''),
  }
}

/** Browser-only path. Cannot reach the Wayback Machine, which blocks browser requests. */
async function fetchViaReader(url: string): Promise<Article> {
  const result = await readViaReader(url)
  if (result.blocked || looksLikePaywallStub(result.body)) throw new ArticleError(NOT_READABLE)

  const truncated = result.body.length > MAX_CHARS
  const text = truncated ? `${result.body.slice(0, MAX_CHARS).trimEnd()}…` : result.body

  return {
    title: result.title || 'Untitled article',
    text,
    url,
    via: 'source',
    truncated,
    words: countWords(text),
  }
}

/**
 * Fetch an article's text. Falls back to a public Wayback Machine snapshot when
 * the live page cannot be read, and throws an ArticleError with a plain-English
 * explanation when no readable copy exists.
 */
export async function fetchArticle(rawUrl: string, onStatus?: (message: string) => void): Promise<Article> {
  const url = normalizeUrl(rawUrl)

  onStatus?.('Fetching the article…')
  const viaFunction = await fetchViaFunction(url)
  if (viaFunction) return viaFunction

  onStatus?.('Reading the article…')
  return fetchViaReader(url)
}
