import * as React from "react"
import { Plus, Trash2, GripVertical, Loader2 } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"
import {
  createRoutine, updateRoutine, deleteRoutine, useExercises, type RoutineDraft,
} from "@/lib/api"
import { ExercisePickerSheet } from "@/components/ExercisePickerSheet"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { Routine } from "@/lib/types"
import { cn } from "@/lib/utils"

const COLORS = [
  { id: "from-blue-500 to-indigo-500", swatch: "from-blue-500 to-indigo-500" },
  { id: "from-sky-400 to-cyan-500", swatch: "from-sky-400 to-cyan-500" },
  { id: "from-indigo-500 to-violet-500", swatch: "from-indigo-500 to-violet-500" },
  { id: "from-emerald-500 to-teal-500", swatch: "from-emerald-500 to-teal-500" },
  { id: "from-amber-500 to-orange-500", swatch: "from-amber-500 to-orange-500" },
  { id: "from-rose-500 to-pink-500", swatch: "from-rose-500 to-pink-500" },
]

export function RoutineSheet({
  open, onOpenChange, onSaved, routine,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
  routine?: Routine | null
}) {
  const { user } = useAuth()
  const { data: exercises } = useExercises()
  const isEdit = !!routine

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [schedule, setSchedule] = React.useState("")
  const [color, setColor] = React.useState(COLORS[0].id)
  const [items, setItems] = React.useState<RoutineDraft["exercises"]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    if (routine) {
      setName(routine.name)
      setDescription(routine.description ?? "")
      setSchedule(routine.schedule ?? "")
      setColor(routine.color)
      setItems(routine.exercises)
    } else {
      setName("")
      setDescription("")
      setSchedule("")
      setColor(COLORS[0].id)
      setItems([])
    }
    setError(null)
  }, [open, routine])

  const lookup = (id: string) => exercises.find((e) => e.id === id)

  const save = async () => {
    if (!user) return
    if (!name.trim()) { setError("Name required"); return }
    setError(null)
    setSaving(true)
    try {
      const draft: RoutineDraft = {
        name: name.trim(),
        description: description.trim() || undefined,
        schedule: schedule.trim() || undefined,
        color,
        exercises: items,
      }
      if (routine) await updateRoutine(routine.id, draft)
      else await createRoutine(user.id, draft)
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!routine) return
    setDeleting(true)
    try {
      await deleteRoutine(routine.id)
      setConfirmDelete(false)
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={isEdit ? "Edit routine" : "New routine"}>
        <div className="flex flex-col gap-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Push Day" />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Chest, shoulders, triceps"
            />
          </div>
          <div>
            <Label>Schedule</Label>
            <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Mon · Thu" />
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  className={cn(
                    `h-8 w-8 rounded-full bg-gradient-to-br ${c.swatch} transition-transform`,
                    color === c.id ? "ring-2 ring-foreground ring-offset-2 scale-110" : ""
                  )}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Exercises</Label>
              <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            {items.length === 0 ? (
              <Card className="p-4 text-center text-xs text-muted-foreground">
                No exercises yet. Tap "Add" to pick from your library.
              </Card>
            ) : (
              <div className="flex flex-col gap-1.5">
                {items.map((it, idx) => {
                  const ex = lookup(it.exerciseId)
                  return (
                    <Card key={it.exerciseId + idx} className="flex items-center gap-2 p-3">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{ex?.name ?? "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{ex?.muscle ?? ""}</p>
                      </div>
                      <NumberCell
                        label="sets"
                        value={it.sets}
                        onChange={(v) =>
                          setItems((arr) => arr.map((r, i) => i === idx ? { ...r, sets: Math.max(1, v) } : r))
                        }
                      />
                      <input
                        value={it.targetReps}
                        onChange={(e) =>
                          setItems((arr) => arr.map((r, i) => i === idx ? { ...r, targetReps: e.target.value } : r))
                        }
                        placeholder="8-10"
                        className="num h-9 w-16 rounded-lg bg-secondary/60 px-2 text-center text-sm font-semibold ring-inset-border focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={save} disabled={saving} size="lg">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "Save changes" : "Create routine"}
            </Button>
            {isEdit && (
              <Button onClick={() => setConfirmDelete(true)} disabled={deleting} variant="destructive">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete routine"}
              </Button>
            )}
          </div>
        </div>
      </Sheet>

      <ExercisePickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multi
        excludeIds={items.map((i) => i.exerciseId)}
        onPick={(picked) =>
          setItems((arr) => [
            ...arr,
            ...picked.map((p) => ({ exerciseId: p.id, sets: 3, targetReps: "8-10" })),
          ])
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this routine?"
        description="This routine and its exercises will be removed. This can't be undone."
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={doDelete}
      />
    </>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  )
}

function NumberCell({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="num h-9 w-12 rounded-lg bg-secondary/60 px-2 text-center text-sm font-semibold ring-inset-border focus:outline-none focus:ring-2 focus:ring-ring"
        min={1}
      />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  )
}
