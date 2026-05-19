import * as React from "react"
import { supabase } from "./supabase"
import { useAuth } from "./auth"
import {
  addDays, startOfWeek, startOfMonth, startOfDay, localDayKey, localMonthKey,
} from "./utils"
import { readCache, writeCache } from "./cache"
import { runMutation } from "./mutation-queue"
import { onNetworkChange } from "./network"
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

export function clearMemoryCache() {
  memCache.clear()
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
    if (online) {
      // Defer past the queue-drain kickoff so we revalidate AFTER mutations
      // have had a chance to land on the server. 500ms is generous; the
      // important thing is ordering, not exact timing.
      setTimeout(pulseRevalidation, 500)
    }
  })
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

    fetcher()
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError(null)
        if (cacheEnabled) {
          memCache.set(cacheKey!, d)
          writeCache(userId, cacheKey!, d).catch(() => { /* ignore */ })
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
export async function toggleSetDone(setId: string, done: boolean) {
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
  await runMutation("addSet", {
    id,
    workoutExerciseId,
    setNumber,
    weight,
    reps,
    rest,
  })
  return {
    id,
    weight,
    reps,
    rest: rest ?? undefined,
    done: false,
  }
}

export async function finishWorkout(workoutId: string, durationMin: number) {
  await runMutation("finishWorkout", {
    workoutId,
    durationMin,
    endedAt: new Date().toISOString(),
  })
}

export async function startEmptyWorkout(userId: string, title = "Quick session") {
  const { data, error } = await supabase
    .from("workouts")
    .insert({ user_id: userId, title, started_at: new Date().toISOString() })
    .select("id")
    .single()
  if (error) {
    if (isActiveWorkoutConflict(error)) {
      throw new Error("You already have an active workout. Finish or discard it first.")
    }
    throw error
  }
  return data.id
}

function isActiveWorkoutConflict(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null
  if (!err) return false
  return err.code === "23505" && /workouts_one_active_per_user/.test(err.message ?? "")
}

export async function startWorkoutFromRoutine(routineId: string, userId: string) {
  const { data: routine, error: rErr } = await supabase
    .from("routines")
    .select(`
      id, name,
      routine_exercises ( exercise_id, position, target_sets )
    `)
    .eq("id", routineId)
    .single()
  if (rErr) throw rErr

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({
      user_id: userId,
      routine_id: routineId,
      title: routine.name,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (wErr) {
    if (isActiveWorkoutConflict(wErr)) {
      throw new Error("You already have an active workout. Finish or discard it first.")
    }
    throw wErr
  }

  const sortedRe = (routine.routine_exercises ?? []).sort((a: any, b: any) => a.position - b.position)
  const lastByExercise = await fetchLastSessionSetsByExercise(
    sortedRe.map((re: any) => re.exercise_id),
    workout.id,
  )
  for (const re of sortedRe) {
    const { data: we, error: weErr } = await supabase
      .from("workout_exercises")
      .insert({
        workout_id: workout.id,
        exercise_id: re.exercise_id,
        position: re.position,
      })
      .select("id")
      .single()
    if (weErr) throw weErr
    const lastSets = lastByExercise.get(re.exercise_id)
    const rows = Array.from({ length: re.target_sets }, (_, i) => {
      const setNumber = i + 1
      const prefill = pickPrefillFor(setNumber, lastSets)
      return {
        workout_exercise_id: we.id,
        set_number: setNumber,
        weight_kg: prefill.weight,
        reps: prefill.reps,
        rest_seconds: prefill.rest,
        done: false,
      }
    })
    const { error: sErr } = await supabase.from("sets").insert(rows)
    if (sErr) throw sErr
  }
  return workout.id
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
  await runMutation("updateSet", { setId, patch: dbPatch })
}

export async function deleteSet(setId: string) {
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

  // Best-effort prefill from the user's last session for this exercise.
  // Offline-safe: if the query fails (no network), fall back to a zero set
  // so the mutation can still be queued and the user can start logging.
  let prefill: { weight: number; reps: number; rest: number | null } = {
    weight: 0, reps: 0, rest: null,
  }
  try {
    const lastByExercise = await fetchLastSessionSetsByExercise([exerciseId], workoutId)
    prefill = pickPrefillFor(1, lastByExercise.get(exerciseId))
  } catch { /* fall through with zero prefill */ }

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
  return {
    workoutExerciseId,
    initialSet: {
      id: initialSetId,
      weight: prefill.weight,
      reps: prefill.reps,
      rest: prefill.rest ?? undefined,
      done: false,
    },
  }
}

export async function removeExerciseFromWorkout(workoutExerciseId: string) {
  await runMutation("removeExerciseFromWorkout", { workoutExerciseId })
}

export async function discardWorkout(workoutId: string) {
  await runMutation("discardWorkout", { workoutId })
}

export async function updateWorkoutTitle(workoutId: string, title: string) {
  const trimmed = title.trim()
  if (!trimmed) throw new Error("Title required")
  await runMutation("updateWorkoutTitle", { workoutId, title: trimmed })
}

// ---------------------------------------------------------------------
// exercise mutations
// ---------------------------------------------------------------------
export async function createExercise(
  userId: string,
  draft: { name: string; muscle: MuscleGroup; equipment: Exercise["equipment"] }
): Promise<Exercise> {
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      user_id: userId,
      name: draft.name.trim(),
      muscle: draft.muscle,
      equipment: draft.equipment,
    })
    .select("id, name, muscle, equipment, user_id")
    .single()
  if (error) throw error
  return rowToExercise(data)
}

export async function deleteExercise(exerciseId: string) {
  const { error } = await supabase
    .from("exercises")
    .delete()
    .eq("id", exerciseId)
  if (error) throw error
}

export async function renameExercise(
  exercise: { id: string; userId: string | null },
  userId: string,
  name: string,
) {
  const trimmed = name.trim()
  if (exercise.userId === null) {
    await runMutation("renameExerciseOverride", {
      userId,
      exerciseId: exercise.id,
      name: trimmed,
    })
  } else {
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
  const { data: existing, error: pErr } = await supabase
    .from("routines")
    .select("position")
    .eq("user_id", userId)
    .order("position", { ascending: false })
    .limit(1)
  if (pErr) throw pErr
  const position = (existing?.[0]?.position ?? 0) + 1
  const { data: r, error } = await supabase
    .from("routines")
    .insert({
      user_id: userId,
      name: draft.name,
      description: draft.description ?? null,
      schedule: draft.schedule ?? null,
      color: draft.color,
      position,
    })
    .select("id")
    .single()
  if (error) throw error
  if (draft.exercises.length > 0) {
    const rows = draft.exercises.map((re, i) => ({
      routine_id: r.id,
      exercise_id: re.exerciseId,
      position: i + 1,
      target_sets: re.sets,
      target_reps: re.targetReps,
    }))
    const { error: reErr } = await supabase.from("routine_exercises").insert(rows)
    if (reErr) throw reErr
  }
  return r.id
}

export async function updateRoutine(routineId: string, draft: RoutineDraft) {
  // Single-transaction RPC: updates routine row + replaces routine_exercises
  // atomically, so a mid-save failure can't wipe the exercise list.
  const { error } = await supabase.rpc("update_routine_with_exercises", {
    p_routine_id: routineId,
    p_name: draft.name,
    // Supabase's RPC type-gen flags function args as non-nullable even when
    // the Postgres parameter accepts NULL. Empty string is equivalent here:
    // the client reads `description ?? ""` everywhere so "" and NULL look
    // identical in the UI.
    p_description: draft.description ?? "",
    p_schedule: draft.schedule ?? "",
    p_color: draft.color,
    p_exercises: draft.exercises.map((re, i) => ({
      exercise_id: re.exerciseId,
      position: i + 1,
      target_sets: re.sets,
      target_reps: re.targetReps,
    })),
  })
  if (error) throw error
}

export async function deleteRoutine(routineId: string) {
  const { error } = await supabase.from("routines").delete().eq("id", routineId)
  if (error) throw error
}

// Two-pass to dodge UNIQUE(user_id, position): park at negatives, then commit.
export async function reorderRoutines(orderedIds: string[]) {
  await Promise.all(
    orderedIds.map(async (id, i) => {
      const { error } = await supabase
        .from("routines")
        .update({ position: -(i + 1) })
        .eq("id", id)
      if (error) throw error
    })
  )
  await Promise.all(
    orderedIds.map(async (id, i) => {
      const { error } = await supabase
        .from("routines")
        .update({ position: i + 1 })
        .eq("id", id)
      if (error) throw error
    })
  )
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
