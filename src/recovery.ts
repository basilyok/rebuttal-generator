// Recovery-code crypto. The code is the second way into an account's data, so
// it is treated with the same weight as the password: 600k PBKDF2 rounds, a
// distinct salt prefix, and a one-way auth value that proves possession
// without ever transmitting the code.
//
// What this module never does: send the code anywhere, store it, or derive
// anything the server could use to reconstruct it.
import { normalizeUsername } from './account'
import { toBase64, fromBase64, type VaultBlob } from './vault'

/**
 * Crockford base32 — no I, L, O or U. Those four are the characters people
 * misread and mistype when copying a code off a screen onto paper and back
 * again, which is exactly the journey this string is designed for.
 */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const GROUPS = 6
const GROUP_SIZE = 4
/** 24 characters × 5 bits = 120 bits, rounded up to 128 bits of draw below. */
const CODE_CHARS = GROUPS * GROUP_SIZE

const SALT_PREFIX = 'rebuttal|recovery|v1|'
const ITERATIONS = 600_000

/**
 * A fresh code. Rejection sampling, not modulo: the alphabet is 32 characters
 * and a byte is 256 values, so `byte % 32` would be uniform here by luck —
 * but writing it this way keeps the code correct if the alphabet ever changes
 * length, which is exactly the kind of silent bias nobody re-checks.
 */
export function generateRecoveryCode(): string {
  const chars: string[] = []
  while (chars.length < CODE_CHARS) {
    for (const byte of crypto.getRandomValues(new Uint8Array(CODE_CHARS))) {
      if (chars.length === CODE_CHARS) break
      if (byte >= 256 - (256 % RECOVERY_ALPHABET.length)) continue // discard the biased tail
      chars.push(RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length])
    }
  }
  const groups: string[] = []
  for (let i = 0; i < GROUPS; i++) groups.push(chars.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE).join(''))
  return groups.join('-')
}

/**
 * What the user types back will not match what we showed them: they will
 * lowercase it, drop the dashes, or paste it with whitespace. All of those are
 * the same secret, so normalize before deriving — otherwise a correct code
 * fails and the user concludes recovery is broken.
 */
export const normalizeRecoveryCode = (code: string) => code.trim().toUpperCase().replace(/[\s-]/g, '')

async function pbkdf2(secret: BufferSource, salt: BufferSource, iterations: number): Promise<ArrayBuffer> {
  const material = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, 256)
}

export interface RecoveryCredentials {
  /** Wraps the DEK. Never leaves the browser. */
  recoveryKeyBytes: Uint8Array
  /** Proves possession to the server. A one-way function of recoveryKey. */
  recoveryAuth: string
}

/**
 * Mirrors deriveCredentials() in account.ts deliberately — same rounds, same
 * two-step shape — so the two credentials have the same strength. The salt
 * prefix differs, which is what stops a recoveryAuth from ever being replayable
 * against the password endpoint or vice versa.
 */
export async function deriveRecoveryCredentials(username: string, code: string): Promise<RecoveryCredentials> {
  const encoder = new TextEncoder()
  const normalized = normalizeRecoveryCode(code)
  const recoveryKey = await pbkdf2(
    encoder.encode(normalized) as unknown as BufferSource,
    encoder.encode(SALT_PREFIX + normalizeUsername(username)) as unknown as BufferSource,
    ITERATIONS
  )
  const authBits = await pbkdf2(recoveryKey, encoder.encode(normalized) as unknown as BufferSource, 1)
  return { recoveryKeyBytes: new Uint8Array(recoveryKey), recoveryAuth: toBase64(new Uint8Array(authBits)) }
}

/** Import raw key bytes (masterKey or recoveryKey) as an AES-GCM wrapping key. */
export async function importWrappingKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as unknown as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** AES-GCM the DEK under a wrapping key. Fresh 12-byte IV every call — reuse under GCM is catastrophic. */
export async function wrapDek(key: CryptoKey, dek: Uint8Array): Promise<VaultBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    dek as unknown as BufferSource
  )
  return { salt: '', iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)), version: 1 }
}

/** Inverse of wrapDek. Throws on the wrong key — never returns garbage bytes. */
export async function unwrapDek(key: CryptoKey, blob: VaultBlob): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) as unknown as BufferSource },
    key,
    fromBase64(blob.ciphertext) as unknown as BufferSource
  )
  return new Uint8Array(plaintext)
}

/** A fresh 256-bit data key. The only key that ever encrypts vault or history content. */
export const generateDek = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32))
