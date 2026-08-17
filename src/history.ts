// Reply history: local-first, encrypted-sync second. Every generation lands in
// IndexedDB immediately (signed in or not); when the vault key is available,
// the newest 100 entries also sync to /api/history as ONE ciphertext blob —
// one KV write per save, and the server never sees plaintext. Losing the vault
// key loses the synced history by design; the local copy is unaffected.
import {
  sealJson,
  openBlob,
  MissingKeyError,
  UnknownBlobVersionError,
  type BlobKeys,
  type VaultBlob,
} from './vault'
import type { Citation } from './providers'

export interface HistoryEntry {
  id: string
  createdAt: number
  argument: string
  message: string
  strategy?: string
  weakLink?: string
  citations?: Citation[]
  modelLabel?: string
  articleTitle?: string
  articleUrl?: string
}

export const HISTORY_CAP = 100
const DB_NAME = 'rebuttal-history'
const STORE = 'entries'

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null) // private browsing: history is a nice-to-have, never an error
    } catch {
      resolve(null)
    }
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    } finally {
      // Safe to close: the transaction completes independently once started
      setTimeout(() => db.close(), 0)
    }
  })
}

export async function listEntries(): Promise<HistoryEntry[]> {
  const all = (await idb<HistoryEntry[]>('readonly', (s) => s.getAll())) || []
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, HISTORY_CAP)
}

export async function saveEntry(entry: HistoryEntry): Promise<void> {
  await idb('readwrite', (s) => s.put(entry))
}

export async function deleteEntry(id: string): Promise<void> {
  await idb('readwrite', (s) => s.delete(id))
}

export async function clearAllEntries(): Promise<void> {
  await idb('readwrite', (s) => s.clear())
}

/** Union by id, newest first, capped — pure, so it is unit-testable. */
export function mergeEntries(local: HistoryEntry[], remote: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>()
  for (const e of [...local, ...remote]) {
    if (!byId.has(e.id)) byId.set(e.id, e)
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, HISTORY_CAP)
}

// --- sync (same transport contract as fetchVault/saveVault in vault.ts) ---

export async function fetchHistoryBlob(): Promise<VaultBlob | null> {
  const response = await fetch('/api/history', { credentials: 'same-origin' }).catch(() => null)
  if (!response || response.status === 401 || response.status === 501) return null
  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  return data?.history ?? null
}

/**
 * The key is a parameter rather than a cachedKey() lookup because during
 * migration two keys exist and only the caller knows which era this account is
 * in; a module-level guess would seal history under a key the reader is not
 * using.
 *
 * `version` has deliberately NO default. The tag means "this era's key sealed
 * me", and reset gates on it — a blob wrongly claiming v2 passes the very check
 * meant to stop it, and the reset then rewraps the DEK and strands this
 * history. A default is how a writer comes to assert an era its caller never
 * confirmed, so every call site must state which key it is actually holding.
 */
export async function pushHistory(
  entries: HistoryEntry[],
  key: CryptoKey,
  version: number
): Promise<void> {
  const blob = await sealJson(key, { v: 1, entries: entries.slice(0, HISTORY_CAP) }, version)
  await fetch('/api/history', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(blob),
  }).catch(() => {}) // a failed sync is not worth interrupting the user (same policy as syncVault)
}

/**
 * Pull the remote blob, merge with local, write the merge back locally. Returns
 * the merged list. `keys` carries whichever of the two eras the caller holds;
 * openBlob picks by the blob's own tag, so a half-migrated account still reads.
 */
export async function pullAndMergeHistory(keys: BlobKeys): Promise<HistoryEntry[] | null> {
  if (!keys.masterKey && !keys.dekKey) return null
  const blob = await fetchHistoryBlob()
  const local = await listEntries()
  if (!blob) return local
  try {
    const remote = await openBlob<{ v: number; entries: HistoryEntry[] }>(keys, blob)
    const merged = mergeEntries(local, Array.isArray(remote?.entries) ? remote.entries : [])
    for (const e of merged) await saveEntry(e)
    return merged
  } catch (err) {
    // A blob we merely lack the key for is intact and opens under the other
    // era; one tagged with an era we do not know came from a newer client and
    // is probably fine too. Returning `local` hands either straight to the
    // caller, which pushes the merge back — overwriting the very blob we could
    // not read, on the half-migrated account the version tag exists to protect.
    // `null` is the established "do not push" signal, so no caller changes.
    if (err instanceof MissingKeyError || err instanceof UnknownBlobVersionError) return null
    return local // wrong key or corrupt blob: local history still works
  }
}
