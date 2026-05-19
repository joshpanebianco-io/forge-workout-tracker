// Minimal IndexedDB key/value wrapper. One DB, one object store. No deps.
// Async API but very fast — typical ops complete in <1ms after the initial
// open. The opened DB is reused across calls.

const DB_NAME = "forge"
const DB_VERSION = 1
const STORE = "kv"

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"))
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error("IDB open blocked"))
  })
  return dbPromise
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | void,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    let result: T | undefined
    const req = fn(store)
    if (req) {
      req.onsuccess = () => { result = req.result as T }
      req.onerror = () => reject(req.error)
    }
    tx.oncomplete = () => resolve(result as T)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await withStore<T | undefined>("readonly", (s) => s.get(key))
  } catch {
    return undefined
  }
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    await withStore<void>("readwrite", (s) => s.put(value, key))
  } catch {
    /* quota / private mode — ignore */
  }
}

export async function idbDel(key: string): Promise<void> {
  try {
    await withStore<void>("readwrite", (s) => s.delete(key))
  } catch { /* ignore */ }
}

export async function idbKeys(prefix?: string): Promise<string[]> {
  try {
    const all = await withStore<IDBValidKey[]>("readonly", (s) => s.getAllKeys())
    const keys = (all ?? []).map(String)
    return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys
  } catch {
    return []
  }
}

export async function idbDelPrefix(prefix: string): Promise<void> {
  const keys = await idbKeys(prefix)
  await Promise.all(keys.map((k) => idbDel(k)))
}

export async function idbClear(): Promise<void> {
  try {
    await withStore<void>("readwrite", (s) => s.clear())
  } catch { /* ignore */ }
}
