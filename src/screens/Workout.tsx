import * as React from "react"
import {
  Check, Plus, Timer, Trophy, Flame, X, ChevronDown, ChevronUp, Loader2, MoreVertical, Trash2,
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
import { SetEditorSheet } from "@/components/SetEditorSheet"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { ExerciseLog, SetEntry, Workout as WorkoutType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useWorkoutSession, useTick, RestDefaults } from "@/lib/session"

export function Workout() {
  const { user } = useAuth()
  const { data: active, loading, refetch } = useActiveWorkout()
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

  return <ActiveSession workout={active} onChange={refetch} />
}

function ActiveSession({ workout, onChange }: { workout: WorkoutType; onChange: () => void }) {
  const [logs, setLogs] = React.useState<ExerciseLog[]>(workout.exercises)
  const [finishing, setFinishing] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [editSet, setEditSet] = React.useState<{ set: SetEntry; exerciseName: string } | null>(null)
  const [showFinishMenu, setShowFinishMenu] = React.useState(false)
  const [confirmDiscard, setConfirmDiscard] = React.useState(false)
  const [discardError, setDiscardError] = React.useState<string | null>(null)
  const [confirmRemoveEx, setConfirmRemoveEx] = React.useState<string | null>(null)
  const [removingEx, setRemovingEx] = React.useState(false)
  const [removeExError, setRemoveExError] = React.useState<string | null>(null)

  const session = useWorkoutSession()
  const now = useTick(1000)

  React.useEffect(() => setLogs(workout.exercises), [workout.id, workout.exercises])

  const logIds = React.useMemo(() => logs.map((l) => l.id), [logs])
  React.useEffect(() => {
    session.syncWorkout(workout.id, logIds)
  }, [workout.id, logIds, session])

  const elapsed = Math.max(0, Math.floor((now - new Date(workout.date).getTime()) / 1000))

  const completedSets = logs.reduce((acc, e) => acc + e.sets.filter((s) => s.done).length, 0)
  const totalSets = logs.reduce((acc, e) => acc + e.sets.length, 0)
  const totalReps = logs.reduce(
    (acc, e) => acc + e.sets.filter((s) => s.done).reduce((a, s) => a + s.reps, 0), 0
  )
  const progress = totalSets === 0 ? 0 : Math.round((completedSets / totalSets) * 100)

  const restRemainingSec = session.restEndsAt != null
    ? Math.max(0, Math.ceil((session.restEndsAt - now) / 1000))
    : null

  const toggle = async (exId: string, setId: string) => {
    const current = logs.find((e) => e.id === exId)?.sets.find((s) => s.id === setId)
    if (!current) return
    if (current.weight === 0 && current.reps === 0 && !current.done) {
      const log = logs.find((e) => e.id === exId)
      if (log) setEditSet({ set: current, exerciseName: log.exercise.name })
      return
    }
    const next = !current.done
    setLogs((prev) =>
      prev.map((e) => e.id === exId
        ? { ...e, sets: e.sets.map((s) => s.id === setId ? { ...s, done: next } : s) }
        : e)
    )
    if (next) session.startRest(current.rest ?? RestDefaults.seconds)
    try { await toggleSetDone(setId, next) }
    catch {
      setLogs((prev) =>
        prev.map((e) => e.id === exId
          ? { ...e, sets: e.sets.map((s) => s.id === setId ? { ...s, done: !next } : s) }
          : e)
      )
    }
  }

  const handleDeleteSet = async (exId: string, setId: string) => {
    const prev = logs
    setLogs((cur) =>
      cur.map((e) => e.id === exId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e)
    )
    try { await deleteSet(setId); onChange() }
    catch { setLogs(prev) }
  }

  const handleAddSet = async (exId: string) => {
    const log = logs.find((e) => e.id === exId)
    const last = log?.sets[log.sets.length - 1]
    try {
      await addSet(exId, last
        ? { weight: last.weight, reps: last.reps, rest: last.rest }
        : null)
      onChange()
    } catch (e) {
      console.error(e)
    }
  }

  const handleFinish = async () => {
    setFinishing(true)
    try {
      const durationMin = Math.max(1, Math.round(elapsed / 60))
      await finishWorkout(workout.id, durationMin)
      onChange()
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
      onChange()
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
    setRemovingEx(true)
    setRemoveExError(null)
    try {
      await removeExerciseFromWorkout(confirmRemoveEx)
      setConfirmRemoveEx(null)
      onChange()
    } catch (e: any) {
      setRemoveExError(e?.message ?? "Failed to remove exercise")
    } finally {
      setRemovingEx(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <ScreenHeader
        subtitle="Active session"
        title={workout.title}
        right={
          <button
            onClick={() => setShowFinishMenu((v) => !v)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-secondary ring-inset-border"
          >
            <MoreVertical className="h-4 w-4" />
            {showFinishMenu && (
              <div className="absolute right-0 top-12 z-20 w-44 rounded-xl bg-card p-1 text-left text-sm shadow-card ring-inset-border">
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
            <SummaryCell label="Duration" value={fmtElapsed(elapsed)} icon={<Timer className="h-3.5 w-3.5" />} />
            <SummaryCell label="Reps" value={`${totalReps}`} icon={<Flame className="h-3.5 w-3.5" />} />
            <SummaryCell label="Sets" value={`${completedSets}/${totalSets}`} icon={<Check className="h-3.5 w-3.5" />} />
          </div>
          <div className="px-4 pb-3">
            <Progress value={progress} />
          </div>
        </Card>
      </div>

      {/* Rest timer */}
      {restRemainingSec !== null && (
        <div className="px-5">
          <Card className="tint-blue flex items-center gap-3 p-4 shadow-none">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <Timer className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
                {restRemainingSec === 0 ? "Rest complete" : "Resting"}
              </p>
              <p className="num text-xl font-bold">
                {Math.floor(restRemainingSec / 60)}:{String(restRemainingSec % 60).padStart(2, "0")}
              </p>
            </div>
            <button
              onClick={() => session.clearRest()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-card/60 hover:bg-card"
            >
              <X className="h-4 w-4" />
            </button>
          </Card>
        </div>
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
                  <div className="grid grid-cols-[16px_1fr_1fr_44px_36px_24px_28px] items-center gap-1.5 px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Set</span>
                    <span>Weight</span>
                    <span>Reps</span>
                    <span className="text-center">Rest</span>
                    <span className="text-center">RIR</span>
                    <span />
                    <span />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {log.sets.map((set, i) => (
                      <SetRow
                        key={set.id}
                        index={i + 1}
                        set={set}
                        onToggle={() => toggle(log.id, set.id)}
                        onEdit={() => setEditSet({ set, exerciseName: log.exercise.name })}
                        onDelete={() => handleDeleteSet(log.id, set.id)}
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

      <ExercisePickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multi
        excludeIds={logs.map((l) => l.exercise.id)}
        onPick={async (picked) => {
          for (const ex of picked) {
            await addExerciseToWorkout(workout.id, ex.id)
          }
          onChange()
        }}
      />

      <SetEditorSheet
        set={editSet?.set ?? null}
        exerciseName={editSet?.exerciseName ?? ""}
        onOpenChange={(o) => !o && setEditSet(null)}
        onSaved={onChange}
      />

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
    </div>
  )
}

function fmtElapsed(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function SetRow({
  index, set, onToggle, onEdit, onDelete,
}: {
  index: number
  set: SetEntry
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[16px_1fr_1fr_44px_36px_24px_28px] items-center gap-1.5 rounded-lg px-1 py-1.5 transition-colors",
        set.done && "bg-primary/10"
      )}
    >
      <span className={cn("text-xs font-semibold", set.done ? "text-primary" : "text-muted-foreground")}>{index}</span>
      <button
        onClick={onEdit}
        className="num flex items-baseline gap-0.5 rounded-md px-1 py-0.5 text-left text-sm font-semibold hover:bg-secondary/60"
      >
        {set.weight}
        <span className="text-[10px] font-normal text-muted-foreground">kg</span>
      </button>
      <button
        onClick={onEdit}
        className="num flex items-baseline gap-0.5 rounded-md px-1 py-0.5 text-left text-sm font-semibold hover:bg-secondary/60"
      >
        {set.reps}
        <span className="text-[10px] font-normal text-muted-foreground">reps</span>
      </button>
      <button
        onClick={onEdit}
        className="num rounded-md py-0.5 text-center text-xs text-muted-foreground hover:bg-secondary/60"
      >
        {set.rest != null && set.rest > 0 ? fmtRest(set.rest) : "—"}
      </button>
      <button onClick={onEdit} className="rounded-md py-0.5 text-center text-xs text-muted-foreground hover:bg-secondary/60">
        {set.rpe ?? "—"}
      </button>
      <button
        onClick={onDelete}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label="Delete set"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onToggle}
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
}

function fmtRest(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}m` : `${m}:${String(s).padStart(2, "0")}`
}

function SummaryCell({
  label, value, icon,
}: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-3">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className="num text-lg font-bold">{value}</p>
    </div>
  )
}
