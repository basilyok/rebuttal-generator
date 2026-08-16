// Recovery-code crypto. The code is the second way into an account's data, so
// it is treated with the same weight as the password: 600k PBKDF2 rounds, a
// distinct salt prefix, and a one-way auth value that proves possession
// without ever transmitting the code.
//
// The DEK (data encryption key) is the random 256-bit key that actually
// encrypts vault and history content. It is never derived from anything — it
// is wrapped, once under the password-derived key and once under the key this
// module derives, so a password reset can rewrite the wrapping instead of
// re-encrypting (or destroying) the data underneath.
//
// What this module never does: send the code anywhere, store it, or derive
// anything the server could use to reconstruct it.
import { normalizeUsername, pbkdf2 } from './account'
import { toBase64, fromBase64, type VaultBlob } from './vault'

/**
 * Every error here carries a stable machine code as its `message`, never a
 * sentence — the same contract as the AccountError family in src/account.ts,
 * and for the same reason: the UI renders twelve locales, so an English
 * `message` is a string no translation can reach. Callers switch on the type.
 *
 * The split matters to the reset flow specifically. "You typed the code
 * wrong" is a retry; "the stored record will not decode" is unrecoverable and
 * must say so instead of inviting a fourth attempt at a code that was right.
 */
export class RecoveryError extends Error {}
export class WrongRecoveryCodeError extends RecoveryError {
  constructor() {
    super('wrong-recovery-code')
  }
}
export class CorruptDekRecordError extends RecoveryError {
  constructor() {
    super('corrupt-dek-record')
  }
}

/**
 * Crockford base32 — no I, L, O or U. Those four are the characters people
 * misread and mistype when copying a code off a screen onto paper and back
 * again, which is exactly the journey this string is designed for.
 */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const GROUPS = 6
const GROUP_SIZE = 4
/** 24 characters × 5 bits = 120 bits of entropy. */
const CODE_CHARS = GROUPS * GROUP_SIZE

/**
 * A different format from VAULT_VERSION, which it merely resembles: this tags
 * the wrapped-DEK record, whose `salt` is empty because the key came from
 * elsewhere. Kept separate so the two can version independently.
 */
const WRAPPED_DEK_VERSION = 1

/**
 * Frozen for the same reason as CLIENT_ITERATIONS and the "v1" salt in
 * src/account.ts — see the docblocks there — but with less room to recover.
 * A password can at least be reset from a recovery code; a recovery code has
 * nothing behind it. Changing either value re-derives a different key for
 * every code already written down on paper, and those users have no second
 * door. Treat both as append-only: a "v2" is a new format alongside this one,
 * never an edit of these two lines.
 */
const SALT_PREFIX = 'rebuttal|recovery|v1|'
const ITERATIONS = 600_000

/**
 * A fresh code. Rejection sampling, not modulo: 32 divides 256 exactly, so
 * `byte % 32` is uniform today — the guard exists so that stays true if the
 * alphabet ever changes length, because a non-divisor would bias the first
 * `256 % n` characters and nothing about the output would look wrong.
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
 *
 * The I/L→1 and O→0 substitutions are the half of Crockford that actually
 * carries the weight. Omitting those letters from the alphabet only protects
 * the direction where we render the code; the likelier error is the human one
 * — writing `0` down and reading back `O` — and folding them here is what
 * turns that into a successful unlock rather than an unexplained failure.
 *
 * The dash class is \p{Pd} (Unicode dash punctuation), not a literal "-": a
 * code copied out of a PDF, or typed where smart-dash autocorrect is on,
 * arrives with en-dashes and non-breaking hyphens that are visually identical
 * to what we printed. Matching the whole category rather than enumerating
 * U+2010–U+2015 means the next dash someone's word processor invents is
 * already handled.
 */
export const normalizeRecoveryCode = (code: string) =>
  code
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/[\s\p{Pd}]/gu, '')

/**
 * Exported so the UI can reject a half-typed code immediately. Without it the
 * only feedback available costs 600k PBKDF2 rounds — roughly a second — to say
 * something a regex knew at the first keystroke.
 */
export const isValidRecoveryCode = (code: string) => {
  const n = normalizeRecoveryCode(code)
  return n.length === CODE_CHARS && [...n].every((c) => RECOVERY_ALPHABET.includes(c))
}

export interface RecoveryCredentials {
  /**
   * Wraps the DEK. Never leaves the browser. Left un-zeroed after use for the
   * reasons spelled out on masterKeyBytes in src/account.ts — the omission is
   * deliberate and identical here, not an oversight.
   */
  recoveryKeyBytes: Uint8Array
  /** Proves possession to the server. A one-way function of recoveryKey. */
  recoveryAuth: string
}

/**
 * Mirrors deriveCredentials() in account.ts deliberately — same helper, same
 * rounds, same two-step shape — so the two credentials have the same strength.
 * The salt prefix differs, which is what stops a recoveryAuth from ever being
 * replayable against the password endpoint or vice versa.
 *
 * Stretching a full-entropy 120-bit secret buys nothing against brute force;
 * 600k rounds are here for two other reasons. It keeps this path identical to
 * the password path, so a future hardening cannot leave one of them behind.
 * And it is insurance against the code format: if a later version shortens it
 * for usability, or a user is ever allowed to supply their own, the work
 * factor is already in place rather than needing a migration to add. The cost
 * is about a second in a flow where the user is already anxious, which is why
 * callers should show progress rather than appear frozen.
 */
export async function deriveRecoveryCredentials(username: string, code: string): Promise<RecoveryCredentials> {
  // Validate before deriving, because failure here is the module's one chance
  // to be loud. On the verification path a bad code is harmless — the server
  // rejects the auth value. On the ENROLMENT path it is not: deriving from ''
  // or from a half-typed code yields a perfectly valid-looking wrapping key,
  // and the wrapped DEK written under it is guessable by anyone who reads the
  // record. Nothing downstream can tell that blob from a good one.
  if (!isValidRecoveryCode(code)) throw new WrongRecoveryCodeError()
  const normalizedUsername = normalizeUsername(username)
  // The username is load-bearing salt, not a label: an empty one collapses
  // every account's derivation onto the same salt.
  if (!normalizedUsername) throw new RecoveryError('username-required')

  const encoder = new TextEncoder()
  const normalized = normalizeRecoveryCode(code)
  const recoveryKey = await pbkdf2(
    encoder.encode(normalized) as unknown as BufferSource,
    encoder.encode(SALT_PREFIX + normalizedUsername) as unknown as BufferSource,
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
  return {
    salt: '',
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    version: WRAPPED_DEK_VERSION,
  }
}

/** Inverse of wrapDek. Throws on the wrong key — never returns garbage bytes. */
export async function unwrapDek(key: CryptoKey, blob: VaultBlob): Promise<Uint8Array> {
  let iv: Uint8Array
  let ciphertext: Uint8Array
  try {
    iv = fromBase64(blob.iv)
    ciphertext = fromBase64(blob.ciphertext)
  } catch {
    // The record itself is malformed — truncated, or never base64 to begin
    // with. No code can fix this, so it must not be reported as a bad code.
    throw new CorruptDekRecordError()
  }
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    )
  } catch {
    // GCM authentication failed: wrong key, or the ciphertext was tampered
    // with. Indistinguishable by design, and "try the code again" is the
    // right next step for either.
    throw new WrongRecoveryCodeError()
  }
  return new Uint8Array(plaintext)
}

/** A fresh 256-bit data key. The only key that ever encrypts vault or history content. */
export const generateDek = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32))
