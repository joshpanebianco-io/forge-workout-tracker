import * as React from "react"
import { Search, Activity } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { useTrainedExercises, type TrainedExercise } from "@/lib/api"
import { relativeDay } from "@/lib/utils"
import { cn } from "@/lib/utils"

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

  React.useEffect(() => {
    if (!open) setQ("")
  }, [open])

  const filtered = React.useMemo(() => {
    const norm = q.trim().toLowerCase()
    if (!norm) return trained
    return trained.filter(
      (e) =>
        e.name.toLowerCase().includes(norm) ||
        e.muscle.toLowerCase().includes(norm)
    )
  }, [trained, q])

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Pick exercise to track">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or muscle…"
            className="pl-9"
          />
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
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No exercises match "{q}".
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((e) => {
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
                      {e.muscle} · {e.sessionCount} {e.sessionCount === 1 ? "session" : "sessions"}
                    </p>
                  </div>
                  {e.lastTrained && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {relativeDay(e.lastTrained)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Sheet>
  )
}
