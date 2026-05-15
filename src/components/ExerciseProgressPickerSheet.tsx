import * as React from "react"
import { Search, Activity, ChevronDown, X } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { useTrainedExercises, type TrainedExercise } from "@/lib/api"
import type { MuscleGroup } from "@/lib/types"
import { relativeDay } from "@/lib/utils"
import { cn } from "@/lib/utils"

const MUSCLES: MuscleGroup[] = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps",
  "Quads", "Hamstrings", "Glutes", "Calves", "Core", "Full Body",
]

export function ExerciseProgressPickerSheet({
  open,
  onOpenChange,
  selectedId,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  selectedId: string | null
  onPick: (ex: TrainedExercise) => void
}) {
  const { data: trained, loading } = useTrainedExercises()
  const [q, setQ] = React.useState("")
  const [expanded, setExpanded] = React.useState<Set<MuscleGroup>>(new Set())

  React.useEffect(() => {
    if (!open) {
      setQ("")
      setExpanded(new Set())
    }
  }, [open])

  const norm = q.trim().toLowerCase()
  const isSearching = norm.length > 0

  const filtered = React.useMemo(() => {
    if (!isSearching) return trained
    return trained.filter(
      (e) =>
        e.name.toLowerCase().includes(norm) ||
        e.muscle.toLowerCase().includes(norm)
    )
  }, [trained, norm, isSearching])

  const grouped = React.useMemo(() => {
    const map = new Map<MuscleGroup, TrainedExercise[]>()
    for (const ex of trained) {
      const arr = map.get(ex.muscle) ?? []
      arr.push(ex)
      map.set(ex.muscle, arr)
    }
    return MUSCLES
      .map((m) => ({
        muscle: m,
        items: (map.get(m) ?? []).sort((a, b) =>
          (b.lastTrained > a.lastTrained ? 1 : b.lastTrained < a.lastTrained ? -1 : 0)
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [trained])

  const toggleGroup = (m: MuscleGroup) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m); else next.add(m)
      return next
    })
  }

  const renderRow = (e: TrainedExercise) => {
    const isOn = e.id === selectedId
    return (
      <button
        key={e.id}
        onClick={() => {
          onPick(e)
          onOpenChange(false)
        }}
        className={cn(
          "flex items-center gap-3 rounded-xl bg-card p-3 text-left ring-inset-border transition-colors hover:bg-secondary/40",
          isOn && "bg-primary/10 ring-2 ring-primary/40"
        )}
      >
        <div className="tint-blue flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <span className="text-[10px] font-bold uppercase">{e.muscle.slice(0, 3)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{e.name}</p>
          <p className="text-xs text-muted-foreground">
            {e.muscle} · {e.sessionCount} {e.sessionCount === 1 ? "workout" : "workouts"}
          </p>
        </div>
        {e.lastTrained && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {relativeDay(e.lastTrained)}
          </span>
        )}
      </button>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Pick exercise to track">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or muscle…"
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
        ) : trained.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Activity className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm font-semibold">No history yet</p>
            <p className="text-xs text-muted-foreground">
              Complete a few sets and your exercises will show up here.
            </p>
          </div>
        ) : isSearching ? (
          filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No exercises match "{q}".
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">{filtered.map(renderRow)}</div>
          )
        ) : (
          <div className="flex flex-col gap-1.5">
            {grouped.map(({ muscle, items }) => {
              const isOpen = expanded.has(muscle)
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
      </div>
    </Sheet>
  )
}
