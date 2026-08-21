// The recovery UI's two pure decisions.
//
// These were a nested ternary and a five-term `&&` chain inside App.tsx's
// render. Neither could be asked what it would do for a given state, and one of
// them was wrong for the state the component STARTS in: the prompt asserting
// "you have no recovery code yet" was gated on a status initialised to `none`,
// which is a positive claim the server had not yet made. Every reload showed it
// to users who did have a code, and clicking it rotated the code they had
// written down.
//
// So the first test below is not a formality. It feeds the real initial value
// to the real gate and asserts nothing is offered. Against the old initialiser
// it fails.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INITIAL_RECOVERY_STATUS,
  recoveryLabelKey,
  resetFailure,
  shouldOfferSetupPrompt,
} from '../src/recoveryUi'
import type { RecoveryStatus } from '../src/recovery'

const ALL_STATUSES: RecoveryStatus[] = ['none', 'unknown', 'incomplete', 'ready', 'stale']

const inputs = (over: Partial<Parameters<typeof shouldOfferSetupPrompt>[0]> = {}) => ({
  provider: 'local',
  status: 'ready' as RecoveryStatus,
  dismissed: false,
  codeShown: false,
  acknowledged: true,
  ...over,
})

test('the state the component starts in offers no prompt at all', () => {
  // Everything else set to the freshest-possible first render: nothing
  // dismissed, no code shown, and no acknowledgement on this device.
  const kind = shouldOfferSetupPrompt(inputs({ status: INITIAL_RECOVERY_STATUS, acknowledged: false }))
  assert.equal(
    kind,
    null,
    'the initial status must claim nothing about this account — before fetchDek() answers we have made no observation',
  )
})

test('unknown offers nothing, whatever else is true', () => {
  for (const acknowledged of [true, false]) {
    for (const dismissed of [true, false]) {
      assert.equal(shouldOfferSetupPrompt(inputs({ status: 'unknown', acknowledged, dismissed })), null)
    }
  }
})

test('a confirmed absence offers first-time setup', () => {
  assert.equal(shouldOfferSetupPrompt(inputs({ status: 'none', acknowledged: false })), 'setup')
  // Acknowledgement is about a code having been SEEN; it cannot conjure a
  // record the server says does not exist.
  assert.equal(shouldOfferSetupPrompt(inputs({ status: 'none', acknowledged: true })), 'setup')
})

test('a record nobody on this device ever saw offers a REPLACEMENT, not setup', () => {
  // The one-time display can be lost to a reload, a back gesture or a crash.
  // The account still reports ready, so nothing else would ever ask again.
  assert.equal(shouldOfferSetupPrompt(inputs({ status: 'ready', acknowledged: false })), 'replace')
  assert.equal(shouldOfferSetupPrompt(inputs({ status: 'incomplete', acknowledged: false })), 'replace')
  // "replace" and "setup" must never be interchangeable: one of them says
  // "you have nothing", the other invalidates something that may exist.
  assert.notEqual(
    shouldOfferSetupPrompt(inputs({ status: 'ready', acknowledged: false })),
    shouldOfferSetupPrompt(inputs({ status: 'none', acknowledged: false })),
  )
})

test('an acknowledged account is left alone', () => {
  assert.equal(shouldOfferSetupPrompt(inputs({ status: 'ready', acknowledged: true })), null)
  assert.equal(shouldOfferSetupPrompt(inputs({ status: 'incomplete', acknowledged: true })), null)
})

test('stale prompts THROUGH an acknowledgement — the one status that does', () => {
  // `stale` is set only when this session's password had to open the PREVIOUS
  // generation of the DEK, which is proof that a reset stopped between
  // complete's writes 1 and 3 and moved the verifier out from under whatever
  // the user saved. The acknowledgement is exactly what would otherwise keep
  // them from ever being told, so it must not silence this one.
  assert.equal(shouldOfferSetupPrompt(inputs({ status: 'stale', acknowledged: true })), 'replace')
  assert.equal(shouldOfferSetupPrompt(inputs({ status: 'stale', acknowledged: false })), 'replace')
  // A replacement, never first-time setup: there may well be a live code out
  // there, and "you have no recovery code" would be false.
  assert.notEqual(
    shouldOfferSetupPrompt(inputs({ status: 'stale', acknowledged: true })),
    shouldOfferSetupPrompt(inputs({ status: 'none', acknowledged: true })),
  )
  // Still silenced by the two things that silence everything.
  assert.equal(shouldOfferSetupPrompt(inputs({ status: 'stale', dismissed: true })), null)
  assert.equal(shouldOfferSetupPrompt(inputs({ status: 'stale', codeShown: true })), null)
  assert.equal(shouldOfferSetupPrompt(inputs({ provider: 'google', status: 'stale' })), null)
})

test('a failure that may have partly landed never blames the recovery code', () => {
  // The three verdicts that must stay apart. Collapsing any pair of them tells
  // somebody something false about what just happened to their account.
  const interrupted = resetFailure('reset-interrupted')
  assert.equal(interrupted.retryCode, false, 'the code is spent from write 2 onward — a retry cannot succeed')
  assert.notEqual(interrupted.key, resetFailure('bad-credentials').key)
  assert.notEqual(interrupted.key, resetFailure('server-error').key, 'may-have-landed is not the same as did-not-run')
  // begin writes nothing, so its faults really do mean "nothing happened".
  assert.equal(resetFailure('server-error').retryCode, false)
})

test('dismissal and a visible code both silence every prompt', () => {
  for (const status of ALL_STATUSES) {
    assert.equal(shouldOfferSetupPrompt(inputs({ status, acknowledged: false, dismissed: true })), null)
    assert.equal(shouldOfferSetupPrompt(inputs({ status, acknowledged: false, codeShown: true })), null)
  }
})

test('non-password accounts are never prompted: there is no password key to wrap a DEK under', () => {
  for (const provider of ['google', undefined]) {
    for (const status of ALL_STATUSES) {
      assert.equal(shouldOfferSetupPrompt(inputs({ provider, status, acknowledged: false })), null)
    }
  }
})

test('every status has its own label — none of them share one', () => {
  const keys = ALL_STATUSES.map(recoveryLabelKey)
  assert.equal(new Set(keys).size, ALL_STATUSES.length, `labels collide: ${keys.join(', ')}`)
  for (const key of keys) assert.match(key, /^recovery\.status/)
  // The specific mapping that matters: "we could not check" must not borrow the
  // label that offers first-time setup.
  assert.notEqual(recoveryLabelKey('unknown'), recoveryLabelKey('none'))
})
