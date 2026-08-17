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
import {
  toBase64,
  fromBase64,
  sealJson,
  openBlob,
  fetchVault,
  saveVault,
  BLOB_VERSION_MASTER,
  BLOB_VERSION_DEK,
  type VaultBlob,
  type BlobKeys,
  type KeyBundle,
} from './vault'
import { fetchHistoryBlobStrict, pushHistory, type HistoryEntry } from './history'

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
/**
 * 24 characters × 5 bits per base32 character = 120 bits of entropy. The
 * length was chosen for legibility — six short groups are readable aloud and
 * retypable — and the entropy follows from it, not the reverse. 120 bits is
 * far past brute-force even for someone holding the wrapped blob offline.
 */
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
 * The last rule strips two whole Unicode categories rather than a literal "-".
 * \p{Pd} (dash punctuation) covers the en-dashes and non-breaking hyphens a
 * code picks up from smart-dash autocorrect. \p{Cf} (format) covers the
 * invisibles — U+00AD soft hyphen above all, which is what a PDF actually
 * inserts at a line break, plus zero-width spaces and word joiners from rich
 * text. A soft-hyphenated paste looks character-for-character correct on
 * screen, so leaving it in means rejecting a code the user can see is right.
 * Neither category can ever be meaningful inside a typed secret, and no
 * character in either is in RECOVERY_ALPHABET, so stripping them cannot
 * destroy information. Matching the categories rather than enumerating
 * codepoints means the next such character someone's word processor invents
 * is already handled.
 */
export const normalizeRecoveryCode = (code: string) =>
  code
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/[\s\p{Pd}\p{Cf}]/gu, '')

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
    // Not base64 at all — a clipped JSON field, or a value that was never a
    // record. No code can fix this, so it must not come back as a bad code.
    throw new CorruptDekRecordError()
  }
  // Decoding is not enough on its own: atob is strict about framing but says
  // nothing about content, and base64 truncated at a 4-character boundary is
  // still well-formed. Truncation is the likeliest way this record actually
  // goes bad — a partial KV write, a half-finished migration — so without a
  // length check the exact user this split exists to protect gets told
  // "wrong code, try again" about a code that was right. The shape is
  // structural, not cryptographic: wrapDek always writes a 12-byte IV and a
  // 48-byte ciphertext (the 32-byte DEK plus a 16-byte GCM tag).
  if (iv.length !== 12 || ciphertext.length < 17) throw new CorruptDekRecordError()

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

// --- transport --------------------------------------------------------------
// Same conventions as fetchVault/saveVault in src/vault.ts: same-origin
// credentials, null for "not signed in", throw for anything else.

/** The two wrapped copies of one DEK, exactly as /api/dek stores them. */
export interface DekRecord {
  byPassword: VaultBlob
  byRecovery: VaultBlob
}

export async function fetchDek(): Promise<DekRecord | null> {
  const response = await fetch('/api/dek', { credentials: 'same-origin' })
  if (response.status === 401 || response.status === 501) return null
  // Deliberately NOT `if (!response.ok) return null`. /api/dek answers 500
  // `dek-corrupt` for a record that exists but will not parse, and it goes to
  // real trouble to keep that distinct from absence — because this caller's
  // answer to "absent" is to mint a fresh DEK and PUT it, which permanently
  // orphans every v2 blob the stored record could still have opened. Collapsing
  // an error into null would hand that outcome to a transient 500.
  if (!response.ok) throw new RecoveryError('dek-fetch-failed')
  const data = await response.json().catch(() => null)
  return data?.dek ?? null
}

export async function saveDek(record: DekRecord): Promise<void> {
  const response = await fetch('/api/dek', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(record),
  })
  if (!response.ok) throw new RecoveryError('dek-save-failed')
}

/**
 * Store the verifier for a freshly-minted code on an account already signed in.
 * Not exported: a verifier written without the matching byRecovery copy landing
 * in the same sequence is a code that proves possession of nothing, so this only
 * ever runs as setupRecovery's second step.
 */
async function registerRecoveryAuth(recoveryAuth: string): Promise<void> {
  const response = await fetch('/api/auth/recover/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ recoveryAuth }),
  })
  if (!response.ok) throw new RecoveryError('recovery-register-failed')
}

// --- migration --------------------------------------------------------------

/**
 * Whether this blob is one of ours to rewrite.
 *
 * An absent `version` predates tagging and is master-era by definition (see
 * openBlob). Anything that is neither era came from a newer client: leaving it
 * alone is the only safe move, since we could not open it to re-seal it and
 * overwriting it would destroy data that is probably fine. isFullyMigrated()
 * then reports the account as not migrated, which refuses a reset — the safe
 * direction, because a reset would rewrap a DEK that cannot open it either.
 */
const isMasterEra = (blob: VaultBlob) =>
  blob.version === undefined || blob.version === BLOB_VERSION_MASTER

/**
 * Re-encrypt anything still sealed under masterKey so it is sealed under the
 * DEK instead. Idempotent by construction: a blob already tagged v2 is skipped,
 * so an interrupted run simply finishes on the next sign-in.
 *
 * Called only while signed in, which is the one moment BOTH keys exist — that
 * is what makes this safe to leave half-done.
 *
 * Nothing here is caught. openBlob throwing means the blob would not open with
 * the key its own tag names, and re-sealing whatever came back would replace
 * real ciphertext with garbage; aborting leaves the account exactly as it was
 * and the next sign-in tries again.
 */
export async function ensureMigrated(keys: Required<BlobKeys>): Promise<void> {
  const vaultBlob = await fetchVault()
  if (vaultBlob && isMasterEra(vaultBlob)) {
    const bundle = await openBlob<KeyBundle>(keys, vaultBlob)
    // The key and the era tag move together, in one expression, on purpose.
    await saveVault(await sealJson(keys.dekKey, bundle, BLOB_VERSION_DEK))
  }

  // The STRICT read: a swallowed failure here reads as "no history to migrate"
  // and this function would report success having skipped it.
  const historyBlob = await fetchHistoryBlobStrict()
  if (historyBlob && isMasterEra(historyBlob)) {
    const remote = await openBlob<{ v: number; entries: HistoryEntry[] }>(keys, historyBlob)
    const entries = Array.isArray(remote?.entries) ? remote.entries : []
    await pushHistory(entries, keys.dekKey, BLOB_VERSION_DEK)
  }
}

/**
 * True when every server-side blob is already DEK-sealed. An account with
 * nothing stored is migrated by definition — otherwise a new account would sit
 * at `incomplete` forever with no blob that could ever clear it.
 *
 * UNKNOWN FALLS ON THE NOT-MIGRATED SIDE, and that asymmetry is the whole point
 * of the try. This predicate has exactly one consumer of consequence: it decides
 * `ready`, and `ready` is what permits a reset. A wrong `true` therefore ends in
 * a rewrapped DEK and a stranded blob, while a wrong `false` costs a prompt the
 * user sees again next sign-in. There is no symmetric reading of a failed read
 * available here, so it is not offered.
 */
export async function isFullyMigrated(): Promise<boolean> {
  let blobs: [VaultBlob | null, VaultBlob | null]
  try {
    blobs = await Promise.all([fetchVault(), fetchHistoryBlobStrict()])
  } catch {
    return false
  }
  const ok = (blob: VaultBlob | null) => !blob || blob.version === BLOB_VERSION_DEK
  return blobs.every(ok)
}

/**
 * True when nothing stored is DEK-sealed — the precondition for minting a DEK.
 *
 * Deliberately not `!isFullyMigrated()`: the two are not complements. A
 * half-migrated account is neither fully migrated NOR safe to mint into, and
 * collapsing them would answer "yes, mint" for the account with one v2 blob
 * already. An era we do not recognise also answers false, because we could not
 * open that blob to re-seal it either.
 *
 * Throws rather than guessing if a read fails — see the call site.
 */
async function noDekEraStarted(): Promise<boolean> {
  const blobs = await Promise.all([fetchVault(), fetchHistoryBlobStrict()])
  return blobs.every((blob) => !blob || isMasterEra(blob))
}

// --- setup ------------------------------------------------------------------

/**
 * `none` — no DEK record: this account has never provisioned recovery.
 * `incomplete` — a DEK record exists but some blob is still v1 (or an era we do
 * not know), so provisioning was interrupted and has not self-healed yet.
 * `ready` — record present, every blob v2.
 */
export type RecoveryStatus = 'none' | 'incomplete' | 'ready'

export const recoveryStatusFor = (hasDekRecord: boolean, fullyMigrated: boolean): RecoveryStatus =>
  !hasDekRecord ? 'none' : fullyMigrated ? 'ready' : 'incomplete'

/**
 * A reset rewraps the DEK and replaces the password. A blob still sealed under
 * the OLD master key would be left with no key at all, so `incomplete` must
 * refuse — this is the client half of the "refuse reset while any blob is v1"
 * invariant, and the reason recoveryStatusFor distinguishes the two.
 */
export const canReset = (status: RecoveryStatus) => status === 'ready'

export interface SetupResult {
  code: string
  dekKey: CryptoKey
}

/**
 * Provision recovery for an account that has none, or finish a provisioning
 * that was interrupted.
 *
 * Write order is the safety property: the DEK record lands BEFORE any blob is
 * re-encrypted. Reversed, an interruption would leave blobs sealed under a DEK
 * that was never stored — unrecoverable, and the worst outcome this feature can
 * produce. In this order every intermediate state is one a later run converges
 * from.
 *
 * "The only failure mode is not-finished-yet" holds only for a SINGLE WRITER
 * against a consistent view of the record. It is not a property of the write
 * order alone, and stating it that way was wrong: two devices, two tabs, or one
 * device reading a KV replica that has not caught up are all writers racing
 * each other, and the first step below is the guard for that case rather than a
 * belt-and-braces check.
 *
 * The three steps and what an interruption after each one costs:
 *   1. saveDek     — both copies stored. Blobs are untouched and still open
 *                    under the password. Re-running finishes the job.
 *   2. register    — the new code becomes usable. Between 1 and 2 the code we
 *                    just wrapped verifies against nothing, so it must not be
 *                    shown: that is why this function returns the code only at
 *                    the end, and why a throw anywhere above never yields one.
 *   3. ensureMigrated — blobs move to the DEK. Interruptible at any point; the
 *                    per-blob version tag is what makes the half-done state
 *                    readable rather than needing a repair pass.
 *
 * Rotation caveat: step 1 overwrites byRecovery, so a previously-issued code
 * stops working the moment it lands, even if step 2 never does. That window is
 * survivable only because the password copy is untouched throughout — the user
 * can always re-run setup. /api/dek has no `previous` slot (auth/recover/
 * complete.js keeps one for the reset path, which has no password to fall back
 * on); here the password IS the fallback, so it does not need one.
 */
export async function setupRecovery(username: string, masterKey: CryptoKey): Promise<SetupResult> {
  const existing = await fetchDek()

  // Reuse the stored DEK if one exists. Minting a fresh one here would orphan
  // every blob already sealed under the old one.
  let dek: Uint8Array
  if (existing) {
    try {
      dek = await unwrapDek(masterKey, existing.byPassword)
    } catch {
      // A record this password cannot open means the account was reset from
      // another device, so this session's masterKey is stale. Generating a new
      // DEK would be the orphaning above; refuse instead and let the caller
      // re-authenticate. Rethrown as its own code rather than passed through,
      // because unwrapDek's WrongRecoveryCodeError would tell the UI to blame a
      // recovery code that was never involved.
      throw new RecoveryError('dek-not-openable')
    }
  } else {
    // "No record" is not the same claim as "no DEK era". env.ACCOUNTS is Workers
    // KV, which is eventually consistent globally: a PUT on one device can read
    // back as null from another colo for up to about a minute, and two tabs
    // running first-time setup race the same way. If any blob is ALREADY
    // DEK-sealed, minting here stores a second DEK that cannot open it —
    // ensureMigrated skips v2 blobs, so nothing downstream ever repairs it, and
    // there is no third copy to fall back to. That is the one unrecoverable
    // outcome this whole design exists to prevent, so the absence has to be
    // corroborated against the blobs rather than trusted on its own.
    //
    // A failed read here propagates rather than being caught: not knowing is a
    // reason to refuse to mint, never a reason to proceed.
    if (!(await noDekEraStarted())) throw new RecoveryError('dek-record-missing')
    dek = generateDek()
  }

  const code = generateRecoveryCode()
  const { recoveryKeyBytes, recoveryAuth } = await deriveRecoveryCredentials(username, code)
  const recoveryWrapKey = await importWrappingKey(recoveryKeyBytes)

  await saveDek({
    byPassword: await wrapDek(masterKey, dek),
    byRecovery: await wrapDek(recoveryWrapKey, dek),
  })
  await registerRecoveryAuth(recoveryAuth)

  const dekKey = await importWrappingKey(dek)
  await ensureMigrated({ masterKey, dekKey })
  return { code, dekKey }
}
