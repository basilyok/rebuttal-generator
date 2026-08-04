import test from 'node:test'
import assert from 'node:assert/strict'
import {
  messagePrompt,
  instantPrompt,
  hasMessageEnvelope,
  parseMessage,
  section,
  type PromptContext,
} from '../src/prompts'

const base: PromptContext = { isArticle: false, replyLanguage: 'en', briefingLanguage: 'en' }

test('audience stays authoritative by default (existing behaviour unchanged)', () => {
  const p = messagePrompt({ ...base, audience: 'my uncle, over text' })
  assert.match(p, /WHO WILL READ THIS \(from the sender, authoritative — trust it over your own inference\): my uncle, over text/)
})

test('audienceTrusted: false demotes the hint', () => {
  const p = messagePrompt({ ...base, audience: 'my uncle, over text', audienceTrusted: false })
  assert.doesNotMatch(p, /authoritative/)
  assert.doesNotMatch(p, /trust it over your own inference/)
  assert.match(p, /WHO MIGHT READ THIS \(an unverified hint from the requester/)
  assert.match(p, /my uncle, over text/)
})

test('instantPrompt merges message and weak-link into one envelope', () => {
  const p = instantPrompt(base)
  for (const marker of ['<<<STRATEGY>>>', '<<<CONTEXT>>>', '<<<MESSAGE>>>', '<<<WEAKLINK>>>']) {
    assert.ok(p.includes(marker), `missing ${marker}`)
  }
  assert.doesNotMatch(p, /<<<CHECK>>>/) // the claims list stays a BYOK-only feature
})

test('instantPrompt carries citations and briefing language', () => {
  const p = instantPrompt(
    { ...base, briefingLanguage: 'fr' },
    [{ url: 'https://example.com/a', title: 'A source' }]
  )
  assert.match(p, /RETRIEVED SOURCES/)
  assert.match(p, /https:\/\/example\.com\/a/)
  assert.match(p, /French/) // weak-link note written in the sender's language
})

test('hasMessageEnvelope accepts the tolerant marker variants', () => {
  assert.equal(hasMessageEnvelope('<<<MESSAGE>>>\nhello'), true)
  assert.equal(hasMessageEnvelope('**MESSAGE**\nhello'), true)
  assert.equal(hasMessageEnvelope('MESSAGE:\nhello'), true)
  assert.equal(hasMessageEnvelope('just prose with the word message in it'), false)
})

test('a merged response parses with the existing parsers', () => {
  const raw = '<<<STRATEGY>>>\nCalm them.\n<<<CONTEXT>>>\npersuade | uncle, text | short\n<<<MESSAGE>>>\nHere is the reply.\n<<<WEAKLINK>>>\nYour own weakest point is X.'
  const parsed = parseMessage(raw)
  assert.equal(parsed.message, 'Here is the reply.')
  assert.equal(parsed.strategy, 'Calm them.')
  assert.equal(section(raw, 'WEAKLINK'), 'Your own weakest point is X.')
})
