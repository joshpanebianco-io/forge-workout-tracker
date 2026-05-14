import { ChevronRight, Plus } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Card } from "@/components/ui/card"
import type { Routine } from "@/lib/types"

export function RoutineListSheet({
  open,
  onOpenChange,
  routines,
  onSelect,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  routines: Routine[]
  onSelect: (r: Routine) => void
  onCreate: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Your routines">
      <div className="flex flex-col gap-2.5">
        {routines.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No routines yet.
          </Card>
        ) : (
          routines.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onSelect(r)
                onOpenChange(false)
              }}
              className="text-left"
            >
              <Card className="overflow-hidden p-0">
                <div className="flex items-center gap-3 p-3">
                  <div className={`h-12 w-1.5 shrink-0 rounded-full bg-gradient-to-b ${r.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {r.description || `${r.exercises.length} exercises`}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.exercises.length} ex {r.schedule && `· ${r.schedule}`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </Card>
            </button>
          ))
        )}

        <button
          onClick={() => {
            onCreate()
            onOpenChange(false)
          }}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card/60 py-3 text-sm font-semibold text-muted-foreground hover:bg-card hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> New routine
        </button>
      </div>
    </Sheet>
  )
}
