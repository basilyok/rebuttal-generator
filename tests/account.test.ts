import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveCredentials,
  normalizeUsername,
  register,
  loginLocal,
  AccountError,
  UsernameTakenError,
  BadCredentialsError,
  RateLimitedError,
  EmailInvalidError,
  UsernameInvalidError,
  AuthServerError,
} from '../src/account'
import { adoptKey, unlockWithKey, sealJson, BLOB_VERSION_MASTER } from '../src/vault'

// Node ships WebCrypto on globalThis.crypto (Node 20+), so the exact browser
// derivation runs here unmodified. Each deriveCredentials call really performs
// the 600k PBKDF2 rounds — a few hundred ms each is the price of testing the
// real construction instead of a knob-turned imitation.

// A known-answer test. These two literals are a permanent contract with every
// stored authHash and every sealed vault blob — CLIENT_ITERATIONS and
// SALT_PREFIX can never change without locking out every existing account,
// and there is no password reset to recover with. If this test fails, the
// derivation changed and the change is a migration, not a fix.
test('derivation is pinned — changing these constants locks out every existing account', async () => {
  const { authHash, masterKeyBytes } = await deriveCredentials('pinned-user', 'pinned-password-vector')
  assert.equal(authHash, 'Vzc2xYS9mOP8CrGoVhLkRIZIp+8sqjA3RauKS+SxxjE=')
  assert.equal(Buffer.from(masterKeyBytes).toString('base64'), 'YmZlwyDwdBNLhIHpu5NiunID6UmJZE4EG/CwUHvLMhE=')
})

test('derivation is deterministic and sensitive to both inputs', async () => {
  const a = await deriveCredentials('basil', 'correct horse battery')
  const b = await deriveCredentials('basil', 'correct horse battery')
  assert.equal(a.authHash, b.authHash)
  assert.deepEqual(a.masterKeyBytes, b.masterKeyBytes)

  const otherPassword = await deriveCredentials('basil', 'correct horse battery!')
  assert.notEqual(otherPassword.authHash, a.authHash)

  const otherUser = await deriveCredentials('sage', 'correct horse battery')
  assert.notEqual(otherUser.authHash, a.authHash)
  assert.notDeepEqual(otherUser.masterKeyBytes, a.masterKeyBytes)
})

test('username case and whitespace do not change the key', async () => {
  const lower = await deriveCredentials('basil', 'correct horse battery')
  const shouty = await deriveCredentials('  BASIL ', 'correct horse battery')
  assert.equal(shouty.authHash, lower.authHash)
  assert.deepEqual(shouty.masterKeyBytes, lower.masterKeyBytes)
})

test('authHash is not the master key', async () => {
  const { masterKeyBytes, authHash } = await deriveCredentials('basil', 'correct horse battery')
  assert.notEqual(authHash, Buffer.from(masterKeyBytes).toString('base64'))
})

test('vault sealed under the master key opens after a fresh login, not with the wrong password', async () => {
  const first = await deriveCredentials('basil', 'correct horse battery')
  const key = await adoptKey(first.masterKeyBytes)
  const blob = await sealJson(key, { openrouter: 'sk-or-test' }, BLOB_VERSION_MASTER)

  // Same username+password on a "new device" derives the same key
  const again = await deriveCredentials('basil', 'correct horse battery')
  const rederived = await adoptKey(again.masterKeyBytes)
  assert.deepEqual(await unlockWithKey(blob, rederived), { openrouter: 'sk-or-test' })

  const wrong = await deriveCredentials('basil', 'wrong password entirely')
  const wrongKey = await adoptKey(wrong.masterKeyBytes)
  await assert.rejects(() => unlockWithKey(blob, wrongKey))
})

test('normalizeUsername lowercases and trims', () => {
  assert.equal(normalizeUsername('  Basil '), 'basil')
  assert.equal(normalizeUsername('a_b-C'), 'a_b-c')
})

test('adoptKey imports a non-extractable key', async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const key = await adoptKey(bytes)
  assert.equal(key.extractable, false)
  await assert.rejects(() => crypto.subtle.exportKey('raw', key))
})

// --- wire safety: the app's central invariant is that no secret reaches the
// server. These tests stub fetch and inspect exactly what would go out.

const fakeUser = { id: 'u1', provider: 'local', email: '', name: '', picture: '', language: '' }

function jsonResponse(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
}

test('register sends only username/authHash/email — never the password or masterKey', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(init!.body as string)
    return new Response(JSON.stringify({ user: fakeUser }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  const { masterKeyBytes } = await register('  Basil ', 'correct horse battery', ' a@b.co ')

  assert.ok(capturedBody)
  assert.deepEqual(Object.keys(capturedBody!).sort(), ['authHash', 'email', 'username'])
  assert.equal(capturedBody!.username, 'Basil') // trimmed only — register keeps display case
  assert.equal(capturedBody!.email, 'a@b.co')

  const wireText = JSON.stringify(capturedBody)
  assert.equal(wireText.includes('correct horse battery'), false)
  assert.equal(wireText.includes(Buffer.from(masterKeyBytes).toString('base64')), false)
})

test('register omits the email key entirely when email is blank — the sign-in-mode path', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(init!.body as string)
    return new Response(JSON.stringify({ user: fakeUser }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  await register('basil', 'correct horse battery', '')

  assert.ok(capturedBody)
  // Not an empty-string email — the key must be absent altogether, since
  // sign-in mode (no email field at all) reaches this same production path.
  assert.deepEqual(Object.keys(capturedBody!).sort(), ['authHash', 'username'])
})

test('loginLocal sends only username/authHash — never the password or masterKey', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(init!.body as string)
    return new Response(JSON.stringify({ user: fakeUser }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  const { masterKeyBytes } = await loginLocal('  Basil ', 'correct horse battery')

  assert.ok(capturedBody)
  assert.deepEqual(Object.keys(capturedBody!).sort(), ['authHash', 'username'])
  assert.equal(capturedBody!.username, 'basil') // normalizeUsername — login has no display purpose

  const wireText = JSON.stringify(capturedBody)
  assert.equal(wireText.includes('correct horse battery'), false)
  assert.equal(wireText.includes(Buffer.from(masterKeyBytes).toString('base64')), false)
})

test('postAuth maps a 409 {code: username-taken} response to UsernameTakenError', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = jsonResponse(409, { code: 'username-taken' })
  await assert.rejects(() => register('newuser', 'irrelevant password!', ''), UsernameTakenError)
})

test('postAuth maps a 401 {code: bad-credentials} response to BadCredentialsError', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = jsonResponse(401, { code: 'bad-credentials' })
  await assert.rejects(() => loginLocal('someone', 'wrong password entirely'), BadCredentialsError)
})

test('postAuth maps a 429 with no parseable body to RateLimitedError', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  // An edge proxy or CDN rejecting the request before it reaches the API may
  // return plain text, not JSON — response.json() must fail closed here.
  globalThis.fetch = (async () => new Response('Too Many Requests', { status: 429 })) as typeof fetch
  await assert.rejects(() => loginLocal('someone', 'a password here'), RateLimitedError)
})

test('postAuth maps a 500 with no code to a generic AccountError', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = jsonResponse(500, {})
  await assert.rejects(() => loginLocal('someone', 'a password here'), (err: unknown) => {
    assert.equal(err instanceof AccountError, true)
    assert.equal((err as Error).constructor, AccountError) // not one of the typed subclasses
    return true
  })
})

// --- error codes are the whole contract -------------------------------------
//
// The endpoints answer with BOTH a machine `code` and a hardcoded English
// `error` sentence. This app renders twelve locales, so the sentence can never
// be shown — an unmapped code that fell through to `data.error` would put
// untranslatable English in front of a user reading Greek. Each case below
// asserts the code produced its own type AND that the error's message is the
// code rather than the sentence that arrived alongside it.
const SERVER_CODES: Array<{ status: number; code: string; error: string; type: Function }> = [
  // Genuinely reachable from the dialog: it validates the username but not the
  // email, so a typo'd address is answered by the server, not caught locally.
  {
    status: 400,
    code: 'email-invalid',
    error: 'That email address does not look right.',
    type: EmailInvalidError,
  },
  // Should be unreachable — the dialog tests USERNAME_PATTERN before submitting
  // — but "unreachable" describes today's callers, not the wire contract.
  {
    status: 400,
    code: 'username-invalid',
    error: 'Usernames are 3–32 characters: letters, numbers, - or _.',
    type: UsernameInvalidError,
  },
  // Reachable in production on any KV or crypto failure inside register/login.
  {
    status: 500,
    code: 'server-error',
    error: 'Something went wrong creating your account — try again.',
    type: AuthServerError,
  },
]

for (const { status, code, error, type } of SERVER_CODES) {
  test(`postAuth maps ${status} {code: ${code}} to ${type.name} carrying the code, not the server's sentence`, async (t) => {
    const originalFetch = globalThis.fetch
    t.after(() => {
      globalThis.fetch = originalFetch
    })
    globalThis.fetch = jsonResponse(status, { error, code })
    await assert.rejects(() => register('someone', 'a password here', 'not-an-email'), (err: unknown) => {
      assert.equal((err as Error).constructor, type)
      // The message is the machine code. Asserting it is NOT `error` as well
      // would be tautological — these two literals differ by construction.
      assert.equal((err as Error).message, code)
      return true
    })
  })
}

test('postAuth never surfaces the server\'s English text for a failure it has no code for', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  // register.js/login.js answer exactly this — prose, no code — for a body that
  // is too large, unparseable, or missing authHash.
  globalThis.fetch = jsonResponse(400, { error: 'Malformed request.' })
  await assert.rejects(() => loginLocal('someone', 'a password here'), (err: unknown) => {
    assert.equal((err as Error).constructor, AccountError)
    assert.equal((err as Error).message, 'auth-failed')
    return true
  })
})
