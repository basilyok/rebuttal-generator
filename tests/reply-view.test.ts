// The "Shorter version" toggle's two pure decisions: which version is on screen,
// and which reply a shortening result is allowed to land on.
//
// The harm is a user pasting a message they did not read. Copy sends whatever is
// displayed, so "displayed" and "copied" must be one answer rather than two
// expressions that happen to agree today — and the citation set and the
// stripped-URL set have to travel with the text they describe, because a badge
// reading "3 sources cited" over a message containing one is the same bug in a
// quieter register.
//
// Two of the states below are what a render-time ternary gets wrong: the toggle
// is ON while the shortening call is in flight, and there is nothing short to
// show in that window.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { shownVersion, applyShorterResult, applyBriefingResult, type VersionedReply } from '../src/replyView'
import type { Citation } from '../src/providers'

const FULL = 'You said the scheme costs more than it saves. Road deaths fell 41% after 2019.'
const SHORT = 'On the cost point, road deaths fell 41% in the two years after the 2019 change.'

const source = (n: number): Citation => ({ url: `https://example.org/source-${n}`, title: `Source ${n}` })
const LONG_SOURCES = [source(1), source(2), source(3)]
const SHORT_SOURCES = [source(2)]

const reply = (over: Partial<VersionedReply> = {}): VersionedReply => ({
  id: 1,
  message: FULL,
  citations: LONG_SOURCES,
  strippedUrls: [],
  ...over,
})

test('toggle off shows the full message, even when a short one is cached', () => {
  const shown = shownVersion(reply({ shorter: SHORT }), { showShorter: false })
  assert.equal(shown.text, FULL)
  assert.equal(shown.isShorter, false)
  // ...but the card still needs to know one EXISTS, which is a different question
  // and the reason it never has to reach past `shown` to ask it.
  assert.equal(shown.hasShorter, true)
})

test('toggle on with nothing cached yet still shows the full message', () => {
  // The in-flight window. Intent is not content: showing an empty send zone here
  // would be worse than showing the long version.
  const shown = shownVersion(reply(), { showShorter: true })
  assert.equal(shown.text, FULL)
  assert.equal(shown.isShorter, false)
  assert.equal(shown.hasShorter, false)
})

test('toggle on with a cached short version shows the short one', () => {
  const shown = shownVersion(reply({ shorter: SHORT }), { showShorter: true })
  assert.equal(shown.text, SHORT)
  assert.equal(shown.isShorter, true)
})

test('no reply at all yields empty text rather than throwing', () => {
  assert.deepEqual(shownVersion(null, { showShorter: true }), {
    text: '',
    citations: [],
    strippedUrls: [],
    isShorter: false,
    hasShorter: false,
  })
})

// --- the evidence sets travel with their own text ---------------------------
//
// Both of these leaked in review: shownVersion routed the text correctly while
// the badge count and the source panel read the reply's own fields, so a short
// version citing one link sat under "3 sources cited" over a panel listing two
// links that were nowhere on screen.

const both = reply({
  strippedUrls: ['https://invented-in-the-long-one.example'],
  shorter: SHORT,
  shorterCitations: SHORT_SOURCES,
  shorterStrippedUrls: ['https://invented-while-shortening.example', 'https://and-another.example'],
})

test('the full message reports its own sources and its own stripped URLs', () => {
  const shown = shownVersion(both, { showShorter: false })
  assert.equal(shown.text, FULL)
  assert.deepEqual([...shown.citations], LONG_SOURCES)
  assert.deepEqual([...shown.strippedUrls], ['https://invented-in-the-long-one.example'])
})

test('the short version reports the sources IT cites, not the long ones', () => {
  const shown = shownVersion(both, { showShorter: true })
  assert.equal(shown.text, SHORT)
  // Shortening legitimately drops links along with the claims they supported, so
  // this is a subset by design — and the badge must count the survivors.
  assert.deepEqual([...shown.citations], SHORT_SOURCES)
  assert.equal(shown.citations.length, 1)
  assert.ok(!shown.citations.some((c) => c.url === 'https://example.org/source-1'))
})

test('the short version reports the URLs stripped while shortening, not the other set', () => {
  const shown = shownVersion(both, { showShorter: true })
  assert.deepEqual(
    [...shown.strippedUrls],
    ['https://invented-while-shortening.example', 'https://and-another.example']
  )
  assert.ok(!shown.strippedUrls.includes('https://invented-in-the-long-one.example'))
})

test('an absent short-version set reads as none, never as the long ones', () => {
  // These fields are only written when there is something to write, so a missing
  // one must mean "none" — falling back to the reply's own is the crossed wire.
  const shown = shownVersion(reply({ strippedUrls: ['https://invented.example'], shorter: SHORT }), {
    showShorter: true,
  })
  assert.equal(shown.isShorter, true)
  assert.deepEqual([...shown.strippedUrls], [])
  assert.deepEqual([...shown.citations], [])
})

test('every state pairs the text with its own evidence — no crossed wires', () => {
  // The truth table in one place, asserted as triples rather than as halves,
  // because the failure mode is a mismatched pair and not a wrong field.
  const bare = reply({ strippedUrls: ['https://x.example'] })
  const cases: Array<[boolean, VersionedReply, string, Citation[], string[]]> = [
    [false, both, FULL, LONG_SOURCES, both.strippedUrls],
    [true, both, SHORT, SHORT_SOURCES, both.shorterStrippedUrls!],
    [false, bare, FULL, LONG_SOURCES, ['https://x.example']],
    [true, bare, FULL, LONG_SOURCES, ['https://x.example']],
  ]
  for (const [showShorter, input, text, citations, strippedUrls] of cases) {
    const shown = shownVersion(input, { showShorter })
    assert.deepEqual(
      { text: shown.text, citations: [...shown.citations], strippedUrls: [...shown.strippedUrls] },
      { text, citations, strippedUrls }
    )
  }
})

// --- a shortening call that comes back to a different reply ------------------
//
// The user clicks "Shorter version", then presses Generate before it returns.
// Reply B is on screen when reply A's call resolves. If that result is written
// anyway, nothing is visible at first — starting a generation clears the toggle —
// but the cache is poisoned, so the NEXT click renders A's condensed message
// under B with no call and no error, beneath a note promising Copy will send it.

const SHORT_A = 'On the road scheme, deaths fell 41% in the two years after 2019.'
const result = { text: SHORT_A, citations: SHORT_SOURCES, strippedUrls: [] }
const replyA = reply({ id: 7, message: 'A: the road scheme.' })
const replyB = reply({ id: 8, message: 'B: an unrelated argument about school funding.' })

test('a shortening result lands on the reply it was generated for', () => {
  const next = applyShorterResult(replyA, 7, result)
  assert.equal(next?.shorter, SHORT_A)
  const shown = shownVersion(next, { showShorter: true })
  assert.equal(shown.text, SHORT_A)
  assert.deepEqual([...shown.citations], SHORT_SOURCES)
})

test('a shortening result for an older reply is DROPPED, not written onto the new one', () => {
  const next = applyShorterResult(replyB, 7, result)
  assert.equal(next, replyB, 'the current reply was replaced by a stale result')
  assert.equal(next?.shorter, undefined, 'reply B now caches the condensed text of reply A')
  // The user-visible consequence: clicking the toggle on B must still show B.
  assert.equal(shownVersion(next, { showShorter: true }).text, replyB.message)
})

test('two replies that read identically are still told apart', () => {
  // Regenerating the same argument can produce the same text, which is why the
  // guard is an id and not message equality.
  const twin = reply({ id: 9, message: replyA.message })
  assert.equal(applyShorterResult(twin, 7, result), twin)
})

test('a result arriving after the reply is cleared writes nothing', () => {
  assert.equal(applyShorterResult(null, 7, result), null)
})

// --- the render must not re-derive any of this ------------------------------
//
// Both leaks above were a JSX expression reading the reply directly while the
// body read `shown`. Nothing in the types stops that from coming back, so scan
// for it — the same call-site-scanning method tests/i18n-account.test.mjs uses.

test('the reply card reads shown, never the reply own version-specific fields', () => {
  const appSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'App.tsx'),
    'utf8'
  )
  // JSX positions only: `{reply.citations…` or `citations={reply.citations}`. A
  // plain argument (`stripUnverifiedUrls(text, reply.citations)`) is the call that
  // legitimately establishes the set, not a render-time re-derivation of it.
  const leaks = [...appSource.matchAll(/[={]\s*(reply\.(?:citations|strippedUrls|shorter\w*))/g)].map(
    (m) => m[1]
  )
  assert.deepEqual(leaks, [], `the reply card re-derives ${leaks.join(', ')} instead of reading shown`)

  // And the scan is not vacuous: `shown` is what the card reads instead.
  assert.match(appSource, /const shown = shownVersion\(reply, \{ showShorter \}\)/)
  assert.ok(appSource.includes('shown.text'), 'expected the card to render shown.text')
  assert.ok(appSource.includes('shown.citations'), 'expected the card to read shown.citations')
  assert.ok(appSource.includes('shown.strippedUrls'), 'expected the badge to read shown.strippedUrls')
})

// --- and the same race in the briefing --------------------------------------
//
// Lower blast radius, not lower correctness. The briefing is never sendable, so a
// misrouted one cannot be pasted to anyone — but it is the panel that tells the
// user which of their opponent's points went unanswered, and one describing a
// different argument sends them back to fix a hole their message does not have.

const briefing = { theirCase: 'The strongest case for the road scheme costing more.', answered: ['cost — answered'] }

test('a briefing result lands on the reply it was generated for', () => {
  const next = applyBriefingResult(replyA, 7, briefing)
  assert.equal(next?.theirCase, briefing.theirCase)
  assert.deepEqual(next?.answered, briefing.answered)
})

test('a briefing result for an older reply is DROPPED, not written onto the new one', () => {
  const next = applyBriefingResult(replyB, 7, briefing)
  assert.equal(next, replyB, 'the current reply was replaced by a stale briefing')
  assert.equal(next?.theirCase, undefined, 'reply B now carries a briefing about reply A')
})

test('two replies that read identically are still told apart by the briefing guard', () => {
  const twin = reply({ id: 9, message: replyA.message })
  assert.equal(applyBriefingResult(twin, 7, briefing), twin)
})

test('a briefing arriving after the reply is cleared writes nothing', () => {
  assert.equal(applyBriefingResult(null, 7, briefing), null)
})
