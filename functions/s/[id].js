// The share page: the app shell with THIS share's Open Graph meta injected.
// Two rules carried over from hard-won incidents and the spec:
//   1. IDENTICAL bytes for every requester. Serving crawlers different HTML
//      than humans is the same URL-keyed cache-poisoning class this app dug
//      out of before; per-share URLs already make per-share content
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
    // Locale of the CONTENT, present only on shares published after the language
    // field ships (Step 3b below) — older records simply omit it.
    ...(typeof record.language === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(record.language)
      ? [`<meta property="og:locale" content="${escapeHtml(record.language.replace('-', '_'))}" />`]
      : []),
  ].join('\n    ')

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
