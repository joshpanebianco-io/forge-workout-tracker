import * as React from "react"
import { Search, Check, Plus, ArrowLeft, Loader2 } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { Exercise, MuscleGroup } from "@/lib/types"
import { useExercises, createExercise } from "@/lib/api"
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

  React.useEffect(() => {
    if (!open) {
      setQ("")
      setSelected(new Set())
      setCreating(false)
      setNewName("")
      setError(null)
    }
  }, [open])

  const filtered = React.useMemo(() => {
    const norm = q.trim().toLowerCase()
    return exercises
      .filter((e) => !excludeIds.includes(e.id))
      .filter((e) =>
        !norm ||
        e.name.toLowerCase().includes(norm) ||
        e.muscle.toLowerCase().includes(norm) ||
        e.equipment.toLowerCase().includes(norm)
      )
  }, [exercises, q, excludeIds])

  const toggle = (id: string) => {
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

  const confirm = () => {
    const picked = exercises.filter((e) => selected.has(e.id))
    onPick(picked)
    onOpenChange(false)
  }

  const startCreate = () => {
    setNewName(q)
    setCreating(true)
    setError(null)
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
              placeholder="Cable Lateral Raise"
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
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center text-xs text-muted-foreground">
              <p>No exercises match "{q}".</p>
              <Button size="sm" variant="secondary" onClick={startCreate}>
                <Plus className="h-3.5 w-3.5" /> Create "{q || "new exercise"}"
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map((e) => {
                const isOn = selected.has(e.id)
                return (
                  <button
                    key={e.id}
                    onClick={() => toggle(e.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl bg-card p-3 text-left ring-inset-border transition-colors hover:bg-secondary/40",
                      multi && isOn && "bg-primary/10 ring-2 ring-primary/40"
                    )}
                  >
                    <div className="tint-blue flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <span className="text-[10px] font-bold uppercase">{e.muscle.slice(0, 3)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.muscle} · {e.equipment}</p>
                    </div>
                    {multi && isOn && <Check className="h-4 w-4 text-primary" />}
                  </button>
                )
              })}
            </div>
          )}

          {!loading && filtered.length > 0 && (
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
