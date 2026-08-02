// Reply history: local-first, encrypted-sync second. Every generation lands in
// IndexedDB immediately (signed in or not); when the vault key is available,
// the newest 100 entries also sync to /api/history as ONE ciphertext blob —
// one KV write per save, and the server never sees plaintext. Losing the vault
// key loses the synced history by design; the local copy is unaffected.
import { sealJson, openJson, cachedKey, type VaultBlob } from './vault'
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

export async function pushHistory(entries: HistoryEntry[]): Promise<void> {
  const key = await cachedKey()
  if (!key) return // no unlocked vault on this device — local-only, silently
  const blob = await sealJson(key, { v: 1, entries: entries.slice(0, HISTORY_CAP) })
  await fetch('/api/history', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(blob),
  }).catch(() => {}) // a failed sync is not worth interrupting the user (same policy as syncVault)
}

/** Pull the remote blob, merge with local, write the merge back locally. Returns the merged list. */
export async function pullAndMergeHistory(): Promise<HistoryEntry[] | null> {
  const key = await cachedKey()
  if (!key) return null
  const blob = await fetchHistoryBlob()
  const local = await listEntries()
  if (!blob) return local
  try {
    const remote = await openJson<{ v: number; entries: HistoryEntry[] }>(key, blob)
    const merged = mergeEntries(local, Array.isArray(remote?.entries) ? remote.entries : [])
    for (const e of merged) await saveEntry(e)
    return merged
  } catch {
    return local // wrong key or corrupt blob: local history still works
  }
}
