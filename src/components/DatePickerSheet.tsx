import * as React from "react"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { useMonthWorkoutDates } from "@/lib/api"
import {
  addDays, addMonths, isSameDay, startOfMonth, startOfWeek, cn,
} from "@/lib/utils"

const DAY_HEADERS = ["M", "T", "W", "T", "F", "S", "S"]

export function DatePickerSheet({
  open,
  onOpenChange,
  selectedWeekStart,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  selectedWeekStart: Date
  onPick: (date: Date) => void
}) {
  const today = React.useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [viewMonth, setViewMonth] = React.useState<Date>(() => startOfMonth(selectedWeekStart))

  React.useEffect(() => {
    if (open) setViewMonth(startOfMonth(selectedWeekStart))
  }, [open, selectedWeekStart])

  const { data: workoutDates, loading } = useMonthWorkoutDates(viewMonth)

  const dotSet = React.useMemo(() => {
    const set = new Set<string>()
    for (const iso of workoutDates) {
      const d = new Date(iso)
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    }
    return set
  }, [workoutDates])

  const cells = React.useMemo(() => {
    const monthStart = startOfMonth(viewMonth)
    const firstCell = startOfWeek(monthStart)
    return Array.from({ length: 42 }, (_, i) => {
      const day = addDays(firstCell, i)
      day.setHours(0, 0, 0, 0)
      return {
        day,
        inMonth: day.getMonth() === viewMonth.getMonth(),
        hasWorkout: dotSet.has(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`),
        isToday: isSameDay(day, today),
        isFuture: day.getTime() > today.getTime(),
        isSelectedWeek:
          day.getTime() >= selectedWeekStart.getTime() &&
          day.getTime() < addDays(selectedWeekStart, 7).getTime(),
      }
    })
  }, [viewMonth, dotSet, today, selectedWeekStart])

  const canGoNext = viewMonth.getTime() < startOfMonth(today).getTime()

  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Jump to date">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setViewMonth((m) => addMonths(m, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg ring-inset-border bg-secondary/60 hover:bg-secondary"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="font-display text-base font-semibold">{monthLabel}</p>
          <button
            onClick={() => canGoNext && setViewMonth((m) => addMonths(m, 1))}
            disabled={!canGoNext}
            className="flex h-9 w-9 items-center justify-center rounded-lg ring-inset-border bg-secondary/60 hover:bg-secondary disabled:opacity-30 disabled:hover:bg-secondary/60"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {DAY_HEADERS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div className="relative grid grid-cols-7 gap-1">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-card/80">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {cells.map(({ day, inMonth, hasWorkout, isToday, isFuture, isSelectedWeek }, i) => (
            <button
              key={i}
              disabled={isFuture && !isToday}
              onClick={() => {
                onPick(day)
                onOpenChange(false)
              }}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors",
                !inMonth && "opacity-40",
                isFuture && !isToday && "cursor-default opacity-30",
                isSelectedWeek
                  ? "bg-primary/15 text-primary font-semibold ring-inset-border"
                  : isToday
                  ? "text-primary font-semibold ring-2 ring-primary"
                  : "hover:bg-secondary/60 text-foreground"
              )}
            >
              <span className="num leading-none">{day.getDate()}</span>
              <span
                className={cn(
                  "absolute bottom-1 h-1 w-1 rounded-full",
                  hasWorkout ? "bg-primary" : "bg-transparent"
                )}
              />
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Workout
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded ring-2 ring-primary" /> Today
          </span>
        </div>
      </div>
    </Sheet>
  )
}
