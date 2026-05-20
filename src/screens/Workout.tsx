import * as React from "react"
import {
  Check, Plus, Timer, Trophy, Flame, X, ChevronDown, ChevronUp, Loader2, MoreVertical, Trash2,
  Pencil,
} from "lucide-react"
import { ScreenHeader } from "@/components/ScreenHeader"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  useActiveWorkout, useRoutines, toggleSetDone, addSet, finishWorkout,
  startWorkoutFromRoutine, startEmptyWorkout, addExerciseToWorkout,
  removeExerciseFromWorkout, discardWorkout, deleteSet,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { ExercisePickerSheet } from "@/components/ExercisePickerSheet"
import { SetEditorSheet, type SetPatch } from "@/components/SetEditorSheet"
import { WorkoutTitleEditSheet } from "@/components/WorkoutTitleEditSheet"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { Exercise, ExerciseLog, SetEntry, Workout as WorkoutType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useWorkoutSession, useTick, RestDefaults } from "@/lib/session"

function DurationDisplay({ startedAt }: { startedAt: number }) {
  const now = useTick(1000)
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000))
  return <>{fmtElapsed(elapsed)}</>
}

function RestTimerCard({ endsAt, onClear }: { endsAt: number; onClear: () => void }) {
  const now = useTick(1000)
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000))
  return (
    <div className="sticky top-0 z-30 bg-background px-5 py-2">
      <Card className="tint-blue flex items-center gap-3 p-4 shadow-soft">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <Timer className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
            {remaining === 0 ? "Rest complete" : "Resting"}
          </p>
          <p className="num text-xl font-bold">
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </p>
        </div>
        <button
          onClick={onClear}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-card/60 hover:bg-card"
        >
          <X className="h-4 w-4" />
        </button>
      </Card>
    </div>
  )
}

export function Workout() {
  const { user } = useAuth()
  const { data: active, loading, refetch, setData: setActive } = useActiveWorkout()
  const { data: routines } = useRoutines()
  const [starting, setStarting] = React.useState<string | null>(null)
  const [creatingEmpty, setCreatingEmpty] = React.useState(false)

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!active) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        <ScreenHeader title="Workout" subtitle="Start a session" />
        <div className="flex flex-col gap-3 px-5">
          {routines.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pick a routine
              </p>
              <div className="flex flex-col gap-2.5">
                {routines.map((r) => (
                  <Card key={r.id} className="overflow-hidden p-0">
                    <button
                      onClick={async () => {
                        if (!user) return
                        setStarting(r.id)
                        try {
                          await startWorkoutFromRoutine(r.id, user.id)
                          refetch()
                        } finally {
                          setStarting(null)
                        }
                      }}
                      disabled={starting !== null}
                      className="flex w-full items-center gap-3 p-4 text-left hover:bg-secondary/40 disabled:opacity-60"
                    >
                      <div className={`h-12 w-1.5 rounded-full bg-gradient-to-b ${r.color}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.exercises.length} exercises {r.schedule && `· ${r.schedule}`}
                        </p>
                      </div>
                      {starting === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Button size="sm" tabIndex={-1}>Start</Button>
                      )}
                    </button>
                  </Card>
                ))}
              </div>
              <div className="my-2 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <Button
            variant="secondary"
            size="lg"
            disabled={creatingEmpty}
            onClick={async () => {
              if (!user) return
              setCreatingEmpty(true)
              try {
                await startEmptyWorkout(user.id)
                refetch()
              } finally {
                setCreatingEmpty(false)
              }
            }}
          >
            {creatingEmpty ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <><Plus className="h-4 w-4" /> Empty workout</>
            )}
          </Button>
          {routines.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Create a routine from the Home tab to make starting sessions easier.
            </p>
          )}
        </div>
      </div>
    )
  }

  return <ActiveSession workout={active} onFinished={() => setActive(null)} />
}

function ActiveSession({
  workout, onFinished,
}: {
  workout: WorkoutType
  // Called after the workout transitions to a terminal state (finish or
  // discard). Parent uses this to clear the active workout locally instead
  // of refetching from the server.
  onFinished: () => void
}) {
  // Local state is the source of truth for the active session. Mutations
  // update this optimistically and the server only confirms. We never
  // refetch the workout mid-session — the next mount (after a tab switch
  // or reload) picks up the canonical server copy.
  const [logs, setLogs] = React.useState<ExerciseLog[]>(workout.exercises)
  const [title, setTitle] = React.useState(workout.title)
  const [finishing, setFinishing] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [pickerAdding, setPickerAdding] = React.useState(false)
  const [editSet, setEditSet] = React.useState<{ set: SetEntry; exerciseName: string } | null>(null)
  const [showFinishMenu, setShowFinishMenu] = React.useState(false)
  const [confirmDiscard, setConfirmDiscard] = React.useState(false)
  const [discardError, setDiscardError] = React.useState<string | null>(null)
  const [confirmRemoveEx, setConfirmRemoveEx] = React.useState<string | null>(null)
  const [removingEx, setRemovingEx] = React.useState(false)
  const [removeExError, setRemoveExError] = React.useState<string | null>(null)
  const [renameOpen, setRenameOpen] = React.useState(false)

  const session = useWorkoutSession()
  // syncWorkout / startRest are referentially stable (useCallback w/ []) but
  // the surrounding `session` value object changes on every provider state
  // tick. Pull the stable fn refs out so effects + memoized callbacks can
  // depend on them directly and don't re-run on every collapse/rest update.
  const { syncWorkout, startRest } = session

  // Re-sync local state only when the workout identity changes (start /
  // resume). Deliberately doesn't depend on workout.exercises — that would
  // let a parent re-render clobber our optimistic state mid-session.
  React.useEffect(() => {
    setLogs(workout.exercises)
    setTitle(workout.title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout.id])

  const logIdsKey = React.useMemo(() => logs.map((l) => l.id).join("|"), [logs])
  React.useEffect(() => {
    syncWorkout(workout.id, logIdsKey ? logIdsKey.split("|") : [])
  }, [workout.id, logIdsKey, syncWorkout])

  const startedAtMs = React.useMemo(() => new Date(workout.date).getTime(), [workout.date])

  const completedSets = logs.reduce((acc, e) => acc + e.sets.filter((s) => s.done).length, 0)
  const totalSets = logs.reduce((acc, e) => acc + e.sets.length, 0)
  const totalReps = logs.reduce(
    (acc, e) => acc + e.sets.filter((s) => s.done).reduce((a, s) => a + s.reps, 0), 0
  )
  const progress = totalSets === 0 ? 0 : Math.round((completedSets / totalSets) * 100)

  // Refs let callbacks remain referentially stable while still seeing the
  // latest state. Stable callbacks are required so React.memo on SetRow can
  // skip re-renders when an unrelated parent state change occurs.
  const logsRef = React.useRef(logs)
  React.useEffect(() => { logsRef.current = logs }, [logs])

  const handleToggle = React.useCallback(async (exId: string, setId: string, exerciseName: string) => {
    const current = logsRef.current.find((e) => e.id === exId)?.sets.find((s) => s.id === setId)
    if (!current) return
    if (current.weight === 0 && current.reps === 0 && !current.done) {
      setEditSet({ set: current, exerciseName })
      return
    }
    const next = !current.done
    setLogs((prev) =>
      prev.map((e) => e.id === exId
        ? { ...e, sets: e.sets.map((s) => s.id === setId ? { ...s, done: next } : s) }
        : e)
    )
    if (next) startRest(current.rest ?? RestDefaults.seconds)
    try { await toggleSetDone(setId, next) }
    catch {
      setLogs((prev) =>
        prev.map((e) => e.id === exId
          ? { ...e, sets: e.sets.map((s) => s.id === setId ? { ...s, done: !next } : s) }
          : e)
      )
    }
  }, [startRest])

  const handleEditSet = React.useCallback((exId: string, setId: string, exerciseName: string) => {
    const set = logsRef.current.find((e) => e.id === exId)?.sets.find((s) => s.id === setId)
    if (set) setEditSet({ set, exerciseName })
  }, [])

  const handleDeleteSet = React.useCallback(async (exId: string, setId: string) => {
    const prev = logsRef.current
    setLogs((cur) =>
      cur.map((e) => e.id === exId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e)
    )
    try { await deleteSet(setId) }
    catch { setLogs(prev) }
  }, [])

  // Sheet has already awaited the server; apply confirmed values locally.
  const handleSetPatched = React.useCallback((setId: string, patch: SetPatch) => {
    setLogs((cur) =>
      cur.map((e) => ({
        ...e,
        sets: e.sets.map((s) => s.id === setId ? {
          ...s,
          weight: patch.weight,
          reps: patch.reps,
          rest: patch.rest ?? undefined,
        } : s),
      }))
    )
  }, [])

  const handleSetDeletedFromSheet = React.useCallback((setId: string) => {
    setLogs((cur) =>
      cur.map((e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }))
    )
  }, [])

  const handleAddSet = async (exId: string) => {
    const log = logsRef.current.find((e) => e.id === exId)
    const last = log?.sets[log.sets.length - 1]
    const setNumber = (log?.sets.length ?? 0) + 1
    try {
      const created = await addSet(
        exId,
        last ? { weight: last.weight, reps: last.reps, rest: last.rest } : null,
        setNumber,
      )
      setLogs((cur) =>
        cur.map((e) => e.id === exId ? { ...e, sets: [...e.sets, created] } : e)
      )
    } catch (e) {
      console.error(e)
    }
  }

  const handleFinish = async () => {
    setFinishing(true)
    try {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
      const durationMin = Math.max(1, Math.round(elapsedSec / 60))
      await finishWorkout(workout.id, durationMin)
      onFinished()
    } catch (e) {
      console.error(e)
    } finally {
      setFinishing(false)
    }
  }

  const handleDiscard = () => {
    setShowFinishMenu(false)
    setConfirmDiscard(true)
  }

  const doDiscard = async () => {
    setFinishing(true)
    setDiscardError(null)
    try {
      await discardWorkout(workout.id)
      setConfirmDiscard(false)
      onFinished()
    } catch (e: any) {
      setDiscardError(e?.message ?? "Failed to discard workout")
    } finally {
      setFinishing(false)
    }
  }

  const handleRemoveExercise = (weId: string) => {
    setConfirmRemoveEx(weId)
  }

  const doRemoveExercise = async () => {
    if (!confirmRemoveEx) return
    const idToRemove = confirmRemoveEx
    const snapshot = logsRef.current
    setRemovingEx(true)
    setRemoveExError(null)
    setLogs((cur) => cur.filter((e) => e.id !== idToRemove))
    setConfirmRemoveEx(null)
    try {
      await removeExerciseFromWorkout(idToRemove)
    } catch (e: any) {
      setLogs(snapshot)
      setConfirmRemoveEx(idToRemove)
      setRemoveExError(e?.message ?? "Failed to remove exercise")
    } finally {
      setRemovingEx(false)
    }
  }

  const handlePickExercises = async (picked: Exercise[]) => {
    setPickerAdding(true)
    try {
      // Use a local counter for position. React batches state updates across
      // the awaits in this loop, so logsRef.current.length never increments
      // between iterations — every exercise would get the same position
      // and the UNIQUE(workout_id, position) constraint on workout_exercises
      // would silently fail every insert after the first (catch swallows
      // the error, the user sees a partial add).
      let position = logsRef.current.length
      for (const ex of picked) {
        position += 1
        try {
          const { workoutExerciseId, initialSet } = await addExerciseToWorkout(
            workout.id,
            ex.id,
            position,
          )
          setLogs((cur) => [
            ...cur,
            { id: workoutExerciseId, exercise: ex, sets: [initialSet] },
          ])
        } catch (e) {
          console.error(e)
        }
      }
    } finally {
      setPickerAdding(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <ScreenHeader
        subtitle="Active session"
        title={title}
        right={
          <button
            onClick={() => setShowFinishMenu((v) => !v)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-secondary ring-inset-border"
          >
            <MoreVertical className="h-4 w-4" />
            {showFinishMenu && (
              <div className="absolute right-0 top-12 z-20 w-44 rounded-xl bg-card p-1 text-left text-sm shadow-card ring-inset-border">
                <button
                  onClick={(e) => { e.stopPropagation(); setRenameOpen(true); setShowFinishMenu(false) }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-secondary/60"
                >
                  <Pencil className="h-3.5 w-3.5" /> Rename
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDiscard(); setShowFinishMenu(false) }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Discard workout
                </button>
              </div>
            )}
          </button>
        }
      />

      {/* Session summary */}
      <div className="px-5">
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-3 divide-x divide-border/60">
            <SummaryCell label="Duration" value={<DurationDisplay startedAt={startedAtMs} />} icon={<Timer className="h-3.5 w-3.5" />} />
            <SummaryCell label="Reps" value={`${totalReps}`} icon={<Flame className="h-3.5 w-3.5" />} />
            <SummaryCell label="Sets" value={`${completedSets}/${totalSets}`} icon={<Check className="h-3.5 w-3.5" />} />
          </div>
          <div className="px-4 pb-3">
            <Progress value={progress} />
          </div>
        </Card>
      </div>

      {/* Rest timer */}
      {session.restEndsAt != null && (
        <RestTimerCard endsAt={session.restEndsAt} onClear={session.clearRest} />
      )}

      {/* Exercises */}
      <div className="flex flex-col gap-3 px-5">
        {logs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No exercises yet. Tap "Add exercise" below.
          </Card>
        ) : logs.map((log, idx) => {
          const isCollapsed = session.collapsed[log.id]
          const exCompleted = log.sets.filter((s) => s.done).length
          return (
            <Card key={log.id} className="p-0 overflow-hidden">
              <div className="flex w-full items-center gap-3 p-4">
                <button
                  onClick={() => session.toggleCollapsed(log.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="tint-blue flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{log.exercise.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {log.exercise.muscle} · {log.exercise.equipment} · {exCompleted}/{log.sets.length}
                    </p>
                  </div>
                  {isCollapsed ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                <button
                  onClick={() => handleRemoveExercise(log.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {!isCollapsed && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-[28px_1fr_1fr_1fr_32px_32px] items-center gap-2 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="text-center">Set</span>
                    <span className="text-center">Weight</span>
                    <span className="text-center">Reps</span>
                    <span className="text-center">Rest</span>
                    <span />
                    <span />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {log.sets.map((set, i) => (
                      <SetRow
                        key={set.id}
                        index={i + 1}
                        set={set}
                        exId={log.id}
                        exerciseName={log.exercise.name}
                        onToggle={handleToggle}
                        onEdit={handleEditSet}
                        onDelete={handleDeleteSet}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => handleAddSet(log.id)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add set
                  </button>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Add exercise */}
      <div className="px-5 pt-2">
        <Button variant="secondary" className="w-full" onClick={() => setPickerOpen(true)}>
          <Plus className="h-4 w-4" /> Add exercise
        </Button>
      </div>

      {/* Finish */}
      <div className="px-5 pt-2">
        <Button size="lg" className="w-full" onClick={handleFinish} disabled={finishing}>
          {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish workout"}
        </Button>
      </div>

      {/* Conditional render keeps data hooks (esp. useExercises in the
          picker) from firing while these sheets are closed. */}
      {pickerOpen && (
        <ExercisePickerSheet
          open={pickerOpen}
          onOpenChange={(o) => { if (!pickerAdding) setPickerOpen(o) }}
          multi
          excludeIds={logs.map((l) => l.exercise.id)}
          onPick={handlePickExercises}
        />
      )}

      {editSet && (
        <SetEditorSheet
          set={editSet.set}
          exerciseName={editSet.exerciseName}
          onOpenChange={(o) => !o && setEditSet(null)}
          onPatched={handleSetPatched}
          onDeleted={handleSetDeletedFromSheet}
        />
      )}

      {confirmDiscard && (
        <ConfirmDialog
          open={confirmDiscard}
          onOpenChange={(o) => { setConfirmDiscard(o); if (!o) setDiscardError(null) }}
          title="Discard this workout?"
          description="All sets in this session will be lost. This can't be undone."
          confirmLabel="Discard"
          busy={finishing}
          error={discardError}
          onConfirm={doDiscard}
        />
      )}

      {confirmRemoveEx !== null && (
        <ConfirmDialog
          open={confirmRemoveEx !== null}
          onOpenChange={(o) => { if (!o) { setConfirmRemoveEx(null); setRemoveExError(null) } }}
          title="Remove this exercise?"
          description="The exercise and its sets will be removed from this workout."
          confirmLabel="Remove"
          busy={removingEx}
          error={removeExError}
          onConfirm={doRemoveExercise}
        />
      )}

      {renameOpen && (
        <WorkoutTitleEditSheet
          open={renameOpen}
          onOpenChange={setRenameOpen}
          workoutId={workout.id}
          currentTitle={title}
          onSaved={setTitle}
        />
      )}
    </div>
  )
}

function fmtElapsed(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

type SetRowProps = {
  index: number
  set: SetEntry
  exId: string
  exerciseName: string
  onToggle: (exId: string, setId: string, exerciseName: string) => void
  onEdit: (exId: string, setId: string, exerciseName: string) => void
  onDelete: (exId: string, setId: string) => void
}

const SetRow = React.memo(function SetRow({
  index, set, exId, exerciseName, onToggle, onEdit, onDelete,
}: SetRowProps) {
  const handleEdit = () => onEdit(exId, set.id, exerciseName)
  return (
    <div
      className={cn(
        "grid grid-cols-[28px_1fr_1fr_1fr_32px_32px] items-center gap-2 rounded-lg px-2 py-2 transition-colors",
        set.done && "bg-primary/10"
      )}
    >
      <span className={cn("text-center text-xs font-semibold", set.done ? "text-primary" : "text-muted-foreground")}>{index}</span>
      <button
        onClick={handleEdit}
        className="num flex items-baseline justify-center gap-0.5 rounded-md px-1 py-0.5 text-sm font-semibold hover:bg-secondary/60"
      >
        {set.weight}
        <span className="text-[10px] font-normal text-muted-foreground">kg</span>
      </button>
      <button
        onClick={handleEdit}
        className="num flex items-baseline justify-center gap-0.5 rounded-md px-1 py-0.5 text-sm font-semibold hover:bg-secondary/60"
      >
        {set.reps}
        <span className="text-[10px] font-normal text-muted-foreground">reps</span>
      </button>
      <button
        onClick={handleEdit}
        className="num rounded-md py-0.5 text-center text-xs text-muted-foreground hover:bg-secondary/60"
      >
        {set.rest != null && set.rest > 0 ? fmtRest(set.rest) : "—"}
      </button>
      <button
        onClick={() => onDelete(exId, set.id)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label="Delete set"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onToggle(exId, set.id, exerciseName)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
          set.done
            ? "gradient-primary text-white shadow-soft"
            : "bg-secondary text-muted-foreground hover:bg-secondary/70 ring-inset-border"
        )}
      >
        {set.isPR && set.done ? <Trophy className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" strokeWidth={3} />}
      </button>
    </div>
  )
})

function fmtRest(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}m` : `${m}:${String(s).padStart(2, "0")}`
}

function SummaryCell({
  label, value, icon,
}: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-3">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className="num text-lg font-bold">{value}</p>
    </div>
  )
}
