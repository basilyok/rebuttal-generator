// Direct-import unit tests for functions/api/generate.ts, covering two edge
// cases the HTTP-level suite (tests/generate.test.mjs) cannot reach without
// either a second, differently-configured dev server or a real,
// non-deterministic upstream call: the deployment-misconfigured 501, and the
// envelope-missing-after-one-retry 502.
//
// Both call onRequestPost() directly with a hand-built context, so neither
// needs wrangler pages dev or the limiter dev session running — just
// `node --test`, via the tsx loader the package.json test script already
// registers (generate.ts's own TypeScript, and its relative import of
// src/prompts, resolve exactly as they do at runtime under wrangler).
import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequestPost } from '../functions/api/generate.ts'
import { INSTANT } from '../functions/_lib/instant.js'

const ORIGIN = 'http://localhost'

function makeRequest(body, headers = {}) {
  return new Request(`${ORIGIN}/api/generate`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const call = (env, body) => onRequestPost({ request: makeRequest(body), env, waitUntil: () => {} })

const VALID = { argument: 'Cats are obviously better than dogs because they are quiet.' }

test('missing OPENROUTER_PROXY_KEY -> 501 (Instant mode unconfigured, BYOK unaffected)', async () => {
  const res = await call({}, VALID)
  assert.equal(res.status, 501)
  const data = await res.json()
  assert.equal(typeof data.error, 'string')
})

test('missing MESSAGE envelope after one retry -> 502, and the raw text is never returned', async () => {
  // INSTANT_TEST_ECHO_NO_ENVELOPE is a test-only companion to the echo seam
  // (see functions/api/generate.ts) that makes every callUpstream() return a
  // deterministic, envelope-free reply — so both the initial call and the
  // one retry miss the envelope, and the endpoint must refuse rather than
  // ever hand back that raw text.
  const env = {
    OPENROUTER_PROXY_KEY: 'test-key',
    INSTANT_TEST_ECHO: '1',
    INSTANT_TEST_ECHO_NO_ENVELOPE: '1',
  }
  const res = await call(env, VALID)
  assert.equal(res.status, 502)
  const data = await res.json()
  assert.equal(data.text, undefined)
  assert.equal(typeof data.error, 'string')
})

test('burst limiter is a distinct 429 from quota exhaustion: no resetAt/signedIn', async () => {
  // The per-IP burst brake (overRateLimit) only runs when INSTANT_TEST_ECHO is
  // unset, and is checked before OPENROUTER_PROXY_KEY, so neither needs to be
  // set here for the brake to trip. This locks in the response shape the
  // client (src/instant.ts) relies on to tell "wait a moment and retry" apart
  // from "free replies are done for today": only the latter carries resetAt.
  const env = {}
  let limited
  for (let i = 0; i < 10 && !limited; i++) {
    const res = await call(env, VALID)
    if (res.status === 429) limited = res
  }
  assert.ok(limited, 'expected the burst limiter to trip within 10 requests/minute')
  const data = await limited.json()
  assert.equal(data.resetAt, undefined)
  assert.equal(data.signedIn, undefined)
  assert.equal(typeof data.error, 'string')
})

test('limiter outage: LIMITER.fetch rejects -> fail open, reply still served on the FREE model', async () => {
  // A service-binding fetch that rejects is the same outage as a non-OK
  // answer, and consume() documents fail-open as its posture for both. The
  // model assertion locks in `first: false`: an outage must not read every
  // caller as brand new and route them all to the paid model.
  const env = {
    OPENROUTER_PROXY_KEY: 'test-key',
    INSTANT_TEST_ECHO: '1',
    LIMITER: {
      async fetch() {
        throw new Error('service binding down')
      },
    },
  }
  const res = await call(env, VALID)
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.ok(typeof data.text === 'string' && data.text.length > 0)
  assert.equal(data.model, INSTANT.freeModel)
})

test('limiter outage: OK answer with a malformed JSON body -> fail open, reply still served', async () => {
  const env = {
    OPENROUTER_PROXY_KEY: 'test-key',
    INSTANT_TEST_ECHO: '1',
    LIMITER: {
      async fetch() {
        return new Response('not json', { status: 200 })
      },
    },
  }
  const res = await call(env, VALID)
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.ok(typeof data.text === 'string' && data.text.length > 0)
})
