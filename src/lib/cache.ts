import { idbGet, idbSet, idbDel, idbDelPrefix } from "./idb"

// Bump when the on-disk shape of any cached payload changes in a
// non-backwards-compatible way. All existing cache entries become invalid.
// v2: SetEntry gained `setNumber` and ExerciseLog/Routine gained `position`
// (server ordering keys). Old entries lack them, so they must not be reused —
// the next-number math would otherwise read undefined and mis-key inserts.
const CACHE_VERSION = 2

// Drop cache entries older than this on read. Background revalidation refreshes
// stale-but-valid entries; this guard prevents truly ancient data (an account
// dormant for months) from rendering on launch.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

type Envelope<T> = {
  v: number
  t: number
  data: T
}

function fullKey(userId: string | null, key: string): string {
  // userId-scoped keys ensure two accounts on the same device never see each
  // other's cached data. `_` for unauthenticated reads (exercises list).
  return `c:v${CACHE_VERSION}:${userId ?? "_"}:${key}`
}

export async function readCache<T>(
  userId: string | null,
  key: string,
): Promise<T | undefined> {
  const env = await idbGet<Envelope<T>>(fullKey(userId, key))
  if (!env) return undefined
  if (env.v !== CACHE_VERSION) return undefined
  if (Date.now() - env.t > MAX_AGE_MS) return undefined
  return env.data
}

export async function writeCache<T>(
  userId: string | null,
  key: string,
  data: T,
): Promise<void> {
  const env: Envelope<T> = { v: CACHE_VERSION, t: Date.now(), data }
  await idbSet(fullKey(userId, key), env)
}

export async function dropCache(
  userId: string | null,
  key: string,
): Promise<void> {
  await idbDel(fullKey(userId, key))
}

export async function dropUserCache(userId: string | null): Promise<void> {
  await idbDelPrefix(`c:v${CACHE_VERSION}:${userId ?? "_"}:`)
}

export async function dropAllCache(): Promise<void> {
  await idbDelPrefix(`c:v${CACHE_VERSION}:`)
}

// Stable, deterministic stringify so dep arrays serialize the same regardless
// of key order. Used to compose cache keys from a hook's deps.
export function depsKey(deps: ReadonlyArray<unknown>): string {
  return deps.map((d) => {
    if (d === null || d === undefined) return "_"
    if (typeof d === "object") {
      try { return JSON.stringify(d, Object.keys(d as object).sort()) }
      catch { return String(d) }
    }
    return String(d)
  }).join("|")
}
