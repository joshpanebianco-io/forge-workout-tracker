import * as React from "react"
import { Clock, Dumbbell, Flame, Trophy, ChevronRight, ChevronLeft, Loader2, Calendar } from "lucide-react"
import { ScreenHeader } from "@/components/ScreenHeader"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useWeeklyWorkouts, useStats, useHistoryStats } from "@/lib/api"
import {
  addDays, isSameDay, relativeDay, startOfWeek, formatWeekRange, weekLabel, cn,
} from "@/lib/utils"
import { WorkoutDetailSheet } from "@/components/WorkoutDetailSheet"
import { DatePickerSheet } from "@/components/DatePickerSheet"

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"]

export function History() {
  const today = React.useMemo(() => new Date(), [])
  const thisWeekStart = React.useMemo(() => startOfWeek(today), [today])

  const [weekStart, setWeekStart] = React.useState<Date>(thisWeekStart)
  const { data: weekWorkouts, loading } = useWeeklyWorkouts(weekStart)
  const { data: stats } = useStats()
  const { data: history } = useHistoryStats()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)

  const completedThisWeek = weekWorkouts.filter((w) => w.durationMin > 0)
  const summary = React.useMemo(() => {
    let sessions = 0
    let minutes = 0
    let prCount = 0
    for (const w of completedThisWeek) {
      sessions++
      minutes += w.durationMin
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          if (s.isPR) prCount++
        }
      }
    }
    return { sessions, minutes, prCount }
  }, [completedThisWeek])

  const dayDots = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i)
      const has = weekWorkouts.some((w) => isSameDay(new Date(w.date), day))
      const isToday = isSameDay(day, today)
      const isFuture = day.getTime() > today.getTime() && !isSameDay(day, today)
      return { day, has, isToday, isFuture }
    })
  }, [weekStart, weekWorkouts, today])

  const isCurrentWeek = isSameDay(weekStart, thisWeekStart)
  const canGoForward = !isCurrentWeek
  const label = weekLabel(weekStart, today)
  const rangeStr = formatWeekRange(weekStart)
  const showRangeSubtitle = label !== rangeStr

  const goPrev = () => setWeekStart((d) => addDays(d, -7))
  const goNext = () => canGoForward && setWeekStart((d) => addDays(d, 7))
  const handlePickDate = (date: Date) => setWeekStart(startOfWeek(date))

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="History" subtitle="Past sessions" />

      {/* All-time stats */}
      <div className="px-5">
        <Card className="grid grid-cols-3 divide-x divide-border/60 p-0">
          <Cell big={`${stats.totalWorkouts}`} label="Total" />
          <Cell big={`${history.monthCount}`} label="This month" />
          <Cell big={`${history.avgHoursPerWeek.toFixed(1)}h`} label="Avg / wk" />
        </Card>
      </div>

      {/* Week navigator */}
      <div className="px-5">
        <Card className="p-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={goPrev}
              className="flex h-9 w-9 items-center justify-center rounded-lg ring-inset-border bg-secondary/60 hover:bg-secondary"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              onClick={() => setPickerOpen(true)}
              className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg py-0.5 hover:bg-secondary/40"
            >
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex min-w-0 flex-col items-center">
                <span className="text-sm font-semibold leading-tight">{label}</span>
                {showRangeSubtitle && (
                  <span className="text-[11px] text-muted-foreground">{rangeStr}</span>
                )}
              </div>
            </button>

            <button
              onClick={goNext}
              disabled={!canGoForward}
              className="flex h-9 w-9 items-center justify-center rounded-lg ring-inset-border bg-secondary/60 hover:bg-secondary disabled:opacity-30 disabled:hover:bg-secondary/60"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day strip */}
          <div className="mt-3 grid grid-cols-7 gap-1">
            {dayDots.map(({ day, has, isToday, isFuture }, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider",
                    isToday ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {DAY_INITIALS[i]}
                </span>
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-semibold",
                    isFuture && "opacity-30",
                    has
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : isToday
                      ? "ring-2 ring-primary text-primary"
                      : "bg-secondary/60 text-muted-foreground ring-inset-border"
                  )}
                >
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Week summary */}
      <div className="px-5">
        <Card className="grid grid-cols-3 divide-x divide-border/60 p-0">
          <Mini big={`${summary.sessions}`} label="Sessions" />
          <Mini big={fmtHours(summary.minutes)} label="Time" />
          <Mini big={`${summary.prCount}`} label="PRs" />
        </Card>
      </div>

      {/* Workouts list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : completedThisWeek.length === 0 ? (
        <div className="px-5">
          <Card className="p-6 text-center text-sm text-muted-foreground">
            {isCurrentWeek
              ? "No workouts logged this week yet."
              : "No workouts in this week."}
          </Card>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 px-5 pb-2">
          {completedThisWeek.map((w) => {
            const prCount = w.exercises.reduce(
              (n, e) => n + e.sets.filter((s) => s.isPR).length, 0
            )
            const setCount = w.exercises.reduce(
              (n, e) => n + e.sets.filter((s) => s.done).length, 0
            )
            return (
              <Card key={w.id} className="overflow-hidden p-0">
                <button
                  onClick={() => setOpenId(w.id)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-secondary/40"
                >
                  <div className="tint-blue flex h-12 w-12 flex-col items-center justify-center rounded-xl">
                    <span className="num text-base font-bold leading-none">
                      {new Date(w.date).getDate()}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider opacity-80">
                      {new Date(w.date).toLocaleDateString(undefined, { month: "short" })}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{w.title}</p>
                      {prCount > 0 && (
                        <Badge variant="warning">
                          <Trophy className="h-2.5 w-2.5" /> {prCount}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{relativeDay(w.date)}</p>

                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Dumbbell className="h-3 w-3" />
                        {w.exercises.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {w.durationMin}m
                      </span>
                      <span className="flex items-center gap-1">
                        <Flame className="h-3 w-3" />
                        {setCount} {setCount === 1 ? "set" : "sets"}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </Card>
            )
          })}
        </div>
      )}

      <WorkoutDetailSheet workoutId={openId} onOpenChange={(o) => !o && setOpenId(null)} />

      <DatePickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedWeekStart={weekStart}
        onPick={handlePickDate}
      />
    </div>
  )
}

function fmtHours(minutes: number) {
  if (minutes === 0) return "0m"
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function Cell({ big, label }: { big: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4">
      <p className="num text-xl font-bold">{big}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}

function Mini({ big, label }: { big: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-3">
      <p className="num text-sm font-bold leading-tight">{big}</p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}
