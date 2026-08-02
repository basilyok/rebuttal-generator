// Zero-knowledge API key vault.
//
// The problem: people want to enter their API keys once and have them follow them
// to a new device. The naive solution — store the keys on the server — makes this
// app the custodian of credentials that spend real money, so one bug in a session
// check bills somebody's Anthropic account.
//
// Instead: the keys are encrypted in this file, in the browser, with a key derived
// from a passphrase the server never receives. The server stores three opaque
// blobs (see functions/api/vault.js) and cannot decrypt them. A full dump of that
// KV namespace yields nothing spendable.
//
// The cost is one passphrase per new device. That is still strictly less work than
// re-entering several API keys, and it is the only version of "sync my keys" that
// does not quietly transfer the user's financial risk onto this app.
//
// WHY THE DERIVED KEY SURVIVES A RELOAD: it is stored in IndexedDB as a
// non-extractable CryptoKey. The browser will use it to decrypt but will not hand
// its bytes back to script — so the passphrase is asked for once per device, not
// once per page load, and even then the raw key material never exists in JS.

const DB_NAME = 'rebuttal-vault'
const STORE = 'keys'
const KEY_ID = 'vault-key'

/**
 * PBKDF2 is not the strongest KDF available, but it is the only one WebCrypto
 * implements natively, and shipping an Argon2 wasm build to every visitor to
 * protect a key the user can revoke in one click is the wrong trade. 600,000
 * iterations matches current OWASP guidance for PBKDF2-HMAC-SHA256.
 */
const PBKDF2_ITERATIONS = 600_000
export const VAULT_VERSION = 1

export interface VaultBlob {
  salt: string
  iv: string
  ciphertext: string
  version?: number
  updatedAt?: number
}

/** Provider id → API key. Exactly what used to sit loose in localStorage. */
export type KeyBundle = Record<string, string>

export class VaultError extends Error {}
/** The passphrase did not decrypt the vault. Its own type so the UI can say so precisely. */
export class WrongPassphraseError extends VaultError {
  constructor() {
    super('That passphrase did not unlock the vault.')
  }
}

// --- encoding helpers -------------------------------------------------------

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const fromBase64 = (value: string): Uint8Array => Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0))

// --- IndexedDB key cache ----------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    // Private browsing and some lockdown modes block IndexedDB. The vault still
    // works; the passphrase is simply asked for once per page load.
    return null
  }
  return new Promise((resolve) => {
    try {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve((request.result as T) ?? null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    } finally {
      // Safe to close: the transaction completes independently once started
      setTimeout(() => db.close(), 0)
    }
  })
}

const cacheKey = (key: CryptoKey) => idb<void>('readwrite', (store) => store.put(key, KEY_ID))
/** Exported for other vault-key consumers (history) that need the cached device key. */
export const cachedKey = () => idb<CryptoKey>('readonly', (store) => store.get(KEY_ID))

/**
 * Drop the derived key from this device. Called on sign-out — otherwise "signing
 * out" on a shared machine would leave the next person able to decrypt the vault.
 */
export const forgetDeviceKey = () => idb<void>('readwrite', (store) => store.delete(KEY_ID))

// --- crypto -----------------------------------------------------------------

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    // Non-extractable: the browser will decrypt with this key but never reveal it,
    // so caching it in IndexedDB does not put raw key material on disk for script.
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Turn a passphrase into a usable key for an existing vault, proving it is correct
 * by actually decrypting. Caches the key for this device on success.
 */
export async function unlock(blob: VaultBlob, passphrase: string): Promise<KeyBundle> {
  const key = await deriveKey(passphrase, fromBase64(blob.salt))
  const bundle = await decryptWith(key, blob)
  await cacheKey(key)
  return bundle
}

async function decryptWith(key: CryptoKey, blob: VaultBlob): Promise<KeyBundle> {
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(blob.iv) as unknown as BufferSource },
      key,
      fromBase64(blob.ciphertext) as unknown as BufferSource
    )
  } catch {
    // AES-GCM authentication failed: wrong passphrase, or the blob was tampered with.
    // Indistinguishable by design, and both mean the same thing to the user.
    throw new WrongPassphraseError()
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(plaintext))
    return parsed && typeof parsed === 'object' ? (parsed as KeyBundle) : {}
  } catch {
    throw new VaultError('The vault decrypted but its contents were unreadable.')
  }
}

/** Decrypt using the key already cached on this device, or null if there is none. */
export async function unlockWithDeviceKey(blob: VaultBlob): Promise<KeyBundle | null> {
  const key = await cachedKey()
  if (!key) return null
  try {
    return await decryptWith(key, blob)
  } catch {
    // The cached key belongs to a different vault — e.g. the passphrase was changed
    // on another device. Drop it so the user is asked afresh rather than stuck.
    await forgetDeviceKey()
    return null
  }
}

/** Encrypt a bundle under a new passphrase. Used for first setup and for changes. */
export async function seal(bundle: KeyBundle, passphrase: string): Promise<VaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(passphrase, salt)
  await cacheKey(key)
  return sealWith(key, bundle, salt)
}

/** Re-encrypt with the device's existing key — no passphrase prompt needed. */
export async function resealWithDeviceKey(bundle: KeyBundle, blob: VaultBlob): Promise<VaultBlob | null> {
  const key = await cachedKey()
  if (!key) return null
  return sealWith(key, bundle, fromBase64(blob.salt))
}

async function sealWith(key: CryptoKey, bundle: KeyBundle, salt: Uint8Array): Promise<VaultBlob> {
  // A fresh IV per encryption is mandatory for AES-GCM: reusing one with the same
  // key is a catastrophic failure, not a weakness.
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(bundle))
  )
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    version: VAULT_VERSION,
  }
}

/**
 * Generic AES-GCM JSON sealing for other vault-key consumers (history). Same
 * key, same blob shape, fresh 12-byte IV per call — IV reuse under GCM is
 * catastrophic, so the IV is ALWAYS generated here, never passed in.
 *
 * Unlike seal()/sealWith(), this is not bound to KeyBundle or to deriving a
 * key from a passphrase: callers hand in whatever CryptoKey they already have
 * (from cachedKey()) and whatever JSON-serialisable value they want sealed.
 * The salt field is carried for VaultBlob shape-compatibility only; it plays
 * no role in decryption here since the key is supplied directly, not derived.
 */
export async function sealJson(key: CryptoKey, value: unknown): Promise<VaultBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    plaintext as unknown as BufferSource
  )
  return {
    salt: toBase64(crypto.getRandomValues(new Uint8Array(16))),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    version: VAULT_VERSION,
  }
}

/** Inverse of sealJson(). Throws (never returns garbage) if the key is wrong or the blob was tampered with. */
export async function openJson<T = unknown>(key: CryptoKey, blob: VaultBlob): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) as unknown as BufferSource },
    key,
    fromBase64(blob.ciphertext) as unknown as BufferSource
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

// --- server transport -------------------------------------------------------

export async function fetchVault(): Promise<VaultBlob | null> {
  const response = await fetch('/api/vault', { credentials: 'same-origin' })
  if (response.status === 401 || response.status === 501) return null
  if (!response.ok) throw new VaultError('Could not load your saved keys.')
  const data = await response.json().catch(() => null)
  return data?.vault ?? null
}

export async function saveVault(blob: VaultBlob): Promise<void> {
  const response = await fetch('/api/vault', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(blob),
  })
  if (!response.ok) throw new VaultError('Could not save your keys.')
}

export async function deleteVault(): Promise<void> {
  await fetch('/api/vault', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
  await forgetDeviceKey()
}

/**
 * A passphrase weak enough to brute-force offline defeats the entire design, since
 * the attacker who steals the ciphertext can guess at their leisure. This is advice,
 * not enforcement — refusing to save someone's own keys would be worse.
 */
export function passphraseWarning(passphrase: string): string {
  if (passphrase.length < 12) return 'short'
  if (!/[^a-zA-Z]/.test(passphrase)) return 'letters-only'
  return ''
}
