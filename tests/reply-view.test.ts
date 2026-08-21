// The "Shorter version" toggle's one decision: which message is on screen.
//
// The harm being guarded against is a user pasting a message they did not read.
// Copy sends whatever is displayed, so "displayed" and "copied" must be one
// answer rather than two expressions that happen to agree today — and the
// stripped-URL set has to travel with the text it describes, because a claim
// badge reporting on the version that is NOT on screen is the same bug wearing
// a quieter hat.
//
// Four states, asserted through the function App actually calls. The middle two
// are the ones a render-time ternary gets wrong: the toggle is ON while the
// shortening call is still in flight, and stays intended-on for a moment after
// one fails, and in both windows there is nothing short to show.
import test from 'node:test'
import assert from 'node:assert/strict'
import { shownVersion, type VersionedReply } from '../src/replyView'

const FULL = 'You said the scheme costs more than it saves. Road deaths fell 41% after 2019.'
const SHORT = 'Road deaths fell 41% in the two years after the 2019 change.\nhttps://example.org/review-2021'

const reply = (over: Partial<VersionedReply> = {}): VersionedReply => ({
  message: FULL,
  strippedUrls: [],
  ...over,
})

test('toggle off shows the full message, even when a short one is cached', () => {
  const shown = shownVersion(reply({ shorter: SHORT }), false)
  assert.equal(shown.text, FULL)
  assert.equal(shown.isShorter, false)
})

test('toggle on with nothing cached yet still shows the full message', () => {
  // The in-flight window, and the after-a-failure window. Intent is not content:
  // showing an empty send zone here would be worse than showing the long version.
  const shown = shownVersion(reply(), true)
  assert.equal(shown.text, FULL)
  assert.equal(shown.isShorter, false)
})

test('toggle on with a cached short version shows the short one', () => {
  const shown = shownVersion(reply({ shorter: SHORT }), true)
  assert.equal(shown.text, SHORT)
  assert.equal(shown.isShorter, true)
})

test('no reply at all yields empty text rather than throwing', () => {
  assert.deepEqual(shownVersion(null, true), { text: '', strippedUrls: [], isShorter: false })
})

// --- the stripped-URL set travels with its own text -------------------------

const both = reply({
  strippedUrls: ['https://invented-in-the-long-one.example'],
  shorter: SHORT,
  shorterStrippedUrls: ['https://invented-while-shortening.example', 'https://and-another.example'],
})

test('the full message reports the URLs stripped from the full message', () => {
  const shown = shownVersion(both, false)
  assert.equal(shown.text, FULL)
  assert.deepEqual(shown.strippedUrls, ['https://invented-in-the-long-one.example'])
})

test('the short version reports the URLs stripped while shortening, not the other set', () => {
  const shown = shownVersion(both, true)
  assert.equal(shown.text, SHORT)
  assert.deepEqual(shown.strippedUrls, [
    'https://invented-while-shortening.example',
    'https://and-another.example',
  ])
  // The badge would say "1 unverified link removed" for a message that had two
  assert.ok(!shown.strippedUrls.includes('https://invented-in-the-long-one.example'))
})

test('a short version that stripped nothing reports nothing, not the long message’s count', () => {
  // The field is only written when the call strips something, so an absent one
  // must read as "nothing stripped" rather than falling through to the full set.
  const shown = shownVersion(reply({ strippedUrls: ['https://invented.example'], shorter: SHORT }), true)
  assert.equal(shown.isShorter, true)
  assert.deepEqual(shown.strippedUrls, [])
})

test('every state pairs the text with its own stripped set — no crossed wires', () => {
  // The truth table in one place: for each toggle state and cache state, assert
  // the pair rather than the halves, since the failure is a mismatched pair.
  const cases: Array<[boolean, VersionedReply, string, string[]]> = [
    [false, both, FULL, both.strippedUrls],
    [true, both, SHORT, both.shorterStrippedUrls!],
    [false, reply({ strippedUrls: ['https://x.example'] }), FULL, ['https://x.example']],
    [true, reply({ strippedUrls: ['https://x.example'] }), FULL, ['https://x.example']],
  ]
  for (const [showShorter, input, text, strippedUrls] of cases) {
    const shown = shownVersion(input, showShorter)
    assert.deepEqual({ text: shown.text, strippedUrls: shown.strippedUrls }, { text, strippedUrls })
  }
})
