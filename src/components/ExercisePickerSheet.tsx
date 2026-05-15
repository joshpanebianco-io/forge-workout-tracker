import * as React from "react"
import { Search, Check, Plus, ArrowLeft, Loader2, Trash2, Pencil, ChevronDown, X } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { Exercise, MuscleGroup } from "@/lib/types"
import { useExercises, createExercise, deleteExercise, renameExercise } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

const MUSCLES: MuscleGroup[] = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps",
  "Quads", "Hamstrings", "Glutes", "Calves", "Core", "Full Body",
]
const EQUIPMENT: Exercise["equipment"][] = [
  "Barbell", "Dumbbell", "Machine", "Cable", "Bodyweight", "Kettlebell",
]

export function ExercisePickerSheet({
  open, onOpenChange, onPick, multi = false, excludeIds = [],
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onPick: (exercises: Exercise[]) => void
  multi?: boolean
  excludeIds?: string[]
}) {
  const { user } = useAuth()
  const { data: exercises, loading, refetch } = useExercises()
  const [q, setQ] = React.useState("")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [newMuscle, setNewMuscle] = React.useState<MuscleGroup>("Chest")
  const [newEquipment, setNewEquipment] = React.useState<Exercise["equipment"]>("Barbell")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<Exercise | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState<Set<MuscleGroup>>(new Set())
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState("")
  const [renaming, setRenaming] = React.useState(false)
  const [editError, setEditError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setQ("")
      setSelected(new Set())
      setCreating(false)
      setNewName("")
      setError(null)
      setExpanded(new Set())
      setEditingId(null)
      setEditError(null)
    }
  }, [open])

  const visible = React.useMemo(
    () => exercises.filter((e) => !excludeIds.includes(e.id)),
    [exercises, excludeIds]
  )

  const norm = q.trim().toLowerCase()
  const isSearching = norm.length > 0

  const filtered = React.useMemo(() => {
    if (!isSearching) return visible
    return visible.filter((e) =>
      e.name.toLowerCase().includes(norm) ||
      e.muscle.toLowerCase().includes(norm) ||
      e.equipment.toLowerCase().includes(norm)
    )
  }, [visible, norm, isSearching])

  const grouped = React.useMemo(() => {
    const map = new Map<MuscleGroup, Exercise[]>()
    for (const ex of visible) {
      const arr = map.get(ex.muscle) ?? []
      arr.push(ex)
      map.set(ex.muscle, arr)
    }
    return MUSCLES
      .map((m) => ({ muscle: m, items: (map.get(m) ?? []).sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter((g) => g.items.length > 0)
  }, [visible])

  const toggle = (id: string) => {
    if (editingId) return
    if (!multi) {
      const ex = exercises.find((e) => e.id === id)
      if (ex) {
        onPick([ex])
        onOpenChange(false)
      }
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleGroup = (m: MuscleGroup) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m); else next.add(m)
      return next
    })
  }

  const startEdit = (ex: Exercise) => {
    setEditingId(ex.id)
    setEditName(ex.name)
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditError(null)
  }

  const saveEdit = async () => {
    if (!editingId || !user) return
    const trimmed = editName.trim()
    if (!trimmed) { setEditError("Name required"); return }
    const target = exercises.find((e) => e.id === editingId)
    if (!target) { setEditError("Exercise not found"); return }
    setRenaming(true)
    setEditError(null)
    try {
      await renameExercise({ id: target.id, userId: target.userId ?? null }, user.id, trimmed)
      setEditingId(null)
      refetch()
    } catch (e: any) {
      setEditError(e?.message ?? "Failed to rename")
    } finally {
      setRenaming(false)
    }
  }

  const confirm = () => {
    const byId = new Map(exercises.map((e) => [e.id, e]))
    const picked: Exercise[] = []
    for (const id of selected) {
      const ex = byId.get(id)
      if (ex) picked.push(ex)
    }
    onPick(picked)
    onOpenChange(false)
  }

  const startCreate = () => {
    setNewName(q)
    setCreating(true)
    setError(null)
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteExercise(confirmDelete.id)
      setConfirmDelete(null)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(confirmDelete.id)
        return next
      })
      refetch()
    } catch (e: any) {
      const msg = e?.code === "23503" || /foreign key|violates/i.test(e?.message ?? "")
        ? "Can't delete — this exercise is used in a logged workout or routine."
        : (e?.message ?? "Failed to delete")
      setDeleteError(msg)
    } finally {
      setDeleting(false)
    }
  }

  const saveNew = async () => {
    if (!user) return
    if (!newName.trim()) { setError("Name required"); return }
    setSaving(true)
    setError(null)
    try {
      const ex = await createExercise(user.id, {
        name: newName.trim(),
        muscle: newMuscle,
        equipment: newEquipment,
      })
      refetch()
      if (multi) {
        setSelected((prev) => new Set(prev).add(ex.id))
        setCreating(false)
        setQ("")
      } else {
        onPick([ex])
        onOpenChange(false)
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  const renderRow = (e: Exercise) => {
    const isOn = selected.has(e.id)
    const isEditing = editingId === e.id
    return (
      <div
        key={e.id}
        className={cn(
          "flex items-center gap-2 rounded-xl bg-card p-3 ring-inset-border transition-colors",
          !isEditing && "hover:bg-secondary/40",
          multi && isOn && !isEditing && "bg-primary/10 ring-2 ring-primary/40"
        )}
      >
        {isEditing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Input
              autoFocus
              value={editName}
              onChange={(ev) => setEditName(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") { ev.preventDefault(); saveEdit() }
                else if (ev.key === "Escape") { ev.preventDefault(); cancelEdit() }
              }}
              className="h-9 text-sm"
            />
            {editError && (
              <p className="text-[11px] text-destructive">{editError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={saveEdit} disabled={renaming} className="h-8 px-3 text-xs">
                {renaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={renaming} className="h-8 px-3 text-xs">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => toggle(e.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <div className="tint-blue flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                <span className="text-[10px] font-bold uppercase">{e.muscle.slice(0, 3)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{e.name}</p>
                <p className="truncate text-xs text-muted-foreground">{e.muscle} · {e.equipment}</p>
              </div>
              {multi && isOn && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
            <button
              onClick={() => startEdit(e)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              aria-label={`Rename ${e.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setDeleteError(null); setConfirmDelete(e) }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete ${e.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={creating ? "New exercise" : multi ? "Pick exercises" : "Pick an exercise"}
    >
      {creating ? (
        <div className="flex flex-col gap-4">
          <button
            onClick={() => setCreating(false)}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to picker
          </button>
          <div>
            <Label>Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name this exercise"
            />
          </div>
          <div>
            <Label>Muscle group</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {MUSCLES.map((m) => (
                <button
                  key={m}
                  onClick={() => setNewMuscle(m)}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-semibold ring-inset-border transition-colors",
                    newMuscle === m
                      ? "bg-primary/10 text-primary ring-2 ring-primary"
                      : "bg-card hover:bg-secondary/40"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Equipment</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {EQUIPMENT.map((eq) => (
                <button
                  key={eq}
                  onClick={() => setNewEquipment(eq)}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-semibold ring-inset-border transition-colors",
                    newEquipment === eq
                      ? "bg-primary/10 text-primary ring-2 ring-primary"
                      : "bg-card hover:bg-secondary/40"
                  )}
                >
                  {eq}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}

          <Button onClick={saveNew} disabled={saving} size="lg" className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create exercise"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, muscle, equipment…"
              className="pl-9 pr-9"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
          ) : isSearching ? (
            filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center text-xs text-muted-foreground">
                <p>No exercises match "{q}".</p>
                <Button size="sm" variant="secondary" onClick={startCreate}>
                  <Plus className="h-3.5 w-3.5" /> Create "{q}"
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filtered.map(renderRow)}
              </div>
            )
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center text-xs text-muted-foreground">
              <p>No exercises yet.</p>
              <Button size="sm" variant="secondary" onClick={startCreate}>
                <Plus className="h-3.5 w-3.5" /> Create exercise
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {grouped.map(({ muscle, items }) => {
                const isOpen = expanded.has(muscle)
                const selectedCount = items.filter((e) => selected.has(e.id)).length
                return (
                  <div key={muscle} className="overflow-hidden rounded-xl bg-card ring-inset-border">
                    <button
                      onClick={() => toggleGroup(muscle)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-secondary/40"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          !isOpen && "-rotate-90"
                        )}
                      />
                      <span className="text-sm font-semibold">{muscle}</span>
                      <span className="text-xs text-muted-foreground">{items.length}</span>
                      {multi && selectedCount > 0 && (
                        <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {selectedCount}
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <div className="flex flex-col gap-1.5 border-t border-border/60 p-1.5">
                        {items.map(renderRow)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!loading && (
            <button
              onClick={startCreate}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card/60 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-card hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> New exercise
            </button>
          )}

          {multi && (
            <Button onClick={confirm} disabled={selected.size === 0} className="mt-2 w-full">
              Add {selected.size > 0 ? selected.size : ""} {selected.size === 1 ? "exercise" : "exercises"}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) { setConfirmDelete(null); setDeleteError(null) } }}
        title={confirmDelete ? `Delete "${confirmDelete.name}"?` : "Delete exercise?"}
        description="This removes the exercise from your library. You can only delete exercises that aren't used in any logged workout or routine."
        confirmLabel="Delete"
        busy={deleting}
        error={deleteError}
        onConfirm={doDelete}
      />
    </Sheet>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  )
}
