// Web search via Tavily, so every provider can cite real sources.
//
// Tavily is CORS-open (verified from this app's own origin) and supports a keyless mode:
// send `X-Tavily-Access-Mode: keyless` and it answers with no account and no API key. A
// free key (1,000 credits/month, no card) only raises the rate limit.
//
// This exists because the model's own knowledge cannot be checked. Search results are
// injected as a fixed, numbered set and the model is told to cite only from it; anything
// it invents anyway is stripped afterwards by stripUnverifiedUrls. That turns "please
// don't fabricate URLs" from a request into a structural guarantee.

import type { Citation } from './providers'

const ENDPOINT = 'https://api.tavily.com/search'
const TIMEOUT_MS = 25_000
const MAX_QUERY_CHARS = 380

export const TAVILY_KEY_STORAGE = 'api_key_tavily'

/**
 * Social posts and forum threads are not citable evidence. A reply that leans on a
 * LinkedIn post persuades nobody it needs to persuade, so keep them out of the set
 * the model is allowed to draw on.
 */
const EXCLUDED_DOMAINS = [
  'reddit.com',
  'linkedin.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'quora.com',
  'pinterest.com',
  'tiktok.com',
  'instagram.com',
  'medium.com',
]

export const loadTavilyKey = () => (localStorage.getItem(TAVILY_KEY_STORAGE) || '').trim()

export class SearchError extends Error {}

/**
 * Build a search query from the argument. Tavily takes natural language, so the argument's
 * own opening (or the article title) is a better query than any keyword extraction — and
 * it costs no extra model call.
 */
export function queryFor(argument: string, articleTitle?: string): string {
  if (articleTitle?.trim()) return articleTitle.trim().slice(0, MAX_QUERY_CHARS)
  const collapsed = argument.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= MAX_QUERY_CHARS) return collapsed
  // Prefer a clean sentence boundary near the cap
  const window = collapsed.slice(0, MAX_QUERY_CHARS)
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '))
  return lastStop > 120 ? window.slice(0, lastStop + 1) : window
}

export interface SearchOutcome {
  citations: Citation[]
  /** Set when search was attempted but produced nothing usable */
  note?: string
}

export async function searchForEvidence(
  query: string,
  options: { apiKey?: string; maxResults?: number; signal?: AbortSignal } = {}
): Promise<SearchOutcome> {
  const { apiKey = '', maxResults = 6 } = options

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  // Keyless works with no account; a key simply takes precedence when present
  else headers['X-Tavily-Access-Mode'] = 'keyless'

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: 'basic',
        topic: 'general',
        exclude_domains: EXCLUDED_DOMAINS,
      }),
      signal: options.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new SearchError('The evidence search timed out.')
    }
    throw new SearchError('Could not reach the evidence search service.')
  }

  if (response.status === 429) {
    throw new SearchError(
      apiKey
        ? 'Tavily rate limit reached. Wait a moment and try again.'
        : 'The keyless evidence search is rate-limited right now. Add a free Tavily key in settings, or try again shortly.'
    )
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new SearchError(data?.detail?.error || data?.error || `Evidence search failed (HTTP ${response.status}).`)
  }

  const citations: Citation[] = (data?.results ?? [])
    .filter((r: any) => typeof r?.url === 'string' && /^https?:\/\//i.test(r.url))
    .map((r: any) => ({
      url: r.url,
      title: typeof r.title === 'string' ? r.title : '',
      snippet: typeof r.content === 'string' ? r.content.replace(/\s+/g, ' ').slice(0, 400) : undefined,
    }))

  return citations.length ? { citations } : { citations: [], note: 'The search returned no usable sources.' }
}

const URL_IN_TEXT = /https?:\/\/[^\s<>()[\]{}"']+[^\s<>()[\]{}"'.,;:!?]/g

/** Compare by origin+path so tracking params or a trailing slash don't cause a false strip. */
function urlKey(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

export interface VerificationResult {
  text: string
  /** Citations the model actually used, in the order they appear */
  used: Citation[]
  /** URLs the model produced that were not in the retrieved set */
  strippedUrls: string[]
}

/**
 * Enforce the citation set. Any URL the model emitted that was not retrieved is removed
 * from the text and reported, so a fabricated link can never reach the reader.
 */
export function stripUnverifiedUrls(text: string, allowed: Citation[]): VerificationResult {
  if (!text) return { text, used: [], strippedUrls: [] }

  const allowedByKey = new Map(allowed.map((c) => [urlKey(c.url), c]))
  const strippedUrls: string[] = []
  const usedKeys = new Set<string>()

  const cleaned = text.replace(URL_IN_TEXT, (match) => {
    const key = urlKey(match)
    if (allowedByKey.has(key)) {
      usedKeys.add(key)
      return match
    }
    strippedUrls.push(match)
    // Drop the link but keep the sentence readable
    return ''
  })

  const used = [...usedKeys].map((key) => allowedByKey.get(key)!).filter(Boolean)
  return {
    // Tidy up the punctuation left behind by a removed link
    text: cleaned.replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1'),
    used,
    strippedUrls,
  }
}
