// Client for unlisted share links.
//
// Publishing sends only finished text to /api/share — never an API key, and
// never the provider credentials. A link is unguessable but PUBLIC to anyone
// holding it: unlisted, not private.

import type { Citation } from './providers'

/**
 * A published reply. Only the sendable message and its sources are ever shared —
 * the weak-link note and the briefing are private to the sender by design.
 *
 * `brief`/`detailed`/`steelman` are the pre-constitution shape, kept optional so links
 * created before the rewrite still render.
 */
export interface SharedRebuttal {
  argument: string
  message?: string
  strategy?: string
  brief?: string
  detailed?: string
  steelman?: string
  citations?: Citation[]
  steelmanCitations?: Citation[]
  modelLabel?: string
  providerLabel?: string
  articleUrl?: string
  articleTitle?: string
  /** The reply's content language (e.g. "en", "pt-BR") — feeds og:locale on the share page. */
  language?: string
  createdAt?: string
}

export class ShareError extends Error {}

const NOT_DEPLOYED =
  'Sharing needs the deployed site — it is unavailable when running locally.'

/**
 * A 404 or a non-JSON body means no function is served (e.g. `npm run dev`,
 * where the SPA fallback returns index.html). Treat that as "unavailable"
 * rather than parsing HTML as JSON.
 */
async function readJson(response: Response): Promise<any | null> {
  if (!(response.headers.get('content-type') || '').includes('application/json')) return null
  return response.json().catch(() => null)
}

export async function publishResult(payload: SharedRebuttal): Promise<string> {
  let response: Response
  try {
    response = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new ShareError('Could not reach the sharing service. Check your connection and try again.')
  }

  const data = await readJson(response)
  if (!data) throw new ShareError(NOT_DEPLOYED)
  if (!response.ok || !data.id) {
    throw new ShareError(data.error || 'Could not publish this rebuttal.')
  }
  return data.id as string
}

export async function loadSharedResult(id: string): Promise<SharedRebuttal> {
  let response: Response
  try {
    response = await fetch(`/api/share?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new ShareError('Could not load that shared rebuttal. Check your connection and try again.')
  }

  const data = await readJson(response)
  if (!data) throw new ShareError(NOT_DEPLOYED)
  if (!response.ok) throw new ShareError(data.error || 'That shared rebuttal could not be loaded.')
  return data as SharedRebuttal
}

/** New links are path-based so the share function can serve per-share OG meta. */
export const shareUrlFor = (id: string) => `${window.location.origin}/s/${id}`

const ID_PATTERN = /^[A-Za-z0-9]{6,32}$/

/** Share id in the current address, if any. */
export function sharedIdFromLocation(): string | null {
  // Path form first (the canonical shape) …
  const pathMatch = window.location.pathname.match(/^\/s\/([A-Za-z0-9]{6,32})\/?$/)
  if (pathMatch) return pathMatch[1]
  // … then the legacy query form — old links keep working indefinitely.
  const id = new URLSearchParams(window.location.search).get('s')
  return id && ID_PATTERN.test(id) ? id : null
}

/** Drop ?s= / /s/<id> without reloading, so "write your own" returns to a clean app. */
export function clearSharedIdFromLocation() {
  const url = new URL(window.location.href)
  url.searchParams.delete('s')
  if (/^\/s\//.test(url.pathname)) url.pathname = '/'
  window.history.replaceState({}, '', url.pathname + url.search)
}
