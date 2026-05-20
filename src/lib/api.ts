import * as React from "react"
import { supabase } from "./supabase"
import { useAuth } from "./auth"
import {
  addDays, startOfWeek, startOfMonth, startOfDay, localDayKey, localMonthKey,
} from "./utils"
import { readCache, writeCache, dropUserCache } from "./cache"
import { drainQueue, runMutation, subscribeQueueLength } from "./mutation-queue"
import { isOnline, onNetworkChange } from "./network"
import type {
  Exercise, ExerciseLog, MuscleGroup, PR, Routine, SetEntry, Workout,
} from "./types"

type EquipmentDB = Exercise["equipment"]

function rowToExercise(
  r: { id: string; name: string; muscle: string; equipment: string; user_id?: string | null },
  overrides?: Map<string, string>,
): Exercise {
  return {
    id: r.id,
    name: overrides?.get(r.id) ?? r.name,
    muscle: r.muscle as MuscleGroup,
    equipment: r.equipment as EquipmentDB,
    userId: r.user_id ?? null,
  }
}

// ---------------------------------------------------------------------
// per-user exercise name overrides
// ---------------------------------------------------------------------
let overridesCache: { userId: string; map: Map<string, string> } | null = null
const overrideListeners = new Set<() => void>()
let overrideEpoch = 0

function invalidateOverrides() {
  overridesCache = null
  overrideEpoch++
  overrideListeners.forEach((cb) => cb())
}

async function getOverridesMap(userId: string): Promise<Map<string, string>> {
  if (overridesCache?.userId === userId) return overridesCache.map
  const { data, error } = await supabase
    .from("exercise_overrides")
    .select("exercise_id, name")
    .eq("user_id", userId)
  if (error) throw error
  const map = new Map<string, string>(
    (data ?? []).map((r: any) => [r.exercise_id as string, r.name as string]),
  )
  overridesCache = { userId, map }
  return map
}

function useOverrideEpoch() {
  const [, set] = React.useState(overrideEpoch)
  React.useEffect(() => {
    const cb = () => set(overrideEpoch)
    overrideListeners.add(cb)
    return () => { overrideListeners.delete(cb) }
  }, [])
  return overrideEpoch
}

// ---------------------------------------------------------------------
// generic data hook with stale-while-revalidate persistence
//
// Cached fetch results are stored in two tiers:
//   1. In-memory Map → synchronous, zero-flicker on tab switches within a
//      session (the common path).
//   2. IndexedDB → survives app launch, offline reloads, and PWA cold start.
//
// On mount we check the memory cache synchronously; if there's a hit we
// render its data immediately with `loading: false`. If only IDB has it, the
// hydrate completes a tick later and we swap in cached data while the network
// fetch is still in flight. The network result, once it arrives, supersedes
// the cache and writes back to both tiers.
//
// `loading` only ever flips to true on first mount with no cache available.
// Refetches and dep changes keep the prior data visible.
// ---------------------------------------------------------------------
const memCache = new Map<string, unknown>()

// Live subscribers per cache key. When patchCache (or the fetcher's success
// path) writes a new value into memCache, we fan it out to every mounted
// useAsync that's reading the same key, so their React state stays in sync
// with the cache. Without this, optimistic offline mutations would update
// memCache/IDB but the components on screen would keep rendering the prior
// snapshot until the next remount or deps change.
const cacheChangeListeners = new Map<string, Set<() => void>>()

function subscribeCacheChange(key: string, cb: () => void): () => void {
  let set = cacheChangeListeners.get(key)
  if (!set) {
    set = new Set()
    cacheChangeListeners.set(key, set)
  }
  set.add(cb)
  return () => {
    const s = cacheChangeListeners.get(key)
    if (!s) return
    s.delete(cb)
    if (s.size === 0) cacheChangeListeners.delete(key)
  }
}

function notifyCacheChange(key: string) {
  const set = cacheChangeListeners.get(key)
  if (!set) return
  // Copy so a listener that unsubscribes itself doesn't perturb iteration.
  for (const cb of Array.from(set)) cb()
}

export function clearMemoryCache() {
  memCache.clear()
}

// Apply an in-place update to a cached value (both memory + IDB tiers). Used
// by offline-capable mutations to keep the persisted cache consistent with
// the server intent — so that on reload, useActiveWorkout / useRoutines etc.
// see the optimistic state instead of the pre-mutation snapshot.
async function patchCache<T>(
  userId: string | null,
  key: string,
  updater: (prev: T | undefined) => T,
): Promise<T> {
  const inMem = memCache.get(key) as T | undefined
  const prev = inMem !== undefined ? inMem : await readCache<T>(userId, key)
  const next = updater(prev)
  memCache.set(key, next)
  notifyCacheChange(key)
  await writeCache(userId, key, next)
  return next
}

// Global revalidation pulse: every useAsync call listens. Bumping it forces
// all live hooks to re-run their fetcher in the background. We pulse on
// reconnect so the UI catches up to whatever the queue just synced.
let revalidateEpoch = 0
const revalidateListeners = new Set<() => void>()

function pulseRevalidation() {
  revalidateEpoch++
  revalidateListeners.forEach((cb) => cb())
}

if (typeof window !== "undefined") {
  onNetworkChange((online) => {
    if (!online) return
    // Wait for the mutation queue to finish syncing before pulsing — a fixed
    // delay races the drain on slow networks or long queues, and the
    // resulting refetch returns server state from BEFORE the queued writes
    // landed (e.g. a finished workout still missing from history because
    // finishWorkout hadn't been replayed yet). drainQueue dedups concurrent
    // callers via its internal drainPromise, so this cooperates safely with
    // the queue's own onNetworkChange listener that also triggers a drain.
    drainQueue()
      .catch(() => { /* non-network errors are tracked per-entry */ })
      .finally(() => pulseRevalidation())
  })
}

// Module-level mirror of the mutation queue length. Reading it synchronously
// in useAsync lets us skip the network fetch while writes are still draining
// — otherwise a fetcher can race the queue and return a stale "row doesn't
// exist yet" response that overwrites the optimistic cache patch.
let currentQueueLen = 0
if (typeof window !== "undefined") {
  subscribeQueueLength((n) => { currentQueueLen = n })
}

function useRevalidationEpoch() {
  const [, set] = React.useState(revalidateEpoch)
  React.useEffect(() => {
    const cb = () => set(revalidateEpoch)
    revalidateListeners.add(cb)
    return () => { revalidateListeners.delete(cb) }
  }, [])
  return revalidateEpoch
}

type CacheOpts = {
  // Stable key for this hook call. Composed from the hook name + relevant
  // params. Omit to opt out of persistence entirely.
  cacheKey?: string
  // Scopes the persisted entry per-user. Pass the current user id so two
  // accounts on the same device can't read each other's data.
  userId?: string | null
}

function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  initial: T,
  opts?: CacheOpts,
) {
  const cacheKey = opts?.cacheKey
  const userId = opts?.userId ?? null
  const cacheEnabled = !!cacheKey
  const reconnectEpoch = useRevalidationEpoch()

  // Synchronous warm-cache lookup. If we have it in memory, render with it
  // immediately and skip the loading state.
  const memHit = cacheEnabled
    ? (memCache.get(cacheKey!) as T | undefined)
    : undefined

  const [data, setData] = React.useState<T>(
    memHit !== undefined ? memHit : initial,
  )
  const [loading, setLoading] = React.useState(memHit === undefined)
  const [error, setError] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState(0)
  const settledRef = React.useRef(memHit !== undefined)

  React.useEffect(() => {
    let cancelled = false
    let networkSettled = false

    // Kick off IDB hydrate in parallel with the network. If the cached value
    // arrives before the network resolves, surface it so the user sees real
    // data fast — but ignore it once fresh data lands.
    if (cacheEnabled && memHit === undefined) {
      readCache<T>(userId, cacheKey!).then((cached) => {
        if (cancelled || cached === undefined || networkSettled) return
        memCache.set(cacheKey!, cached)
        setData(cached)
        if (!settledRef.current) {
          settledRef.current = true
          setLoading(false)
        }
      }).catch(() => { /* ignore */ })
    }

    // Don't run the fetcher when:
    //  (a) we're offline — the Workbox cache (or a raw fetch error) would
    //      otherwise overwrite optimistic patches; or
    //  (b) we have local data already AND there are queued writes pending —
    //      the server doesn't have them yet, so a fetch would return a
    //      pre-write snapshot (e.g. an offline-finished workout looks like
    //      "not found", `null` overwrites the optimistic Workout, and the
    //      detail sheet gets stuck on its loading state). pulseRevalidation
    //      fires once the queue drains, re-runs this effect, and lets the
    //      fetcher pick up the now-synced server state.
    const queueBlocked = memHit !== undefined && currentQueueLen > 0
    if (!isOnline() || queueBlocked) {
      networkSettled = true
      if (!settledRef.current) {
        if (memHit !== undefined) {
          settledRef.current = true
          setLoading(false)
        } else {
          // No mem hit — IDB hydrate above may still resolve. If it doesn't
          // (no cache at all yet), settle on a short timer so we don't spin
          // forever.
          const t = setTimeout(() => {
            if (cancelled || settledRef.current) return
            settledRef.current = true
            setLoading(false)
          }, 150)
          return () => { cancelled = true; clearTimeout(t) }
        }
      }
      return () => { cancelled = true }
    }

    fetcher()
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError(null)
        if (cacheEnabled) {
          memCache.set(cacheKey!, d)
          writeCache(userId, cacheKey!, d).catch(() => { /* ignore */ })
          // Fan out the fresh value to any other hooks reading the same key
          // (e.g., the home screen and the workout screen both subscribing
          // to "active"). The notifying hook is in the listener set too,
          // but setData with the same reference React-bails-out cheaply.
          notifyCacheChange(cacheKey!)
        }
      })
      .catch((e) => {
        if (cancelled) return
        // Only surface the error if we have nothing to show. Cached data is
        // better than an error banner when the user is briefly offline.
        if (memHit === undefined && !settledRef.current) {
          setError(e?.message ?? String(e))
        }
      })
      .finally(() => {
        if (cancelled) return
        networkSettled = true
        if (!settledRef.current) {
          settledRef.current = true
          setLoading(false)
        }
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, reconnectEpoch])

  // Subscribe to direct memCache writes so optimistic mutations (patchCache)
  // immediately flow into the data state without waiting for a refetch.
  // Runs independently of the fetcher effect so we don't re-subscribe on
  // every deps change unrelated to the cache key.
  React.useEffect(() => {
    if (!cacheEnabled) return
    return subscribeCacheChange(cacheKey!, () => {
      const v = memCache.get(cacheKey!) as T | undefined
      if (v === undefined) return
      setData(v)
      // First-mount fast path: a sync mutation that fires before the network
      // settles should still flip loading off.
      if (!settledRef.current) {
        settledRef.current = true
        setLoading(false)
      }
    })
  }, [cacheEnabled, cacheKey])

  const refetch = React.useCallback(() => setVersion((v) => v + 1), [])
  return { data, loading, error, refetch, setData }
}

// ---------------------------------------------------------------------
// exercises
// ---------------------------------------------------------------------
export function useExercises() {
  const { user } = useAuth()
  const epoch = useOverrideEpoch()
  return useAsync<Exercise[]>(async () => {
    const [{ data, error }, overrides] = await Promise.all([
      supabase
        .from("exercises")
        .select("id, name, muscle, equipment, user_id")
        .order("name"),
      user ? getOverridesMap(user.id) : Promise.resolve(new Map<string, string>()),
    ])
    if (error) throw error
    return (data ?? [])
      .map((r) => rowToExercise(r, overrides))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [user?.id, epoch], [], { cacheKey: "exercises", userId: user?.id ?? null })
}

// ---------------------------------------------------------------------
// routines (with exercises)
// ---------------------------------------------------------------------
export function useRoutines() {
  const { user } = useAuth()
  return useAsync<Routine[]>(async () => {
    if (!user) return []
    const { data, error } = await supabase
      .from("routines")
      .select(`
        id, name, description, schedule, color,
        routine_exercises ( exercise_id, position, target_sets, target_reps )
      `)
      .order("position", { ascending: true })
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      schedule: r.schedule ?? "",
      color: r.color ?? "from-blue-500 to-indigo-500",
      exercises: (r.routine_exercises ?? [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((re: any) => ({
          exerciseId: re.exercise_id,
          sets: re.target_sets,
          targetReps: re.target_reps,
        })),
    }))
  }, [user?.id], [], { cacheKey: "routines", userId: user?.id ?? null })
}

// ---------------------------------------------------------------------
// workouts
// ---------------------------------------------------------------------
const WORKOUT_SELECT = `
  id, title, started_at, ended_at, duration_min, routine_id,
  workout_exercises (
    id, position, notes, exercise_id,
    exercises ( id, name, muscle, equipment ),
    sets ( id, set_number, weight_kg, reps, rest_seconds, done )
  )
`

function rowToWorkout(w: any, overrides?: Map<string, string>): Workout {
  const exercises: ExerciseLog[] = (w.workout_exercises ?? [])
    .sort((a: any, b: any) => a.position - b.position)
    .map((we: any) => ({
      id: we.id,
      notes: we.notes ?? undefined,
      exercise: rowToExercise(we.exercises, overrides),
      sets: (we.sets ?? [])
        .sort((a: any, b: any) => a.set_number - b.set_number)
        .map(
          (s: any): SetEntry => ({
            id: s.id,
            weight: Number(s.weight_kg),
            reps: s.reps,
            rest: s.rest_seconds ?? undefined,
            done: s.done,
          })
        ),
    }))

  return {
    id: w.id,
    title: w.title,
    date: w.started_at,
    durationMin: w.duration_min ?? 0,
    exercises,
    routineId: w.routine_id ?? undefined,
  }
}

export function useRecentWorkouts(limit = 20) {
  const { user } = useAuth()
  const epoch = useOverrideEpoch()
  return useAsync<Workout[]>(async () => {
    if (!user) return []
    const [{ data, error }, overrides] = await Promise.all([
      supabase
        .from("workouts")
        .select(WORKOUT_SELECT)
        .order("started_at", { ascending: false })
        .limit(limit),
      getOverridesMap(user.id),
    ])
    if (error) throw error
    return (data ?? []).map((w) => rowToWorkout(w, overrides))
  }, [user?.id, limit, epoch], [], {
    cacheKey: `recent:${limit}`, userId: user?.id ?? null,
  })
}

export function useWeeklyWorkouts(weekStart: Date) {
  const { user } = useAuth()
  const startIso = weekStart.toISOString()
  const endIso = addDays(weekStart, 7).toISOString()
  const epoch = useOverrideEpoch()
  return useAsync<Workout[]>(async () => {
    if (!user) return []
    const [{ data, error }, overrides] = await Promise.all([
      supabase
        .from("workouts")
        .select(WORKOUT_SELECT)
        .gte("started_at", startIso)
        .lt("started_at", endIso)
        .order("started_at", { ascending: false }),
      getOverridesMap(user.id),
    ])
    if (error) throw error
    return (data ?? []).map((w) => rowToWorkout(w, overrides))
  }, [user?.id, startIso, endIso, epoch], [], {
    cacheKey: `weekly:${startIso}`, userId: user?.id ?? null,
  })
}

export function useMonthWorkoutDates(monthStart: Date) {
  const { user } = useAuth()
  const startIso = monthStart.toISOString()
  const end = new Date(monthStart)
  end.setMonth(end.getMonth() + 1)
  const endIso = end.toISOString()
  return useAsync<string[]>(async () => {
    if (!user) return []
    const { data, error } = await supabase
      .from("workouts")
      .select("started_at, duration_min")
      .gte("started_at", startIso)
      .lt("started_at", endIso)
      .not("duration_min", "is", null)
    if (error) throw error
    return (data ?? []).map((r: any) => r.started_at)
  }, [user?.id, startIso, endIso], [], {
    cacheKey: `monthDates:${startIso}`, userId: user?.id ?? null,
  })
}

export function useActiveWorkout() {
  const { user } = useAuth()
  const epoch = useOverrideEpoch()
  return useAsync<Workout | null>(async () => {
    if (!user) return null
    const [{ data, error }, overrides] = await Promise.all([
      supabase
        .from("workouts")
        .select(WORKOUT_SELECT)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getOverridesMap(user.id),
    ])
    if (error) throw error
    return data ? rowToWorkout(data, overrides) : null
  }, [user?.id, epoch], null, { cacheKey: "active", userId: user?.id ?? null })
}

// ---------------------------------------------------------------------
// personal records
// ---------------------------------------------------------------------
export function usePersonalRecords() {
  const { user } = useAuth()
  const epoch = useOverrideEpoch()
  return useAsync<PR[]>(async () => {
    if (!user) return []
    const [{ data, error }, overrides] = await Promise.all([
      supabase
        .from("personal_records")
        .select("exercise_id, weight_kg, reps, estimated_1rm, achieved_at, exercises(name)")
        .order("achieved_at", { ascending: false }),
      getOverridesMap(user.id),
    ])
    if (error) throw error
    return (data ?? []).map((r: any) => ({
      exerciseId: r.exercise_id,
      exerciseName: overrides.get(r.exercise_id) ?? r.exercises?.name ?? "",
      weight: Number(r.weight_kg),
      reps: r.reps,
      date: r.achieved_at,
      estimated1RM: Math.round(Number(r.estimated_1rm)),
    }))
  }, [user?.id, epoch], [], { cacheKey: "prs", userId: user?.id ?? null })
}

// ---------------------------------------------------------------------
// profile
// ---------------------------------------------------------------------
export type Profile = {
  name: string
  handle: string
  weight: number
  bodyweightChange: number
  goal: string
  joined: string
}

export function useProfile() {
  const { user } = useAuth()
  return useAsync<Profile | null>(async () => {
    if (!user) return null
    const { data, error } = await supabase
      .from("profiles")
      .select("name, handle, bodyweight_kg, goal, joined_at")
      .eq("id", user.id)
      .maybeSingle()
    if (error) throw error
    return {
      name: data?.name ?? user.email?.split("@")[0] ?? "Lifter",
      handle: data?.handle ?? `@${(user.email ?? "user").split("@")[0]}`,
      weight: data?.bodyweight_kg ? Number(data.bodyweight_kg) : 0,
      bodyweightChange: 0,
      goal: data?.goal ?? "Strength",
      joined: data?.joined_at
        ? new Date(data.joined_at).toLocaleDateString(undefined, {
            month: "short", year: "numeric",
          })
        : "",
    }
  }, [user?.id], null, { cacheKey: "profile", userId: user?.id ?? null })
}

// ---------------------------------------------------------------------
// derived stats (computed from workouts)
// ---------------------------------------------------------------------
export type Stats = {
  thisWeek: { workouts: number; sets: number; minutes: number; prCount: number }
  lastWeek: { workouts: number; sets: number; minutes: number; prCount: number }
  streak: number
  totalWorkouts: number
}

export function useStats() {
  const { user } = useAuth()
  return useAsync<Stats>(async () => {
    if (!user) {
      return {
        thisWeek: { workouts: 0, sets: 0, minutes: 0, prCount: 0 },
        lastWeek: { workouts: 0, sets: 0, minutes: 0, prCount: 0 },
        streak: 0,
        totalWorkouts: 0,
      }
    }
    const { count: total } = await supabase
      .from("workouts")
      .select("*", { count: "exact", head: true })
      .not("ended_at", "is", null)

    const thisWeekStart = startOfWeek(new Date())
    const lastWeekStart = addDays(thisWeekStart, -7)

    const { data: recent } = await supabase
      .from("workouts")
      .select(`
        started_at, duration_min, ended_at,
        workout_exercises ( sets ( done ) )
      `)
      .gte("started_at", lastWeekStart.toISOString())
      .not("ended_at", "is", null)

    const thisWeek = { workouts: 0, sets: 0, minutes: 0, prCount: 0 }
    const lastWeek = { workouts: 0, sets: 0, minutes: 0, prCount: 0 }
    for (const w of (recent ?? []) as any[]) {
      const d = new Date(w.started_at)
      const bucket = d >= thisWeekStart ? thisWeek : lastWeek
      bucket.workouts++
      bucket.minutes += w.duration_min ?? 0
      for (const we of w.workout_exercises ?? []) {
        for (const s of we.sets ?? []) {
          if (s.done) bucket.sets++
        }
      }
    }

    const { data: prDates } = await supabase
      .from("personal_records")
      .select("achieved_at")
      .gte("achieved_at", lastWeekStart.toISOString())
    for (const pr of prDates ?? []) {
      if (!pr.achieved_at) continue
      const d = new Date(pr.achieved_at)
      const bucket = d >= thisWeekStart ? thisWeek : lastWeek
      bucket.prCount++
    }

    // streak: count consecutive weeks (back from current) with >= 1 workout
    const { data: allDates } = await supabase
      .from("workouts")
      .select("started_at")
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(200)

    const weekKeys = new Set<string>()
    for (const w of allDates ?? []) {
      weekKeys.add(localDayKey(startOfWeek(new Date(w.started_at))))
    }
    let streak = 0
    let cursor = startOfWeek(new Date())
    while (weekKeys.has(localDayKey(cursor))) {
      streak++
      cursor = addDays(cursor, -7)
    }

    return {
      thisWeek,
      lastWeek,
      streak,
      totalWorkouts: total ?? 0,
    }
  }, [user?.id], {
    thisWeek: { workouts: 0, sets: 0, minutes: 0, prCount: 0 },
    lastWeek: { workouts: 0, sets: 0, minutes: 0, prCount: 0 },
    streak: 0,
    totalWorkouts: 0,
  }, { cacheKey: "stats", userId: user?.id ?? null })
}

// ---------------------------------------------------------------------
// history header aggregate (scales independent of total workout count)
// ---------------------------------------------------------------------
export type HistoryStats = {
  monthCount: number
  avgHoursPerWeek: number
}

export function useHistoryStats() {
  const { user } = useAuth()
  return useAsync<HistoryStats>(async () => {
    if (!user) return { monthCount: 0, avgHoursPerWeek: 0 }

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [monthRes, allRes] = await Promise.all([
      supabase
        .from("workouts")
        .select("*", { count: "exact", head: true })
        .gte("started_at", monthStart.toISOString())
        .not("ended_at", "is", null),
      supabase
        .from("workouts")
        .select("started_at, duration_min")
        .not("ended_at", "is", null)
        .order("started_at", { ascending: true }),
    ])

    const monthCount = monthRes.count ?? 0
    const all = allRes.data ?? []
    let avgHoursPerWeek = 0
    if (all.length > 0) {
      const totalMinutes = all.reduce((a, w) => a + (w.duration_min ?? 0), 0)
      const earliest = new Date(all[0].started_at)
      const weeks = Math.max(1, (Date.now() - earliest.getTime()) / (7 * 86400000))
      avgHoursPerWeek = totalMinutes / weeks / 60
    }

    return { monthCount, avgHoursPerWeek }
  }, [user?.id], { monthCount: 0, avgHoursPerWeek: 0 }, {
    cacheKey: "historyStats", userId: user?.id ?? null,
  })
}

// ---------------------------------------------------------------------
// derived charts
// ---------------------------------------------------------------------
export type DailyStat = { day: string; sets: number }

export function useWeeklyDailyStats() {
  const { user } = useAuth()
  return useAsync<DailyStat[]>(async () => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    const empty: DailyStat[] = days.map((d) => ({ day: d, sets: 0 }))
    if (!user) return empty
    const weekStart = startOfWeek(new Date())
    const { data, error } = await supabase
      .from("workouts")
      .select(`
        started_at,
        workout_exercises ( sets ( done ) )
      `)
      .gte("started_at", weekStart.toISOString())
      .not("ended_at", "is", null)
    if (error) throw error
    const out = empty.map((d) => ({ ...d }))
    for (const w of (data ?? []) as any[]) {
      const idx = (new Date(w.started_at).getDay() + 6) % 7
      for (const we of w.workout_exercises ?? []) {
        for (const s of we.sets ?? []) {
          if (!s.done) continue
          out[idx].sets += 1
        }
      }
    }
    return out
  }, [user?.id], [], { cacheKey: "weeklyDaily", userId: user?.id ?? null })
}

// ---------------------------------------------------------------------
// exercises with training history (for progress picker)
// ---------------------------------------------------------------------
export type TrainedExercise = {
  id: string
  name: string
  muscle: MuscleGroup
  sessionCount: number
  lastTrained: string
}

export function useTrainedExercises() {
  const { user } = useAuth()
  const epoch = useOverrideEpoch()
  return useAsync<TrainedExercise[]>(async () => {
    if (!user) return []
    const [{ data, error }, overrides] = await Promise.all([
      supabase
        .from("workout_exercises")
        .select(`
          exercise_id,
          workout_id,
          exercises ( id, name, muscle ),
          workouts!inner ( started_at, ended_at ),
          sets ( done )
        `)
        .not("workouts.ended_at", "is", null),
      getOverridesMap(user.id),
    ])
    if (error) throw error

    const grouped = new Map<string, {
      name: string
      muscle: MuscleGroup
      workoutIds: Set<string>
      lastTrained: string
    }>()

    for (const we of (data ?? []) as any[]) {
      const hasDone = (we.sets ?? []).some((s: any) => s.done)
      if (!hasDone) continue
      const ex = we.exercises
      if (!ex) continue
      const cur = grouped.get(ex.id) ?? {
        name: overrides.get(ex.id) ?? ex.name,
        muscle: ex.muscle as MuscleGroup,
        workoutIds: new Set<string>(),
        lastTrained: "",
      }
      cur.workoutIds.add(we.workout_id)
      const startedAt = we.workouts?.started_at as string | undefined
      if (startedAt && startedAt > cur.lastTrained) cur.lastTrained = startedAt
      grouped.set(ex.id, cur)
    }

    return Array.from(grouped.entries())
      .map(([id, v]) => ({
        id,
        name: v.name,
        muscle: v.muscle,
        sessionCount: v.workoutIds.size,
        lastTrained: v.lastTrained,
      }))
      .sort((a, b) => (b.lastTrained > a.lastTrained ? 1 : -1))
  }, [user?.id, epoch], [], { cacheKey: "trained", userId: user?.id ?? null })
}

// ---------------------------------------------------------------------
// per-exercise progression (one row per session)
// ---------------------------------------------------------------------
export type ProgressPoint = {
  workoutId: string
  date: string
  topWeight: number
  topReps: number
  est1RM: number
  totalSets: number
}

function estimated1RM(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  // Brzycki — more conservative than Epley for low-to-mid reps.
  if (reps <= 10) return (weight * 36) / (37 - reps)
  // Above 10 reps, Brzycki's denominator drives the estimate too high; fall
  // back to Epley which is more conservative in that range.
  return weight * (1 + reps / 30)
}

export function useExerciseProgress(exerciseId: string | null) {
  const { user } = useAuth()
  return useAsync<ProgressPoint[]>(async () => {
    if (!user || !exerciseId) return []
    const { data, error } = await supabase
      .from("workout_exercises")
      .select(`
        id,
        workouts!inner ( id, started_at, ended_at ),
        sets ( weight_kg, reps, done )
      `)
      .eq("exercise_id", exerciseId)
      .not("workouts.ended_at", "is", null)
    if (error) throw error

    const points: ProgressPoint[] = []
    for (const we of (data ?? []) as any[]) {
      const startedAt = we.workouts?.started_at as string | undefined
      const workoutId = we.workouts?.id as string | undefined
      if (!startedAt || !workoutId) continue
      let topWeight = 0
      let topReps = 0
      let topEst = 0
      let totalSets = 0
      for (const s of we.sets ?? []) {
        if (!s.done) continue
        const w = Number(s.weight_kg)
        const r = s.reps
        if (w <= 0 || r <= 0) continue
        totalSets += 1
        // Top set = heaviest weight, tie-break by reps.
        if (w > topWeight || (w === topWeight && r > topReps)) {
          topWeight = w
          topReps = r
        }
        // Est. 1RM = best estimated 1RM across any set in this session.
        const est = estimated1RM(w, r)
        if (est > topEst) topEst = est
      }
      if (totalSets === 0) continue
      points.push({
        workoutId,
        date: startedAt,
        topWeight,
        topReps,
        est1RM: Math.round(topEst),
        totalSets,
      })
    }
    points.sort((a, b) => (a.date > b.date ? 1 : -1))
    return points
  }, [user?.id, exerciseId], [], {
    cacheKey: `progress:${exerciseId ?? "_"}`, userId: user?.id ?? null,
  })
}

// ---------------------------------------------------------------------
// weekly muscle-group breakdown (sets per muscle)
// ---------------------------------------------------------------------
export type MuscleBreakdownRow = {
  muscle: MuscleGroup
  sets: number
}

export function useWeeklyMuscleBreakdown() {
  const { user } = useAuth()
  return useAsync<{ rows: MuscleBreakdownRow[]; totalSets: number }>(async () => {
    const empty = { rows: [], totalSets: 0 }
    if (!user) return empty
    const weekStart = startOfWeek(new Date())
    const { data, error } = await supabase
      .from("workouts")
      .select(`
        id,
        workout_exercises (
          exercises ( muscle ),
          sets ( done )
        )
      `)
      .gte("started_at", weekStart.toISOString())
      .not("ended_at", "is", null)
    if (error) throw error

    const byMuscle = new Map<MuscleGroup, number>()
    let totalSets = 0
    for (const w of (data ?? []) as any[]) {
      for (const we of w.workout_exercises ?? []) {
        const muscle = we.exercises?.muscle as MuscleGroup | undefined
        if (!muscle) continue
        for (const s of we.sets ?? []) {
          if (!s.done) continue
          byMuscle.set(muscle, (byMuscle.get(muscle) ?? 0) + 1)
          totalSets += 1
        }
      }
    }
    const rows: MuscleBreakdownRow[] = Array.from(byMuscle.entries())
      .map(([muscle, sets]) => ({ muscle, sets }))
      .sort((a, b) => b.sets - a.sets)
    return { rows, totalSets }
  }, [user?.id], { rows: [], totalSets: 0 }, {
    cacheKey: "weeklyMuscle", userId: user?.id ?? null,
  })
}

// ---------------------------------------------------------------------
// trends (period-filtered analytical data)
// ---------------------------------------------------------------------
export type TrendsPeriod = "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL"

export type TrendsWeek = {
  weekStart: string
  label: string
  tooltipLabel: string
  sets: number
  sessions: number
  minutes: number
  byMuscle: Partial<Record<MuscleGroup, number>>
}

export type TrendsMuscleRow = {
  muscle: MuscleGroup
  avgSetsPerWeek: number
  totalSets: number
}

export type TrendsData = {
  summary: {
    sessions: number
    sets: number
    prCount: number
    totalMinutes: number
    avgSessionMinutes: number
    avgSessionsPerWeek: number
    weeksInPeriod: number
  }
  weekly: TrendsWeek[]
  muscleAvg: TrendsMuscleRow[]
  topMuscles: MuscleGroup[]
  prs: PR[]
  bucket: "day" | "week" | "month"
}

function periodStart(period: TrendsPeriod, earliest: Date | null): Date {
  const now = new Date()
  const d = new Date(now)
  switch (period) {
    case "1W": return startOfWeek(now)
    case "1M": d.setMonth(d.getMonth() - 1); break
    case "3M": d.setMonth(d.getMonth() - 3); break
    case "6M": d.setMonth(d.getMonth() - 6); break
    case "YTD": d.setMonth(0); d.setDate(1); break
    case "1Y": d.setFullYear(d.getFullYear() - 1); break
    case "ALL": {
      if (earliest) return earliest
      d.setMonth(d.getMonth() - 3)
      break
    }
  }
  d.setHours(0, 0, 0, 0)
  return d
}

export function useTrends(period: TrendsPeriod) {
  const { user } = useAuth()
  return useAsync<TrendsData>(async () => {
    const empty: TrendsData = {
      summary: { sessions: 0, sets: 0, prCount: 0, totalMinutes: 0, avgSessionMinutes: 0, avgSessionsPerWeek: 0, weeksInPeriod: 0 },
      weekly: [],
      muscleAvg: [],
      topMuscles: [],
      prs: [],
      bucket: "week",
    }
    if (!user) return empty

    let earliestWorkout: Date | null = null
    if (period === "ALL") {
      const { data: earliest } = await supabase
        .from("workouts")
        .select("started_at")
        .not("ended_at", "is", null)
        .order("started_at", { ascending: true })
        .limit(1)
      earliestWorkout = earliest?.[0] ? new Date(earliest[0].started_at) : null
    }
    const startDate = periodStart(period, earliestWorkout)

    const { data: workouts, error: wErr } = await supabase
      .from("workouts")
      .select(`
        id, started_at, duration_min,
        workout_exercises (
          exercises ( muscle ),
          sets ( done )
        )
      `)
      .gte("started_at", startDate.toISOString())
      .not("ended_at", "is", null)
      .order("started_at", { ascending: true })
      .limit(2000)
    if (wErr) throw wErr

    const { data: prData, error: pErr } = await supabase
      .from("personal_records")
      .select("exercise_id, weight_kg, reps, estimated_1rm, achieved_at, exercises(name)")
      .gte("achieved_at", startDate.toISOString())
      .order("achieved_at", { ascending: false })
    if (pErr) throw pErr

    const byMuscle = new Map<MuscleGroup, number>()
    let totalSets = 0
    let totalSessions = 0
    let totalMinutes = 0

    const weekStartFirst = startOfWeek(startDate)
    const weekStartNow = startOfWeek(new Date())
    let weekCount = 0
    const wc = new Date(weekStartFirst)
    while (wc <= weekStartNow) {
      weekCount++
      wc.setDate(wc.getDate() + 7)
    }
    const useDaily = period === "1W"
    const useMonthly = !useDaily && weekCount > 26

    type Bucket = {
      sets: number
      sessions: number
      minutes: number
      start: Date
      label: string
      byMuscle: Map<MuscleGroup, number>
    }
    const buckets = new Map<string, Bucket>()

    const makeKey = (d: Date) => {
      if (useDaily) return localDayKey(startOfDay(d))
      return useMonthly ? localMonthKey(startOfMonth(d))
                        : localDayKey(startOfWeek(d))
    }
    const makeLabel = (d: Date) => {
      if (useDaily) return d.toLocaleDateString(undefined, { weekday: "short" })
      return useMonthly
        ? d.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
        : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    }
    const makeStart = (d: Date) => {
      if (useDaily) return startOfDay(d)
      return useMonthly ? startOfMonth(d) : startOfWeek(d)
    }

    const cursor = makeStart(startDate)
    const end = useDaily
      ? (() => { const s = new Date(weekStartNow); s.setDate(s.getDate() + 6); return s })()
      : useMonthly ? startOfMonth(new Date()) : weekStartNow
    while (cursor <= end) {
      const key = makeKey(cursor)
      buckets.set(key, {
        sets: 0,
        sessions: 0,
        minutes: 0,
        start: new Date(cursor),
        label: makeLabel(cursor),
        byMuscle: new Map(),
      })
      if (useDaily) cursor.setDate(cursor.getDate() + 1)
      else if (useMonthly) cursor.setMonth(cursor.getMonth() + 1)
      else cursor.setDate(cursor.getDate() + 7)
    }

    for (const w of (workouts ?? []) as any[]) {
      const d = new Date(w.started_at)
      const key = makeKey(d)
      const b = buckets.get(key)
      totalSessions += 1
      const mins = w.duration_min ?? 0
      totalMinutes += mins
      if (b) { b.sessions += 1; b.minutes += mins }
      for (const we of w.workout_exercises ?? []) {
        const muscle = we.exercises?.muscle as MuscleGroup | undefined
        for (const s of we.sets ?? []) {
          if (!s.done) continue
          totalSets += 1
          if (b) b.sets += 1
          if (muscle) {
            byMuscle.set(muscle, (byMuscle.get(muscle) ?? 0) + 1)
            if (b) b.byMuscle.set(muscle, (b.byMuscle.get(muscle) ?? 0) + 1)
          }
        }
      }
    }

    const weekly: TrendsWeek[] = Array.from(buckets.values())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((b) => {
        let tooltipLabel: string
        if (useDaily) {
          tooltipLabel = b.start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
        } else if (useMonthly) {
          tooltipLabel = b.start.toLocaleDateString(undefined, { month: "long", year: "numeric" })
        } else {
          const endOfWeek = new Date(b.start)
          endOfWeek.setDate(endOfWeek.getDate() + 6)
          tooltipLabel = `${b.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${endOfWeek.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        }
        return {
          weekStart: b.start.toISOString(),
          label: b.label,
          tooltipLabel,
          sets: b.sets,
          sessions: b.sessions,
          minutes: b.minutes,
          byMuscle: Object.fromEntries(b.byMuscle) as Partial<Record<MuscleGroup, number>>,
        }
      })

    if (!useMonthly && !useDaily) {
      if (weekly.length >= 1) weekly[weekly.length - 1].label = "This wk"
      if (weekly.length >= 2) weekly[weekly.length - 2].label = "Last wk"
    }

    const weeksInPeriod = Math.max(1, weekCount)
    const avgSessionsPerWeek = totalSessions / weeksInPeriod
    const avgSessionMinutes = totalSessions > 0 ? totalMinutes / totalSessions : 0

    const muscleAvg: TrendsMuscleRow[] = Array.from(byMuscle.entries())
      .map(([muscle, sets]) => ({
        muscle,
        avgSetsPerWeek: sets / weeksInPeriod,
        totalSets: sets,
      }))
      .sort((a, b) => b.avgSetsPerWeek - a.avgSetsPerWeek)

    const topMuscles = muscleAvg.slice(0, 6).map((m) => m.muscle)

    const prs: PR[] = (prData ?? []).map((r: any) => ({
      exerciseId: r.exercise_id,
      exerciseName: r.exercises?.name ?? "",
      weight: Number(r.weight_kg),
      reps: r.reps,
      date: r.achieved_at,
      estimated1RM: Math.round(Number(r.estimated_1rm)),
    }))

    return {
      summary: {
        sessions: totalSessions,
        sets: totalSets,
        prCount: prs.length,
        totalMinutes,
        avgSessionMinutes,
        avgSessionsPerWeek,
        weeksInPeriod,
      },
      weekly,
      muscleAvg,
      topMuscles,
      prs,
      bucket: useDaily ? "day" : useMonthly ? "month" : "week",
    }
  }, [user?.id, period], {
    summary: { sessions: 0, sets: 0, prCount: 0, totalMinutes: 0, avgSessionMinutes: 0, avgSessionsPerWeek: 0, weeksInPeriod: 0 },
    weekly: [],
    muscleAvg: [],
    topMuscles: [],
    prs: [],
    bucket: "week",
  }, { cacheKey: `trends:${period}`, userId: user?.id ?? null })
}

// ---------------------------------------------------------------------
// mutations
//
// Each mutation that needs to work offline routes through runMutation, which
// either calls Supabase directly (online) or persists the payload to the
// mutation queue for replay on reconnect (offline / network error). Inserts
// generate their own UUIDs so optimistic UI state and the eventual server
// row share a single, stable id.
// ---------------------------------------------------------------------
// --------------------------------------------------------------------------
// Helpers that mutate the "active" workout cache. The cache key is shared
// across users on the device but cleared on sign-out / user switch, so we
// don't bother passing the user id at the call site — callers retrieve it
// from auth context as needed and pass it through patchCache.
// --------------------------------------------------------------------------
function patchActiveWorkout(
  userId: string | null,
  patch: (w: Workout) => Workout | null,
) {
  return patchCache<Workout | null>(userId, "active", (prev) => {
    if (!prev) return prev ?? null
    return patch(prev)
  })
}

function patchSetInActive(
  userId: string | null,
  setId: string,
  patch: (s: SetEntry) => SetEntry,
) {
  return patchActiveWorkout(userId, (w) => ({
    ...w,
    exercises: w.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => (s.id === setId ? patch(s) : s)),
    })),
  }))
}

// Best-effort: many mutation entry points don't have direct access to the
// current user id without going through useAuth (which is a React hook). For
// helpers called from non-hook code, we extract the user from the session
// the supabase client already holds, so the cache patch lands under the
// correct namespace even when the call site doesn't pass it explicitly.
async function activeUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export async function toggleSetDone(setId: string, done: boolean) {
  const userId = await activeUserId()
  await patchSetInActive(userId, setId, (s) => ({ ...s, done }))
  await runMutation("toggleSetDone", { setId, done })
}

export async function addSet(
  workoutExerciseId: string,
  prev: { weight: number; reps: number; rest?: number } | null,
  setNumber: number,
): Promise<SetEntry> {
  const id = crypto.randomUUID()
  const weight = prev?.weight ?? 0
  const reps = prev?.reps ?? 8
  const rest = prev?.rest ?? null
  const userId = await activeUserId()
  const newSet: SetEntry = {
    id, weight, reps, rest: rest ?? undefined, done: false,
  }
  await patchActiveWorkout(userId, (w) => ({
    ...w,
    exercises: w.exercises.map((e) =>
      e.id === workoutExerciseId ? { ...e, sets: [...e.sets, newSet] } : e,
    ),
  }))
  await runMutation("addSet", {
    id, workoutExerciseId, setNumber, weight, reps, rest,
  })
  return newSet
}

export async function finishWorkout(workoutId: string, durationMin: number) {
  const userId = await activeUserId()

  // Snapshot the active workout's full state BEFORE we clear "active". We
  // need its exercises/sets to populate the weekly + recent caches so the
  // finished session shows up in History (filters by durationMin > 0) the
  // moment we tap "Finish" — without waiting for a server refetch that
  // (a) doesn't run while offline and (b) can race the queue drain on
  // reconnect, returning a pre-finish snapshot that overwrites the patch.
  const activeBefore =
    (memCache.get("active") as Workout | null | undefined) ??
    (await readCache<Workout | null>(userId, "active")) ??
    null

  await patchCache<Workout | null>(userId, "active", (prev) =>
    prev?.id === workoutId ? null : prev ?? null,
  )

  if (activeBefore && activeBefore.id === workoutId) {
    const finished: Workout = { ...activeBefore, durationMin }
    const weekStartIso = startOfWeek(new Date(activeBefore.date)).toISOString()

    await patchCache<Workout[]>(userId, `weekly:${weekStartIso}`, (prev) => {
      const list = prev ?? []
      const idx = list.findIndex((w) => w.id === workoutId)
      if (idx >= 0) {
        const copy = list.slice()
        copy[idx] = finished
        return copy
      }
      return [finished, ...list]
    })

    await patchCache<Workout[]>(userId, "recent:20", (prev) => {
      const list = prev ?? []
      const idx = list.findIndex((w) => w.id === workoutId)
      if (idx >= 0) {
        const copy = list.slice()
        copy[idx] = finished
        return copy
      }
      return [finished, ...list].slice(0, 20)
    })

    // Populate the by-id cache that WorkoutDetailSheet reads from. Without
    // this, tapping the workout in History mounts useWorkout(id) with no
    // memHit, the fetcher returns null (server hasn't gotten the queued
    // finish row yet, or we're offline), and the sheet renders its
    // loading-or-empty placeholder forever.
    await patchCache<Workout | null>(
      userId,
      `workout:${workoutId}`,
      () => finished,
    )
  }

  await runMutation("finishWorkout", {
    workoutId,
    durationMin,
    endedAt: new Date().toISOString(),
  })
}

export async function startEmptyWorkout(userId: string, title = "Quick session") {
  // Guard against creating a second active workout while one is already
  // in flight (online or queued). Reading from cache is cheap and matches
  // the server's UNIQUE(user_id) WHERE ended_at IS NULL constraint.
  const existingActive = (memCache.get("active") as Workout | null | undefined)
    ?? await readCache<Workout | null>(userId, "active")
  if (existingActive) {
    throw new Error("You already have an active workout. Finish or discard it first.")
  }

  const id = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  const synthetic: Workout = {
    id,
    title,
    date: startedAt,
    durationMin: 0,
    exercises: [],
  }
  await patchCache<Workout | null>(userId, "active", () => synthetic)
  await runMutation("startEmptyWorkout", { id, userId, title, startedAt })
  return id
}

export async function startWorkoutFromRoutine(routineId: string, userId: string) {
  const existingActive = (memCache.get("active") as Workout | null | undefined)
    ?? await readCache<Workout | null>(userId, "active")
  if (existingActive) {
    throw new Error("You already have an active workout. Finish or discard it first.")
  }

  // Read routine + exercise metadata from the cache. We need exercise objects
  // (name, muscle, equipment) to render the synthetic active workout the
  // user sees while offline — these come from the "exercises" cache rather
  // than another network round-trip.
  const routines = (memCache.get("routines") as Routine[] | undefined)
    ?? await readCache<Routine[]>(userId, "routines")
    ?? []
  const routine = routines.find((r) => r.id === routineId)
  if (!routine) {
    throw new Error("Routine not found locally. Open the app while online to sync first.")
  }
  const exercises = (memCache.get("exercises") as Exercise[] | undefined)
    ?? await readCache<Exercise[]>(userId, "exercises")
    ?? []
  const exerciseById = new Map(exercises.map((e) => [e.id, e]))

  // Prefill from last session, baked into the payload so replay is
  // deterministic. getLastByExercise hits the server when online (and
  // refreshes the cache) but falls back to whatever's already cached when
  // offline — so a routine started offline still gets sensible weight/reps
  // values as long as the user has trained those exercises before with the
  // app online.
  const workoutId = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  const lastByExercise = await getLastByExercise(
    userId,
    routine.exercises.map((re) => re.exerciseId),
    workoutId,
  )

  type WeRow = {
    workoutExerciseId: string
    exerciseId: string
    position: number
    sets: Array<{
      id: string
      setNumber: number
      weight: number
      reps: number
      rest: number | null
    }>
  }
  const weRows: WeRow[] = routine.exercises.map((re, i) => {
    const workoutExerciseId = crypto.randomUUID()
    const last = lastByExercise.get(re.exerciseId)
    const sets = Array.from({ length: re.sets }, (_, j) => {
      const setNumber = j + 1
      const prefill = pickPrefillFor(setNumber, last)
      return {
        id: crypto.randomUUID(),
        setNumber,
        weight: prefill.weight,
        reps: prefill.reps,
        rest: prefill.rest,
      }
    })
    return { workoutExerciseId, exerciseId: re.exerciseId, position: i + 1, sets }
  })

  const syntheticExercises: ExerciseLog[] = weRows.map((we) => {
    const ex = exerciseById.get(we.exerciseId) ?? {
      id: we.exerciseId,
      name: "Exercise",
      muscle: "Full Body" as MuscleGroup,
      equipment: "Barbell" as Exercise["equipment"],
      userId: null,
    }
    return {
      id: we.workoutExerciseId,
      exercise: ex,
      sets: we.sets.map((s) => ({
        id: s.id,
        weight: s.weight,
        reps: s.reps,
        rest: s.rest ?? undefined,
        done: false,
      })),
    }
  })
  const synthetic: Workout = {
    id: workoutId,
    title: routine.name,
    date: startedAt,
    durationMin: 0,
    exercises: syntheticExercises,
    routineId,
  }
  await patchCache<Workout | null>(userId, "active", () => synthetic)
  await runMutation("startWorkoutFromRoutine", {
    workoutId,
    userId,
    routineId,
    title: routine.name,
    startedAt,
    workoutExercises: weRows,
  })
  return workoutId
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function clearMyData(userId: string) {
  // Order doesn't matter for correctness — each row is deleted by user_id and
  // FK cascades clean up dependents (workout_exercises/sets, routine_exercises).
  // Profile row is intentionally preserved.
  const tables: Array<"workouts" | "routines" | "exercises" | "exercise_overrides"> = [
    "workouts", "routines", "exercises", "exercise_overrides",
  ]
  for (const t of tables) {
    const { error } = await supabase.from(t).delete().eq("user_id", userId)
    if (error) throw error
  }
  // Wipe local mirror so the cached lists/active workout don't briefly
  // reappear on the next launch before revalidation kicks in.
  clearMemoryCache()
  await dropUserCache(userId)
  invalidateOverrides()
}

// ---------------------------------------------------------------------
// set mutations
// ---------------------------------------------------------------------
export async function updateSet(
  setId: string,
  patch: {
    weight?: number
    reps?: number
    rest?: number | null
  }
) {
  const dbPatch: {
    weight_kg?: number
    reps?: number
    rest_seconds?: number | null
  } = {}
  if (patch.weight !== undefined) dbPatch.weight_kg = patch.weight
  if (patch.reps !== undefined) dbPatch.reps = patch.reps
  if (patch.rest !== undefined) dbPatch.rest_seconds = patch.rest

  const userId = await activeUserId()
  await patchSetInActive(userId, setId, (s) => ({
    ...s,
    weight: patch.weight ?? s.weight,
    reps: patch.reps ?? s.reps,
    rest: patch.rest === undefined ? s.rest : (patch.rest ?? undefined),
  }))
  await runMutation("updateSet", { setId, patch: dbPatch })
}

export async function deleteSet(setId: string) {
  const userId = await activeUserId()
  await patchActiveWorkout(userId, (w) => ({
    ...w,
    exercises: w.exercises.map((e) => ({
      ...e,
      sets: e.sets.filter((s) => s.id !== setId),
    })),
  }))
  await runMutation("deleteSet", { setId })
}

// ---------------------------------------------------------------------
// workout-exercise mutations
// ---------------------------------------------------------------------
export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
  position: number,
): Promise<{ workoutExerciseId: string; initialSet: SetEntry }> {
  const workoutExerciseId = crypto.randomUUID()
  const initialSetId = crypto.randomUUID()

  const userId = await activeUserId()
  // Prefill via the cached wrapper: server-fresh when online, falls back to
  // cached last-session values when offline. Empty map → zero prefill.
  const lastByExercise = await getLastByExercise(userId, [exerciseId], workoutId)
  const prefill = pickPrefillFor(1, lastByExercise.get(exerciseId))
  const exercises = (memCache.get("exercises") as Exercise[] | undefined)
    ?? await readCache<Exercise[]>(userId, "exercises")
    ?? []
  const exercise = exercises.find((e) => e.id === exerciseId) ?? {
    id: exerciseId,
    name: "Exercise",
    muscle: "Full Body" as MuscleGroup,
    equipment: "Barbell" as Exercise["equipment"],
    userId: null,
  }
  const initialSet: SetEntry = {
    id: initialSetId,
    weight: prefill.weight,
    reps: prefill.reps,
    rest: prefill.rest ?? undefined,
    done: false,
  }
  await patchActiveWorkout(userId, (w) =>
    w.id === workoutId
      ? {
          ...w,
          exercises: [
            ...w.exercises,
            { id: workoutExerciseId, exercise, sets: [initialSet] },
          ],
        }
      : w,
  )

  await runMutation("addExerciseToWorkout", {
    workoutId,
    workoutExerciseId,
    exerciseId,
    position,
    initialSetId,
    initialWeight: prefill.weight,
    initialReps: prefill.reps,
    initialRest: prefill.rest,
  })
  return { workoutExerciseId, initialSet }
}

export async function removeExerciseFromWorkout(workoutExerciseId: string) {
  const userId = await activeUserId()
  await patchActiveWorkout(userId, (w) => ({
    ...w,
    exercises: w.exercises.filter((e) => e.id !== workoutExerciseId),
  }))
  await runMutation("removeExerciseFromWorkout", { workoutExerciseId })
}

export async function discardWorkout(workoutId: string) {
  const userId = await activeUserId()
  await patchCache<Workout | null>(userId, "active", (prev) =>
    prev?.id === workoutId ? null : prev ?? null,
  )
  await runMutation("discardWorkout", { workoutId })
}

export async function updateWorkoutTitle(workoutId: string, title: string) {
  const trimmed = title.trim()
  if (!trimmed) throw new Error("Title required")
  const userId = await activeUserId()
  await patchActiveWorkout(userId, (w) =>
    w.id === workoutId ? { ...w, title: trimmed } : w,
  )
  await runMutation("updateWorkoutTitle", { workoutId, title: trimmed })
}

// ---------------------------------------------------------------------
// exercise mutations
// ---------------------------------------------------------------------
export async function createExercise(
  userId: string,
  draft: { name: string; muscle: MuscleGroup; equipment: Exercise["equipment"] }
): Promise<Exercise> {
  const id = crypto.randomUUID()
  const name = draft.name.trim()
  const exercise: Exercise = {
    id, name, muscle: draft.muscle, equipment: draft.equipment, userId,
  }
  // Optimistically insert into the exercises cache so it appears in the
  // picker / list immediately, even while offline.
  await patchCache<Exercise[]>(userId, "exercises", (prev) => {
    const list = prev ?? []
    return [...list, exercise].sort((a, b) => a.name.localeCompare(b.name))
  })
  await runMutation("createExercise", {
    id, userId, name, muscle: draft.muscle, equipment: draft.equipment,
  })
  return exercise
}

export async function deleteExercise(exerciseId: string) {
  const userId = await activeUserId()
  await patchCache<Exercise[]>(userId, "exercises", (prev) =>
    (prev ?? []).filter((e) => e.id !== exerciseId),
  )
  await runMutation("deleteExercise", { exerciseId })
}

export async function renameExercise(
  exercise: { id: string; userId: string | null },
  userId: string,
  name: string,
) {
  const trimmed = name.trim()
  if (exercise.userId === null) {
    // Stock exercise — name override lives in a separate table. Update the
    // in-memory override map so the new name shows up immediately, even
    // before the queue drains. invalidateOverrides() below clears the cache
    // but the writeCache call from patchCache replaces it.
    if (overridesCache?.userId === userId) {
      overridesCache.map.set(exercise.id, trimmed)
    }
    // Also reflect in the exercises cache so list rendering picks it up.
    await patchCache<Exercise[]>(userId, "exercises", (prev) =>
      (prev ?? []).map((e) => e.id === exercise.id ? { ...e, name: trimmed } : e),
    )
    await runMutation("renameExerciseOverride", {
      userId,
      exerciseId: exercise.id,
      name: trimmed,
    })
  } else {
    await patchCache<Exercise[]>(userId, "exercises", (prev) =>
      (prev ?? []).map((e) => e.id === exercise.id ? { ...e, name: trimmed } : e),
    )
    await runMutation("renameExerciseOwn", {
      exerciseId: exercise.id,
      name: trimmed,
    })
  }
  invalidateOverrides()
}

// ---------------------------------------------------------------------
// routine mutations
// ---------------------------------------------------------------------
export type RoutineDraft = {
  name: string
  description?: string
  schedule?: string
  color: string
  exercises: { exerciseId: string; sets: number; targetReps: string }[]
}

export async function createRoutine(userId: string, draft: RoutineDraft) {
  const id = crypto.randomUUID()
  // Derive position from the locally cached routines list so we don't need a
  // server round-trip — when the queue drains, the executor inserts with
  // this exact position. The server's UNIQUE(user_id, position) constraint
  // is honored as long as no other client is concurrently creating routines.
  const cached = (memCache.get("routines") as Routine[] | undefined)
    ?? await readCache<Routine[]>(userId, "routines")
    ?? []
  const position = cached.length + 1

  const newRoutine: Routine = {
    id,
    name: draft.name,
    description: draft.description ?? "",
    schedule: draft.schedule ?? "",
    color: draft.color,
    exercises: draft.exercises.map((re) => ({
      exerciseId: re.exerciseId,
      sets: re.sets,
      targetReps: re.targetReps,
    })),
  }
  await patchCache<Routine[]>(userId, "routines", (prev) => [...(prev ?? []), newRoutine])

  await runMutation("createRoutine", {
    id,
    userId,
    name: draft.name,
    description: draft.description ?? null,
    schedule: draft.schedule ?? null,
    color: draft.color,
    position,
    exercises: draft.exercises.map((re, i) => ({
      routine_id: id,
      exercise_id: re.exerciseId,
      position: i + 1,
      target_sets: re.sets,
      target_reps: re.targetReps,
    })),
  })
  return id
}

export async function updateRoutine(routineId: string, draft: RoutineDraft) {
  const userId = await activeUserId()
  await patchCache<Routine[]>(userId, "routines", (prev) =>
    (prev ?? []).map((r) =>
      r.id === routineId
        ? {
            ...r,
            name: draft.name,
            description: draft.description ?? "",
            schedule: draft.schedule ?? "",
            color: draft.color,
            exercises: draft.exercises.map((re) => ({
              exerciseId: re.exerciseId,
              sets: re.sets,
              targetReps: re.targetReps,
            })),
          }
        : r,
    ),
  )
  await runMutation("updateRoutine", {
    routineId,
    name: draft.name,
    // Supabase's RPC type-gen flags function args as non-nullable even when
    // the Postgres parameter accepts NULL. Empty string is equivalent.
    description: draft.description ?? "",
    schedule: draft.schedule ?? "",
    color: draft.color,
    exercises: draft.exercises.map((re, i) => ({
      exercise_id: re.exerciseId,
      position: i + 1,
      target_sets: re.sets,
      target_reps: re.targetReps,
    })),
  })
}

export async function deleteRoutine(routineId: string) {
  const userId = await activeUserId()
  await patchCache<Routine[]>(userId, "routines", (prev) =>
    (prev ?? []).filter((r) => r.id !== routineId),
  )
  await runMutation("deleteRoutine", { routineId })
}

export async function reorderRoutines(orderedIds: string[]) {
  const userId = await activeUserId()
  await patchCache<Routine[]>(userId, "routines", (prev) => {
    if (!prev) return []
    const byId = new Map(prev.map((r) => [r.id, r]))
    const reordered: Routine[] = []
    for (const id of orderedIds) {
      const r = byId.get(id)
      if (r) reordered.push(r)
    }
    // Append any routines not in orderedIds (shouldn't happen, but defensive).
    for (const r of prev) {
      if (!orderedIds.includes(r.id)) reordered.push(r)
    }
    return reordered
  })
  await runMutation("reorderRoutines", { orderedIds })
}

// ---------------------------------------------------------------------
// profile mutations
// ---------------------------------------------------------------------
export async function updateProfile(
  userId: string,
  patch: { name?: string; handle?: string; bodyweight_kg?: number | null; goal?: string }
) {
  await runMutation("updateProfile", { userId, patch })
}

// ---------------------------------------------------------------------
// last-session lookup (prefill new sets with last session's values)
// ---------------------------------------------------------------------
type LastSessionSet = {
  set_number: number
  weight_kg: number
  reps: number
  rest_seconds: number | null
}

// Cache wrapper around the raw server-side prefill query. On success we
// merge the fresh result into a per-user `"prefill"` cache entry so that
// future offline starts have something to prefill with; on failure (no
// network) we fall back to whatever subset of the requested exercises is
// already cached. The cache is a plain Record (JSON-friendly for IDB).
async function getLastByExercise(
  userId: string | null,
  exerciseIds: string[],
  excludeWorkoutId: string | null,
): Promise<Map<string, LastSessionSet[]>> {
  if (exerciseIds.length === 0) return new Map()
  const cacheKey = "prefill"
  try {
    const fresh = await fetchLastSessionSetsByExercise(exerciseIds, excludeWorkoutId)
    const prior =
      (memCache.get(cacheKey) as Record<string, LastSessionSet[]> | undefined)
      ?? (await readCache<Record<string, LastSessionSet[]>>(userId, cacheKey))
      ?? {}
    const merged = { ...prior }
    for (const [k, v] of fresh) merged[k] = v
    memCache.set(cacheKey, merged)
    writeCache(userId, cacheKey, merged).catch(() => { /* ignore */ })
    return fresh
  } catch {
    const cached =
      (memCache.get(cacheKey) as Record<string, LastSessionSet[]> | undefined)
      ?? (await readCache<Record<string, LastSessionSet[]>>(userId, cacheKey))
      ?? {}
    const out = new Map<string, LastSessionSet[]>()
    for (const id of exerciseIds) {
      const v = cached[id]
      if (v) out.set(id, v)
    }
    return out
  }
}

async function fetchLastSessionSetsByExercise(
  exerciseIds: string[],
  excludeWorkoutId: string | null,
): Promise<Map<string, LastSessionSet[]>> {
  if (exerciseIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from("workout_exercises")
    .select(`
      id, exercise_id,
      workouts!inner ( id, started_at, ended_at ),
      sets ( set_number, weight_kg, reps, rest_seconds, done )
    `)
    .in("exercise_id", exerciseIds)
    .not("workouts.ended_at", "is", null)
  if (error) throw error

  const newest = new Map<string, { startedAt: string; sets: LastSessionSet[] }>()
  for (const we of (data ?? []) as any[]) {
    if (excludeWorkoutId && we.workouts?.id === excludeWorkoutId) continue
    const startedAt = we.workouts?.started_at as string | undefined
    if (!startedAt) continue
    const doneSets: LastSessionSet[] = (we.sets ?? [])
      .filter((s: any) => s.done)
      .map((s: any) => ({
        set_number: s.set_number,
        weight_kg: Number(s.weight_kg),
        reps: s.reps,
        rest_seconds: s.rest_seconds ?? null,
      }))
    if (doneSets.length === 0) continue
    const cur = newest.get(we.exercise_id)
    if (!cur || startedAt > cur.startedAt) {
      newest.set(we.exercise_id, { startedAt, sets: doneSets })
    }
  }
  const out = new Map<string, LastSessionSet[]>()
  for (const [exerciseId, v] of newest) {
    out.set(
      exerciseId,
      v.sets.sort((a, b) => a.set_number - b.set_number),
    )
  }
  return out
}

function pickPrefillFor(
  setNumber: number,
  lastSets: LastSessionSet[] | undefined,
): { weight: number; reps: number; rest: number | null } {
  if (!lastSets || lastSets.length === 0) {
    return { weight: 0, reps: 0, rest: null }
  }
  const exact = lastSets.find((s) => s.set_number === setNumber)
  const match = exact ?? lastSets[lastSets.length - 1]
  return { weight: match.weight_kg, reps: match.reps, rest: match.rest_seconds }
}

// ---------------------------------------------------------------------
// workout detail by id
// ---------------------------------------------------------------------
export function useWorkout(workoutId: string | null) {
  const { user } = useAuth()
  const epoch = useOverrideEpoch()
  return useAsync<Workout | null>(async () => {
    if (!workoutId || !user) return null
    const [{ data, error }, overrides] = await Promise.all([
      supabase
        .from("workouts")
        .select(WORKOUT_SELECT)
        .eq("id", workoutId)
        .maybeSingle(),
      getOverridesMap(user.id),
    ])
    if (error) throw error
    return data ? rowToWorkout(data, overrides) : null
  }, [user?.id, workoutId, epoch], null, {
    cacheKey: `workout:${workoutId ?? "_"}`, userId: user?.id ?? null,
  })
}
