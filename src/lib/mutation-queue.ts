import { supabase } from "./supabase"
import { idbGet, idbSet } from "./idb"
import { isOnline, onNetworkChange } from "./network"

// Persisted, replayable mutation queue. The shape is intentionally narrow —
// each entry serializes only the data needed to execute the mutation against
// Supabase. No closures, no React state, no DOM references — that way the
// queue survives reloads and the entries can be replayed by a "fresh" client
// after the original tab is gone.
//
// The execute function below is the single source of truth for both online
// and offline writes: when online we call it directly, when offline we
// persist the payload and call it later from drainQueue(). That symmetry
// means a queued mutation that drains later goes through the same code path
// it would have used in the foreground, so behavioral drift is impossible.
//
// Inserts pre-generate their own UUIDs in the caller so that optimistic UI
// state already knows the row id by the time the server inserts it. When the
// queue drains, the server accepts the explicit id — Supabase honors `id` in
// INSERT payloads — and FK references from later queued rows (e.g. sets that
// reference a workout_exercise that's also queued) stay consistent.

const QUEUE_KEY = "q:mutations:v1"
const MAX_ATTEMPTS = 5

export type MutationKind =
  | "toggleSetDone"
  | "updateSet"
  | "deleteSet"
  | "addSet"
  | "finishWorkout"
  | "updateWorkoutTitle"
  | "discardWorkout"
  | "addExerciseToWorkout"
  | "removeExerciseFromWorkout"
  | "updateProfile"
  | "createExercise"
  | "deleteExercise"
  | "renameExerciseOverride"
  | "renameExerciseOwn"
  | "createRoutine"
  | "updateRoutine"
  | "deleteRoutine"
  | "reorderRoutines"
  | "startEmptyWorkout"
  | "startWorkoutFromRoutine"

type QueueEntry = {
  id: string
  kind: MutationKind
  payload: unknown
  createdAt: number
  attempts: number
  lastError?: string
}

let memQueue: QueueEntry[] | null = null
let queueLoadPromise: Promise<QueueEntry[]> | null = null
let drainPromise: Promise<void> | null = null
const queueListeners = new Set<(len: number) => void>()
// Fired once each time a drain cycle finishes (queue emptied or stopped on a
// network error). Lets the data layer pulse revalidation so mounted hooks pick
// up whatever the queue just synced — on reconnect, cold-start replay, or a
// foreground write that flushed queued predecessors first.
const drainCompleteListeners = new Set<() => void>()

function notifyQueueChanged() {
  const len = memQueue?.length ?? 0
  queueListeners.forEach((l) => l(len))
}

function notifyDrainComplete() {
  drainCompleteListeners.forEach((cb) => {
    try { cb() } catch { /* ignore */ }
  })
}

// Count of direct (online, non-queued) writes currently in flight. The data
// layer treats these like a non-empty queue when deciding whether to run a
// background refetch — a fetch started while a write is mid-round-trip can
// return a pre-write snapshot and clobber the just-applied optimistic state
// (e.g. a tab remount racing a set toggle).
let pendingWrites = 0
const pendingWritesListeners = new Set<(n: number) => void>()

function notifyPendingWrites() {
  pendingWritesListeners.forEach((l) => l(pendingWrites))
}

async function loadQueue(): Promise<QueueEntry[]> {
  if (memQueue) return memQueue
  if (queueLoadPromise) return queueLoadPromise
  queueLoadPromise = (async () => {
    const stored = await idbGet<QueueEntry[]>(QUEUE_KEY)
    memQueue = stored ?? []
    return memQueue
  })()
  return queueLoadPromise
}

async function persistQueue() {
  if (!memQueue) return
  await idbSet(QUEUE_KEY, memQueue)
}

async function enqueue(kind: MutationKind, payload: unknown): Promise<void> {
  const q = await loadQueue()
  q.push({
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  })
  await persistQueue()
  notifyQueueChanged()
}

function isNetworkError(e: unknown): boolean {
  if (!e) return false
  const err = e as { message?: string; name?: string; cause?: unknown }
  const msg = String(err.message ?? err)
  if (/network|fetch|failed to fetch|networkerror|load failed|timeout|offline/i.test(msg)) {
    return true
  }
  if (err.name === "TypeError" && /fetch/i.test(msg)) return true
  if (err.name === "AbortError") return true
  return false
}

// --------------------------------------------------------------------------
// Mutation executors — one per kind. These are intentionally read-free; any
// data that needs to be looked up must be baked into the payload at enqueue
// time so replay is deterministic.
// --------------------------------------------------------------------------
async function executeMutation(kind: MutationKind, payload: any): Promise<void> {
  switch (kind) {
    case "toggleSetDone": {
      const { error } = await supabase
        .from("sets")
        .update({ done: payload.done })
        .eq("id", payload.setId)
      if (error) throw error
      return
    }
    case "updateSet": {
      const { error } = await supabase
        .from("sets")
        .update(payload.patch)
        .eq("id", payload.setId)
      if (error) throw error
      return
    }
    case "deleteSet": {
      const { error } = await supabase
        .from("sets")
        .delete()
        .eq("id", payload.setId)
      if (error) throw error
      return
    }
    case "addSet": {
      const { error } = await supabase.from("sets").insert({
        id: payload.id,
        workout_exercise_id: payload.workoutExerciseId,
        set_number: payload.setNumber,
        weight_kg: payload.weight,
        reps: payload.reps,
        rest_seconds: payload.rest,
        done: false,
      })
      if (error) throw error
      return
    }
    case "finishWorkout": {
      const { error } = await supabase
        .from("workouts")
        .update({ ended_at: payload.endedAt, duration_min: payload.durationMin })
        .eq("id", payload.workoutId)
      if (error) throw error
      return
    }
    case "updateWorkoutTitle": {
      const { error } = await supabase
        .from("workouts")
        .update({ title: payload.title })
        .eq("id", payload.workoutId)
      if (error) throw error
      return
    }
    case "discardWorkout": {
      const { error } = await supabase
        .from("workouts")
        .delete()
        .eq("id", payload.workoutId)
      if (error) throw error
      return
    }
    case "addExerciseToWorkout": {
      const { error: weErr } = await supabase
        .from("workout_exercises")
        .insert({
          id: payload.workoutExerciseId,
          workout_id: payload.workoutId,
          exercise_id: payload.exerciseId,
          position: payload.position,
        })
      if (weErr) throw weErr
      const { error: sErr } = await supabase.from("sets").insert({
        id: payload.initialSetId,
        workout_exercise_id: payload.workoutExerciseId,
        set_number: 1,
        weight_kg: payload.initialWeight,
        reps: payload.initialReps,
        rest_seconds: payload.initialRest,
        done: false,
      })
      if (sErr) throw sErr
      return
    }
    case "removeExerciseFromWorkout": {
      const { error } = await supabase
        .from("workout_exercises")
        .delete()
        .eq("id", payload.workoutExerciseId)
      if (error) throw error
      return
    }
    case "updateProfile": {
      const { error } = await supabase
        .from("profiles")
        .upsert(
          { id: payload.userId, ...payload.patch, updated_at: new Date().toISOString() },
          { onConflict: "id" },
        )
      if (error) throw error
      return
    }
    case "createExercise": {
      const { error } = await supabase.from("exercises").insert({
        id: payload.id,
        user_id: payload.userId,
        name: payload.name,
        muscle: payload.muscle,
        equipment: payload.equipment,
      })
      if (error) throw error
      return
    }
    case "deleteExercise": {
      const { error } = await supabase
        .from("exercises")
        .delete()
        .eq("id", payload.exerciseId)
      if (error) throw error
      return
    }
    case "renameExerciseOverride": {
      const { error } = await supabase.from("exercise_overrides").upsert(
        {
          user_id: payload.userId,
          exercise_id: payload.exerciseId,
          name: payload.name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,exercise_id" },
      )
      if (error) throw error
      return
    }
    case "renameExerciseOwn": {
      const { error } = await supabase
        .from("exercises")
        .update({ name: payload.name })
        .eq("id", payload.exerciseId)
      if (error) throw error
      return
    }
    case "createRoutine": {
      const { error: rErr } = await supabase.from("routines").insert({
        id: payload.id,
        user_id: payload.userId,
        name: payload.name,
        description: payload.description,
        schedule: payload.schedule,
        color: payload.color,
        position: payload.position,
      })
      if (rErr) throw rErr
      if (payload.exercises.length > 0) {
        const { error: reErr } = await supabase
          .from("routine_exercises")
          .insert(payload.exercises)
        if (reErr) throw reErr
      }
      return
    }
    case "updateRoutine": {
      const { error } = await supabase.rpc("update_routine_with_exercises", {
        p_routine_id: payload.routineId,
        p_name: payload.name,
        p_description: payload.description,
        p_schedule: payload.schedule,
        p_color: payload.color,
        p_exercises: payload.exercises,
      })
      if (error) throw error
      return
    }
    case "deleteRoutine": {
      const { error } = await supabase
        .from("routines")
        .delete()
        .eq("id", payload.routineId)
      if (error) throw error
      return
    }
    case "reorderRoutines": {
      // Two-pass so UNIQUE(user_id, position) can't get tripped during the swap.
      const ids = payload.orderedIds as string[]
      for (let i = 0; i < ids.length; i++) {
        const { error } = await supabase
          .from("routines")
          .update({ position: -(i + 1) })
          .eq("id", ids[i])
        if (error) throw error
      }
      for (let i = 0; i < ids.length; i++) {
        const { error } = await supabase
          .from("routines")
          .update({ position: i + 1 })
          .eq("id", ids[i])
        if (error) throw error
      }
      return
    }
    case "startEmptyWorkout": {
      const { error } = await supabase.from("workouts").insert({
        id: payload.id,
        user_id: payload.userId,
        title: payload.title,
        started_at: payload.startedAt,
      })
      if (error) throw error
      return
    }
    case "startWorkoutFromRoutine": {
      const { error: wErr } = await supabase.from("workouts").insert({
        id: payload.workoutId,
        user_id: payload.userId,
        routine_id: payload.routineId,
        title: payload.title,
        started_at: payload.startedAt,
      })
      if (wErr) throw wErr
      type WeRow = {
        workoutExerciseId: string
        exerciseId: string
        position: number
        sets: Array<{ id: string; setNumber: number; weight: number; reps: number; rest: number | null }>
      }
      const weRows = payload.workoutExercises as WeRow[]
      if (weRows.length > 0) {
        const { error: weErr } = await supabase.from("workout_exercises").insert(
          weRows.map((we) => ({
            id: we.workoutExerciseId,
            workout_id: payload.workoutId,
            exercise_id: we.exerciseId,
            position: we.position,
          })),
        )
        if (weErr) throw weErr
        const setRows = weRows.flatMap((we) =>
          we.sets.map((s) => ({
            id: s.id,
            workout_exercise_id: we.workoutExerciseId,
            set_number: s.setNumber,
            weight_kg: s.weight,
            reps: s.reps,
            rest_seconds: s.rest,
            done: false,
          })),
        )
        if (setRows.length > 0) {
          const { error: sErr } = await supabase.from("sets").insert(setRows)
          if (sErr) throw sErr
        }
      }
      return
    }
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unknown mutation kind: ${_exhaustive}`)
    }
  }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

// Run a mutation: try the network first, queue on offline / network error.
// All non-network errors (validation, RLS, conflicts) propagate to the caller.
export async function runMutation(
  kind: MutationKind,
  payload: unknown,
): Promise<void> {
  if (!isOnline()) {
    await enqueue(kind, payload)
    return
  }
  // Preserve causal FIFO order. If writes are already queued (e.g. an earlier
  // one hit a transient network error while navigator stayed "online"), flush
  // them before running this one directly — otherwise this mutation could
  // reach the server ahead of a predecessor it depends on (e.g. an addSet
  // landing before the addExerciseToWorkout that creates its parent row).
  if ((await getQueueLength()) > 0) {
    await drainQueue()
    if ((await getQueueLength()) > 0) {
      // Drain couldn't fully flush (a predecessor is still failing on the
      // network, or we just went offline). Queue this one too so ordering is
      // preserved rather than racing ahead of the backlog.
      await enqueue(kind, payload)
      return
    }
  }
  pendingWrites++
  notifyPendingWrites()
  try {
    await executeMutation(kind, payload)
  } catch (e) {
    if (isNetworkError(e)) {
      await enqueue(kind, payload)
      return
    }
    throw e
  } finally {
    pendingWrites--
    notifyPendingWrites()
  }
}

// Drain the queue in FIFO order. Safe to call concurrently — second caller
// awaits the first one's promise. Stops on the first network error and
// resumes when the network comes back.
export async function drainQueue(): Promise<void> {
  if (drainPromise) return drainPromise
  let processedAny = false
  drainPromise = (async () => {
    const q = await loadQueue()
    while (q.length > 0 && isOnline()) {
      const entry = q[0]
      try {
        await executeMutation(entry.kind, entry.payload)
        q.shift()
        await persistQueue()
        notifyQueueChanged()
        processedAny = true
      } catch (e) {
        entry.attempts++
        entry.lastError = (e as { message?: string })?.message ?? String(e)
        if (isNetworkError(e)) {
          await persistQueue()
          break
        }
        // Non-network error (validation / RLS / conflict). Retrying won't
        // help — drop after a few attempts so a single bad entry can't
        // block everything behind it forever.
        if (entry.attempts >= MAX_ATTEMPTS) {
          q.shift()
          processedAny = true
        }
        await persistQueue()
        notifyQueueChanged()
      }
    }
  })()
  try {
    await drainPromise
  } finally {
    drainPromise = null
  }
  // Signal only when the cycle actually changed server state (synced or dropped
  // an entry) — an empty-queue drain (e.g. the cold-start tick) shouldn't force
  // a redundant refetch. Only the initiating caller reaches here; concurrent
  // callers returned the shared drainPromise above.
  if (processedAny) notifyDrainComplete()
}

export async function getQueueLength(): Promise<number> {
  const q = await loadQueue()
  return q.length
}

export function subscribeQueueLength(cb: (n: number) => void): () => void {
  queueListeners.add(cb)
  // Fire current value once on subscribe
  loadQueue().then((q) => cb(q.length)).catch(() => {})
  return () => { queueListeners.delete(cb) }
}

// Count of direct online writes currently in flight (see pendingWrites above).
export function subscribePendingWrites(cb: (n: number) => void): () => void {
  pendingWritesListeners.add(cb)
  cb(pendingWrites)
  return () => { pendingWritesListeners.delete(cb) }
}

// Subscribe to "the queue just finished draining" events. The data layer uses
// this to pulse revalidation so hooks refetch server state synced by the drain.
export function onDrainComplete(cb: () => void): () => void {
  drainCompleteListeners.add(cb)
  return () => { drainCompleteListeners.delete(cb) }
}

export async function clearQueue(): Promise<void> {
  memQueue = []
  await persistQueue()
  notifyQueueChanged()
}

// Auto-drain on reconnect
onNetworkChange((online) => {
  if (online) drainQueue().catch(() => { /* ignore */ })
})

// Drain on initial load in case a previous session left work pending.
if (typeof window !== "undefined") {
  // Defer past startup so we don't compete with first paint.
  setTimeout(() => {
    if (isOnline()) drainQueue().catch(() => { /* ignore */ })
  }, 500)
}
