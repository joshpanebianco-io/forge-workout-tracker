import * as React from "react"
import { Clock, Dumbbell, Flame, Trophy, Trash2, Loader2, Pencil } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useWorkout, discardWorkout } from "@/lib/api"
import { WorkoutTitleEditSheet } from "@/components/WorkoutTitleEditSheet"
import { relativeDay, formatTime } from "@/lib/utils"

export function WorkoutDetailSheet({
  workoutId, onOpenChange, onDeleted, onChanged,
}: {
  workoutId: string | null
  onOpenChange: (o: boolean) => void
  onDeleted?: () => void
  onChanged?: () => void
}) {
  const { data: w, loading, refetch } = useWorkout(workoutId)
  const open = workoutId !== null
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [renameOpen, setRenameOpen] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setConfirmOpen(false)
      setDeleteError(null)
      setRenameOpen(false)
    }
  }, [open])

  const doDelete = async () => {
    if (!w) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await discardWorkout(w.id)
      setConfirmOpen(false)
      onDeleted?.()
      onOpenChange(false)
    } catch (e: any) {
      setDeleteError(e?.message ?? "Failed to delete")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={w?.title ?? "Workout"}>
      {loading || !w ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs text-muted-foreground">
              {relativeDay(w.date)} · {new Date(w.date).toLocaleDateString(undefined, {
                weekday: "short", day: "numeric", month: "short", year: "numeric",
              })} <span className="num">· {formatTime(w.date)}</span>
            </p>
            <button
              onClick={() => setRenameOpen(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              <Pencil className="h-3 w-3" /> Rename
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatBox icon={<Clock className="h-3.5 w-3.5" />} label="Duration" value={`${w.durationMin}m`} />
            <StatBox icon={<Flame className="h-3.5 w-3.5" />} label="Sets" value={`${w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)}`} />
            <StatBox icon={<Dumbbell className="h-3.5 w-3.5" />} label="Exercises" value={`${w.exercises.length}`} />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            {w.exercises.map((log, idx) => {
              const completedSets = log.sets.filter((s) => s.done).length
              return (
                <Card key={log.id} className="p-3">
                  <div className="flex items-start gap-2">
                    <span className="tint-blue flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{log.exercise.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {log.exercise.muscle} · {completedSets}/{log.sets.length} sets
                      </p>
                    </div>
                    {log.sets.some((s) => s.isPR) && (
                      <Badge variant="warning"><Trophy className="h-2.5 w-2.5" />PR</Badge>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-[28px_1fr_1fr_1fr] items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="text-center">Set</span>
                    <span className="text-center">Weight</span>
                    <span className="text-center">Reps</span>
                    <span className="text-center">Rest</span>
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {log.sets.map((set, i) => (
                      <div
                        key={set.id}
                        className={`grid grid-cols-[28px_1fr_1fr_1fr] items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                          set.done ? "bg-primary/10" : "opacity-60"
                        }`}
                      >
                        <span className="text-center font-semibold text-muted-foreground">{i + 1}</span>
                        <span className="num flex items-baseline justify-center gap-0.5 font-semibold">
                          {set.weight}
                          <span className="text-[9px] font-normal text-muted-foreground">kg</span>
                        </span>
                        <span className="num flex items-baseline justify-center gap-0.5 font-semibold">
                          {set.reps}
                          <span className="text-[9px] font-normal text-muted-foreground">reps</span>
                        </span>
                        <span className="num text-center text-muted-foreground">
                          {set.rest != null && set.rest > 0 ? fmtRest(set.rest) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>

          <button
            onClick={() => { setDeleteError(null); setConfirmOpen(true) }}
            disabled={deleting}
            className="mt-3 inline-flex items-center justify-center gap-1.5 self-center px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Delete workout
          </button>
        </div>
      )}

      {confirmOpen && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={(o) => { if (!o) { setConfirmOpen(false); setDeleteError(null) } }}
          title={w ? `Delete "${w.title}"?` : "Delete workout?"}
          description="This permanently removes the workout, its exercises, and all logged sets. This can't be undone."
          confirmLabel="Delete"
          busy={deleting}
          error={deleteError}
          onConfirm={doDelete}
        />
      )}

      {renameOpen && (
        <WorkoutTitleEditSheet
          open={renameOpen}
          onOpenChange={setRenameOpen}
          workoutId={w?.id ?? null}
          currentTitle={w?.title ?? ""}
          onSaved={() => { refetch(); onChanged?.() }}
        />
      )}
    </Sheet>
  )
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className="num mt-1 text-base font-bold">{value}</p>
    </Card>
  )
}

function fmtRest(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}m` : `${m}:${String(s).padStart(2, "0")}`
}
