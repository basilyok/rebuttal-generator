// Direct-import unit tests for src/instant.ts's generateInstant(), covering the
// 429 ambiguity fixed in this change: the server answers 429 for two unrelated
// things (functions/api/generate.ts) — a per-IP burst brake (no resetAt) and
// daily-quota exhaustion (always carries resetAt). The client must not treat
// the former as the latter. Mocks global.fetch, so this needs neither wrangler
// pages dev nor the limiter dev session.
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateInstant, InstantQuotaError } from '../src/instant.ts'

function mockFetch(status, body) {
  globalThis.fetch = async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })
}

test('429 with resetAt (quota exhaustion) throws InstantQuotaError', async () => {
  mockFetch(429, { error: 'Free replies are done for today.', resetAt: '2026-08-03T00:00:00.000Z', signedIn: false })
  await assert.rejects(
    () => generateInstant({ argument: 'x' }),
    (err) => err instanceof InstantQuotaError && err.resetAt === '2026-08-03T00:00:00.000Z' && err.signedIn === false
  )
})

test('429 without resetAt (burst brake) does NOT throw InstantQuotaError', async () => {
  mockFetch(429, { error: 'Too many requests — wait a minute and try again.' })
  await assert.rejects(
    () => generateInstant({ argument: 'x' }),
    (err) => !(err instanceof InstantQuotaError) && err.message === 'Too many requests — wait a minute and try again.'
  )
})
