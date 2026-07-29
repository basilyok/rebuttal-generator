// Renders untrusted model output with bare URLs turned into links.
//
// Deliberately does NOT use dangerouslySetInnerHTML: the text comes from a model
// that was fed an arbitrary web article, so it must never be interpreted as
// markup. Splitting into React elements keeps escaping in React's hands.

import { Fragment } from 'react'

// Trailing punctuation is excluded so "see https://x.com/a." doesn't swallow the stop
const URL_PATTERN = /https?:\/\/[^\s<>()[\]{}"']+[^\s<>()[\]{}"'.,;:!?]/g

export function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0
    if (start > lastIndex) parts.push(text.slice(lastIndex, start))
    parts.push(
      <a key={`${start}-${match[0]}`} href={match[0]} target="_blank" rel="noopener noreferrer nofollow">
        {match[0]}
      </a>
    )
    lastIndex = start + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))

  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  )
}

/** Publisher domain, for labelling a citation whose title is missing. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
