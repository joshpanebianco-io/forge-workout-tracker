import * as React from "react"
import { ChevronRight, Plus, GripVertical } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { Card } from "@/components/ui/card"
import type { Routine } from "@/lib/types"
import { reorderRoutines } from "@/lib/api"
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

export function RoutineListSheet({
  open,
  onOpenChange,
  routines,
  onSelect,
  onCreate,
  onChanged,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  routines: Routine[]
  onSelect: (r: Routine) => void
  onCreate: () => void
  onChanged?: () => void
}) {
  const [items, setItems] = React.useState<Routine[]>(routines)

  React.useEffect(() => {
    setItems(routines)
  }, [routines])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((r) => r.id === active.id)
    const newIndex = items.findIndex((r) => r.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const prev = items
    const next = arrayMove(items, oldIndex, newIndex)
    setItems(next)
    try {
      await reorderRoutines(next.map((r) => r.id))
      onChanged?.()
    } catch {
      setItems(prev)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Your routines">
      <div className="flex flex-col gap-2.5">
        {items.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No routines yet.
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2.5">
                {items.map((r) => (
                  <SortableRoutineRow
                    key={r.id}
                    routine={r}
                    onSelect={() => {
                      onSelect(r)
                      onOpenChange(false)
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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

function SortableRoutineRow({
  routine: r,
  onSelect,
}: {
  routine: Routine
  onSelect: () => void
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: r.id })

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
        "overflow-hidden p-0",
        isDragging && "opacity-70 shadow-card"
      )}
    >
      <div className="flex items-center gap-1 p-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="-ml-1 flex h-12 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
        </button>
      </div>
    </Card>
  )
}
