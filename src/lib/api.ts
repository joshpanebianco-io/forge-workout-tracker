import * as React from "react"
import { supabase } from "./supabase"
import { useAuth } from "./auth"
import type {
  Exercise, ExerciseLog, MuscleGroup, PR, Routine, SetEntry, Workout,
} from "./types"

type EquipmentDB = Exercise["equipment"]

function rowToExercise(r: {
  id: string; name: string; muscle: string; equipment: string
}): Exercise {
  return {
    id: r.id,
    name: r.name,
    muscle: r.muscle as MuscleGroup,
    equipment: r.equipment as EquipmentDB,
  }
}

// ---------------------------------------------------------------------
// generic data hook
// ---------------------------------------------------------------------
function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  initial: T,
) {
  const [data, setData] = React.useState<T>(initial)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcher()
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e?.message ?? String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const refetch = React.useCallback(() => setVersion((v) => v + 1), [])
  return { data, loading, error, refetch }
}

// ---------------------------------------------------------------------
// exercises
// ---------------------------------------------------------------------
export function useExercises() {
  const { user } = useAuth()
  return useAsync<Exercise[]>(async () => {
    const { data, error } = await supabase
      .from("exercises")
      .select("id, name, muscle, equipment")
      .order("name")
    if (error) throw error
    return (data ?? []).map(rowToExercise)
  }, [user?.id], [])
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
      .order("created_at", { ascending: true })
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
  }, [user?.id], [])
}

// ---------------------------------------------------------------------
// workouts
// ---------------------------------------------------------------------
const WORKOUT_SELECT = `
  id, title, started_at, ended_at, duration_min, routine_id,
  workout_exercises (
    id, position, notes, exercise_id,
    exercises ( id, name, muscle, equipment ),
    sets ( id, set_number, weight_kg, reps, rpe, done )
  )
`

function rowToWorkout(w: any): Workout {
  const exercises: ExerciseLog[] = (w.workout_exercises ?? [])
    .sort((a: any, b: any) => a.position - b.position)
    .map((we: any) => ({
      id: we.id,
      notes: we.notes ?? undefined,
      exercise: rowToExercise(we.exercises),
      sets: (we.sets ?? [])
        .sort((a: any, b: any) => a.set_number - b.set_number)
        .map(
          (s: any): SetEntry => ({
            id: s.id,
            weight: Number(s.weight_kg),
            reps: s.reps,
            rpe: s.rpe ?? undefined,
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
  return useAsync<Workout[]>(async () => {
    if (!user) return []
    const { data, error } = await supabase
      .from("workouts")
      .select(WORKOUT_SELECT)
      .order("started_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(rowToWorkout)
  }, [user?.id, limit], [])
}

export function useWeeklyWorkouts(weekStart: Date) {
  const { user } = useAuth()
  const startIso = weekStart.toISOString()
  const endIso = new Date(weekStart.getTime() + 7 * 86_400_000).toISOString()
  return useAsync<Workout[]>(async () => {
    if (!user) return []
    const { data, error } = await supabase
      .from("workouts")
      .select(WORKOUT_SELECT)
      .gte("started_at", startIso)
      .lt("started_at", endIso)
      .order("started_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToWorkout)
  }, [user?.id, startIso, endIso], [])
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
  }, [user?.id, startIso, endIso], [])
}

export function useActiveWorkout() {
  const { user } = useAuth()
  return useAsync<Workout | null>(async () => {
    if (!user) return null
    const { data, error } = await supabase
      .from("workouts")
      .select(WORKOUT_SELECT)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? rowToWorkout(data) : null
  }, [user?.id], null)
}

// ---------------------------------------------------------------------
// personal records
// ---------------------------------------------------------------------
export function usePersonalRecords() {
  const { user } = useAuth()
  return useAsync<PR[]>(async () => {
    if (!user) return []
    const { data, error } = await supabase
      .from("personal_records")
      .select("exercise_id, weight_kg, reps, estimated_1rm, achieved_at, exercises(name)")
      .order("achieved_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map((r: any) => ({
      exerciseId: r.exercise_id,
      exerciseName: r.exercises?.name ?? "",
      weight: Number(r.weight_kg),
      reps: r.reps,
      date: r.achieved_at,
      estimated1RM: Math.round(Number(r.estimated_1rm)),
    }))
  }, [user?.id], [])
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
  }, [user?.id], null)
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

function startOfWeek(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = (x.getDay() + 6) % 7 // Mon=0
  x.setDate(x.getDate() - day)
  return x
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
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)

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
      const k = startOfWeek(new Date(w.started_at)).toISOString().slice(0, 10)
      weekKeys.add(k)
    }
    let streak = 0
    let cursor = startOfWeek(new Date())
    while (weekKeys.has(cursor.toISOString().slice(0, 10))) {
      streak++
      cursor.setDate(cursor.getDate() - 7)
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
  })
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
  }, [user?.id], { monthCount: 0, avgHoursPerWeek: 0 })
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
  }, [user?.id], [])
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
  return useAsync<TrainedExercise[]>(async () => {
    if (!user) return []
    const { data, error } = await supabase
      .from("workout_exercises")
      .select(`
        exercise_id,
        workout_id,
        exercises ( id, name, muscle ),
        workouts!inner ( started_at, ended_at ),
        sets ( done )
      `)
      .not("workouts.ended_at", "is", null)
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
        name: ex.name,
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
  }, [user?.id], [])
}

// ---------------------------------------------------------------------
// per-exercise progression (one row per session)
// ---------------------------------------------------------------------
export type ProgressPoint = {
  date: string
  topWeight: number
  topReps: number
  est1RM: number
  totalSets: number
}

function epley1RM(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
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
      if (!startedAt) continue
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
        const est = epley1RM(w, r)
        if (est > topEst) {
          topEst = est
          topWeight = w
          topReps = r
        }
      }
      if (totalSets === 0) continue
      points.push({
        date: startedAt,
        topWeight,
        topReps,
        est1RM: Math.round(topEst),
        totalSets,
      })
    }
    points.sort((a, b) => (a.date > b.date ? 1 : -1))
    return points
  }, [user?.id, exerciseId], [])
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
  }, [user?.id], { rows: [], totalSets: 0 })
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

function startOfMonth(d: Date) {
  const x = new Date(d)
  x.setDate(1)
  x.setHours(0, 0, 0, 0)
  return x
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

    const startOfDay = (d: Date) => {
      const x = new Date(d); x.setHours(0, 0, 0, 0); return x
    }
    const makeKey = (d: Date) => {
      if (useDaily) return startOfDay(d).toISOString().slice(0, 10)
      return useMonthly ? startOfMonth(d).toISOString().slice(0, 7)
                        : startOfWeek(d).toISOString().slice(0, 10)
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
  })
}

// ---------------------------------------------------------------------
// mutations
// ---------------------------------------------------------------------
export async function toggleSetDone(setId: string, done: boolean) {
  const { error } = await supabase.from("sets").update({ done }).eq("id", setId)
  if (error) throw error
}

export async function addSet(workoutExerciseId: string, prev: { weight: number; reps: number } | null) {
  const { data: existing, error: countErr } = await supabase
    .from("sets")
    .select("set_number")
    .eq("workout_exercise_id", workoutExerciseId)
    .order("set_number", { ascending: false })
    .limit(1)
  if (countErr) throw countErr
  const next = (existing?.[0]?.set_number ?? 0) + 1
  const { error } = await supabase.from("sets").insert({
    workout_exercise_id: workoutExerciseId,
    set_number: next,
    weight_kg: prev?.weight ?? 0,
    reps: prev?.reps ?? 8,
    done: false,
  })
  if (error) throw error
}

export async function finishWorkout(workoutId: string, durationMin: number) {
  const { error } = await supabase
    .from("workouts")
    .update({
      ended_at: new Date().toISOString(),
      duration_min: durationMin,
    })
    .eq("id", workoutId)
  if (error) throw error
}

export async function startEmptyWorkout(userId: string, title = "Quick session") {
  const { data, error } = await supabase
    .from("workouts")
    .insert({ user_id: userId, title })
    .select("id")
    .single()
  if (error) throw error
  return data.id
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
    .insert({ user_id: userId, routine_id: routineId, title: routine.name })
    .select("id")
    .single()
  if (wErr) throw wErr

  const sortedRe = (routine.routine_exercises ?? []).sort((a: any, b: any) => a.position - b.position)
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
    const rows = Array.from({ length: re.target_sets }, (_, i) => ({
      workout_exercise_id: we.id,
      set_number: i + 1,
      weight_kg: 0,
      reps: 0,
      done: false,
    }))
    const { error: sErr } = await supabase.from("sets").insert(rows)
    if (sErr) throw sErr
  }
  return workout.id
}

export async function signOut() {
  await supabase.auth.signOut()
}

// ---------------------------------------------------------------------
// set mutations
// ---------------------------------------------------------------------
export async function updateSet(
  setId: string,
  patch: { weight?: number; reps?: number; rpe?: number | null }
) {
  const payload: { weight_kg?: number; reps?: number; rpe?: number | null } = {}
  if (patch.weight !== undefined) payload.weight_kg = patch.weight
  if (patch.reps !== undefined) payload.reps = patch.reps
  if (patch.rpe !== undefined) payload.rpe = patch.rpe
  const { error } = await supabase.from("sets").update(payload).eq("id", setId)
  if (error) throw error
}

export async function deleteSet(setId: string) {
  const { error } = await supabase.from("sets").delete().eq("id", setId)
  if (error) throw error
}

// ---------------------------------------------------------------------
// workout-exercise mutations
// ---------------------------------------------------------------------
export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
) {
  const { data: existing, error: pErr } = await supabase
    .from("workout_exercises")
    .select("position")
    .eq("workout_id", workoutId)
    .order("position", { ascending: false })
    .limit(1)
  if (pErr) throw pErr
  const position = (existing?.[0]?.position ?? 0) + 1
  const { data: we, error } = await supabase
    .from("workout_exercises")
    .insert({ workout_id: workoutId, exercise_id: exerciseId, position })
    .select("id")
    .single()
  if (error) throw error
  const { error: sErr } = await supabase.from("sets").insert({
    workout_exercise_id: we.id,
    set_number: 1,
    weight_kg: 0,
    reps: 0,
    done: false,
  })
  if (sErr) throw sErr
}

export async function removeExerciseFromWorkout(workoutExerciseId: string) {
  const { error } = await supabase
    .from("workout_exercises")
    .delete()
    .eq("id", workoutExerciseId)
  if (error) throw error
}

export async function discardWorkout(workoutId: string) {
  const { error } = await supabase.from("workouts").delete().eq("id", workoutId)
  if (error) throw error
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
    .select("id, name, muscle, equipment")
    .single()
  if (error) throw error
  return rowToExercise(data)
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
  const { data: r, error } = await supabase
    .from("routines")
    .insert({
      user_id: userId,
      name: draft.name,
      description: draft.description ?? null,
      schedule: draft.schedule ?? null,
      color: draft.color,
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
  const { error: rErr } = await supabase
    .from("routines")
    .update({
      name: draft.name,
      description: draft.description ?? null,
      schedule: draft.schedule ?? null,
      color: draft.color,
    })
    .eq("id", routineId)
  if (rErr) throw rErr
  const { error: delErr } = await supabase
    .from("routine_exercises")
    .delete()
    .eq("routine_id", routineId)
  if (delErr) throw delErr
  if (draft.exercises.length > 0) {
    const rows = draft.exercises.map((re, i) => ({
      routine_id: routineId,
      exercise_id: re.exerciseId,
      position: i + 1,
      target_sets: re.sets,
      target_reps: re.targetReps,
    }))
    const { error: insErr } = await supabase.from("routine_exercises").insert(rows)
    if (insErr) throw insErr
  }
}

export async function deleteRoutine(routineId: string) {
  const { error } = await supabase.from("routines").delete().eq("id", routineId)
  if (error) throw error
}

// ---------------------------------------------------------------------
// profile mutations
// ---------------------------------------------------------------------
export async function updateProfile(
  userId: string,
  patch: { name?: string; handle?: string; bodyweight_kg?: number | null; goal?: string }
) {
  const { error } = await supabase
    .from("profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", userId)
  if (error) throw error
}

// ---------------------------------------------------------------------
// workout detail by id
// ---------------------------------------------------------------------
export function useWorkout(workoutId: string | null) {
  const { user } = useAuth()
  return useAsync<Workout | null>(async () => {
    if (!workoutId || !user) return null
    const { data, error } = await supabase
      .from("workouts")
      .select(WORKOUT_SELECT)
      .eq("id", workoutId)
      .maybeSingle()
    if (error) throw error
    return data ? rowToWorkout(data) : null
  }, [user?.id, workoutId], null)
}
