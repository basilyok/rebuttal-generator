// Server-side storage of a password account's authentication hash.
//
// What arrives is never the password: the browser sends authHash, itself the
// output of 600,000 PBKDF2 rounds over the password (see src/account.ts). This
// module's job is therefore narrower than a normal password hasher's — the
// input is already a uniform 256-bit value that cannot be dictionary-attacked,
// so the re-hash here exists to make a KV dump non-REPLAYABLE, not to slow
// guessing. That is why SERVER_ITERATIONS is small: 1,000 rounds is structure
// and upgrade agility (the count is stored per record), not stretching, and it
// stays well inside the Workers CPU budget.
//
// The vault invariant holds here too: authHash is one-way derived from the
// vault key, so nothing in this file — or in a dump of what it stores — can
// decrypt anyone's keys or history.

const SERVER_ITERATIONS = 1_000
export const PASSWORD_RECORD_VERSION = 1

const toBase64 = (bytes) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Strict inverse of toBase64. Returns null (never throws) on anything malformed. */
export function fromBase64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(value)) return null
  try {
    return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0))
  } catch {
    return null
  }
}

async function pbkdf2(secretBytes, saltBytes, iterations) {
  const material = await crypto.subtle.importKey('raw', secretBytes, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    material,
    256
  )
  return new Uint8Array(bits)
}

/** Hash a just-received authHash for storage, under a fresh per-user salt. */
export async function hashAuth(authHashBytes) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(authHashBytes, salt, SERVER_ITERATIONS)
  return {
    salt: toBase64(salt),
    hash: toBase64(hash),
    iterations: SERVER_ITERATIONS,
    version: PASSWORD_RECORD_VERSION,
  }
}

/**
 * Byte-wise comparison without an early exit — an early exit would leak how
 * much of the digest matched. Length mismatch returns immediately: both sides
 * are fixed-length digests, so length is not secret.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Verify a login attempt against a stored record. False (never a throw) on any malformed input. */
export async function verifyAuth(record, authHashBytes) {
  const salt = fromBase64(record?.salt)
  const expected = fromBase64(record?.hash)
  const iterations = Number.isInteger(record?.iterations) ? record.iterations : 0
  if (!salt || !expected || iterations < 1) return false
  const actual = await pbkdf2(authHashBytes, salt, iterations)
  return timingSafeEqual(actual, expected)
}
