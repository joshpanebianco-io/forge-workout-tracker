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
import type { Exercise, Routine } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const COLORS = [
  { id: "from-blue-500 to-indigo-500", swatch: "from-blue-500 to-indigo-500" },
  { id: "from-sky-400 to-cyan-500", swatch: "from-sky-400 to-cyan-500" },
  { id: "from-indigo-500 to-violet-500", swatch: "from-indigo-500 to-violet-500" },
  { id: "from-emerald-500 to-teal-500", swatch: "from-emerald-500 to-teal-500" },
  { id: "from-amber-500 to-orange-500", swatch: "from-amber-500 to-orange-500" },
  { id: "from-rose-500 to-pink-500", swatch: "from-rose-500 to-pink-500" },
]

export type RoutineInitialDraft = {
  name?: string
  exercises: { exerciseId: string; sets: number; targetReps: string }[]
}

export function RoutineSheet({
  open, onOpenChange, onSaved, routine, initialDraft,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
  routine?: Routine | null
  // Seeds fields when creating a new routine (no `routine` prop). Used to
  // pre-fill the form from a completed empty workout via "Save as routine".
  initialDraft?: RoutineInitialDraft
}) {
  const { user } = useAuth()
  const { data: exercises, refetch: refetchExercises } = useExercises()
  const isEdit = !!routine

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [schedule, setSchedule] = React.useState("")
  const [color, setColor] = React.useState(COLORS[0].id)
  const [items, setItems] = React.useState<RoutineDraft["exercises"]>([])
  // Newly-picked exercises that may not yet be in the refetched `exercises`
  // list — used as a fallback for lookup so display never flashes "Unknown".
  const [pickCache, setPickCache] = React.useState<Map<string, Exercise>>(new Map())
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    if (routine) {
      setName(routine.name)
      setDescription(routine.description ?? "")
      setSchedule(routine.schedule ?? "")
      setColor(routine.color)
      setItems(routine.exercises)
    } else if (initialDraft) {
      setName(initialDraft.name ?? "")
      setDescription("")
      setSchedule("")
      setColor(COLORS[0].id)
      setItems(initialDraft.exercises)
    } else {
      setName("")
      setDescription("")
      setSchedule("")
      setColor(COLORS[0].id)
      setItems([])
    }
    setError(null)
  }, [open, routine, initialDraft])

  const lookup = (id: string) =>
    exercises.find((e) => e.id === id) ?? pickCache.get(id)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setItems((arr) => {
      const oldIndex = arr.findIndex((i) => i.exerciseId === active.id)
      const newIndex = arr.findIndex((i) => i.exerciseId === over.id)
      if (oldIndex === -1 || newIndex === -1) return arr
      return arrayMove(arr, oldIndex, newIndex)
    })
  }

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
    setDeleteError(null)
    try {
      await deleteRoutine(routine.id)
      setConfirmDelete(false)
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      setDeleteError(e?.message ?? "Failed to delete")
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
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this routine" />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div>
            <Label>Schedule</Label>
            <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Optional schedule" />
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={items.map((it) => it.exerciseId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-1.5">
                    {items.map((it, idx) => (
                      <SortableExerciseRow
                        key={it.exerciseId}
                        id={it.exerciseId}
                        name={lookup(it.exerciseId)?.name ?? "Unknown"}
                        muscle={lookup(it.exerciseId)?.muscle ?? ""}
                        sets={it.sets}
                        targetReps={it.targetReps}
                        onSetsChange={(v) =>
                          setItems((arr) => arr.map((r, i) => i === idx ? { ...r, sets: Math.max(1, v) } : r))
                        }
                        onRepsChange={(v) =>
                          setItems((arr) => arr.map((r, i) => i === idx ? { ...r, targetReps: v } : r))
                        }
                        onRemove={() =>
                          setItems((arr) => arr.filter((_, i) => i !== idx))
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={save} disabled={saving}>
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
        onOpenChange={(o) => {
          setPickerOpen(o)
          // Picker may have created a new exercise; refresh our local cache
          // so lookup() finds it instead of falling back to "Unknown".
          if (!o) refetchExercises()
        }}
        multi
        excludeIds={items.map((i) => i.exerciseId)}
        onPick={(picked) => {
          setItems((arr) => [
            ...arr,
            ...picked.map((p) => ({ exerciseId: p.id, sets: 4, targetReps: "8" })),
          ])
          setPickCache((prev) => {
            const next = new Map(prev)
            for (const p of picked) next.set(p.id, p)
            return next
          })
          refetchExercises()
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => { setConfirmDelete(o); if (!o) setDeleteError(null) }}
        title="Delete this routine?"
        description="This routine and its exercises will be removed. Past workouts logged from it are kept. This can't be undone."
        confirmLabel="Delete"
        busy={deleting}
        error={deleteError}
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

function SortableExerciseRow({
  id, name, muscle, sets, targetReps, onSetsChange, onRepsChange, onRemove,
}: {
  id: string
  name: string
  muscle: string
  sets: number
  targetReps: string
  onSetsChange: (v: number) => void
  onRepsChange: (v: string) => void
  onRemove: () => void
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-3",
        isDragging && "opacity-70 shadow-card"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        // touch-none lives on the handle, not the whole card — otherwise
        // any touch inside the row prevents native scrolling, so the list
        // becomes un-scrollable when the user's finger lands on an item.
        className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{muscle}</p>
      </div>
      <NumberCell label="sets" value={sets} onChange={onSetsChange} />
      <input
        value={targetReps}
        onChange={(e) => onRepsChange(e.target.value)}
        placeholder="reps"
        className="num h-9 w-16 rounded-lg bg-secondary/60 px-2 text-center text-sm font-semibold ring-inset-border placeholder:font-normal placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </Card>
  )
}
