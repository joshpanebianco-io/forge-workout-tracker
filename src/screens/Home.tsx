import * as React from "react"
import { Flame, ChevronRight, Trophy, Plus, Loader2 } from "lucide-react"
import { ScreenHeader } from "@/components/ScreenHeader"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar } from "@/components/ui/avatar"
import {
  useStats, useProfile, useRoutines, useActiveWorkout, usePersonalRecords,
} from "@/lib/api"
import { useTick } from "@/lib/session"
import { WeekStatsGrid } from "@/components/WeekStatsGrid"
import type { Tab } from "@/components/BottomNav"
import type { Routine } from "@/lib/types"

// Routine sheets pull in @dnd-kit/* (~50KB gzip). Lazy + conditional-render
// so the dnd code only loads when a user actually opens a routine, and the
// sheet's own data hooks don't fire on every Home mount.
const RoutineSheet = React.lazy(() =>
  import("@/components/RoutineSheet").then((m) => ({ default: m.RoutineSheet }))
)
const RoutineListSheet = React.lazy(() =>
  import("@/components/RoutineListSheet").then((m) => ({ default: m.RoutineListSheet }))
)

// Leaf component: only this small text re-renders every second so the rest
// of the Home tree doesn't pay the tick cost. useTick already pauses when
// the document is hidden.
function LiveDuration({ startedAt }: { startedAt: number }) {
  const now = useTick(1000)
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000))
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return <>{m}:{String(s).padStart(2, "0")}</>
}

export function Home({
  onNavigate,
}: {
  onNavigate: (t: Tab, opts?: { statsTab?: string }) => void
}) {
  const { data: stats } = useStats()
  const { data: profile } = useProfile()
  const { data: routines, refetch: refetchRoutines } = useRoutines()
  const { data: todayWorkout, loading: workoutLoading } = useActiveWorkout()
  const { data: personalRecords } = usePersonalRecords()

  const [routineSheet, setRoutineSheet] = React.useState<{ open: boolean; routine: Routine | null }>({
    open: false, routine: null,
  })
  const [routineListOpen, setRoutineListOpen] = React.useState(false)

  const visibleRoutines = routines

  const completedSets = todayWorkout?.exercises.reduce(
    (acc, e) => acc + e.sets.filter((s) => s.done).length, 0
  ) ?? 0
  const totalSets = todayWorkout?.exercises.reduce((acc, e) => acc + e.sets.length, 0) ?? 0
  const progress = totalSets === 0 ? 0 : Math.round((completedSets / totalSets) * 100)

  const firstName = profile?.name.split(" ")[0] ?? "there"

  return (
    <div className="flex flex-col gap-5">
      <ScreenHeader
        subtitle={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        title={`Hey, ${firstName}.`}
        right={
          <button onClick={() => onNavigate("profile")} className="rounded-full">
            <Avatar name={profile?.name ?? ""} className="h-10 w-10" />
          </button>
        }
      />

      {/* Streak banner */}
      <div className="px-5">
        <Card className="relative overflow-hidden border-none p-0 shadow-soft">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_55%)]" />
          <div className="relative flex items-center justify-between gap-4 p-5 text-white">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-100">
                <Flame className="h-4 w-4" /> WEEK STREAK
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="num text-[44px] font-bold leading-none">{stats.streak}</span>
                <span className="text-sm text-blue-100">weeks</span>
              </div>
              <p className="mt-1 text-xs text-blue-100/90">
                {stats.streak === 0 ? "Start your first workout." : "Keep it up."}
              </p>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
              <Flame className="h-8 w-8 text-white" strokeWidth={1.5} />
            </div>
          </div>
        </Card>
      </div>

      {/* Today's workout */}
      <div className="px-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Today</h2>
          {todayWorkout && progress < 100 && <Badge variant="default">IN PROGRESS</Badge>}
        </div>
        <Card className="p-0 overflow-hidden">
          <div className="p-5">
            {workoutLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : todayWorkout ? (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {todayWorkout.title}
                    </p>
                    <h3 className="mt-1 font-display text-xl font-bold">
                      {todayWorkout.exercises.length} exercises · {totalSets} sets
                    </h3>
                  </div>
                  <Button size="sm" onClick={() => onNavigate("workout")}>
                    Continue <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {completedSets} of {totalSets} sets · <span className="num"><LiveDuration startedAt={new Date(todayWorkout.date).getTime()} /></span>
                  </span>
                  <span className="num font-semibold text-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="mt-2" />
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    No active session
                  </p>
                  <h3 className="mt-1 font-display text-lg font-bold">Start a workout</h3>
                </div>
                <Button size="sm" onClick={() => onNavigate("workout")}>
                  Start <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick stats */}
      <div className="px-5">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">This week</h2>
        <WeekStatsGrid
          thisWeek={stats.thisWeek}
          lastWeek={stats.lastWeek}
          onTileClick={() => onNavigate("stats", { statsTab: "overview" })}
        />
      </div>

      {/* Routines */}
      <div className="px-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Your routines</h2>
          {routines.length > 0 && (
            <button
              onClick={() => setRoutineListOpen(true)}
              className="text-xs font-semibold text-primary"
            >
              View all
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {visibleRoutines.map((r) => (
            <button
              key={r.id}
              onClick={() => setRoutineSheet({ open: true, routine: r })}
              className="text-left"
            >
              <Card className="relative h-full overflow-hidden p-0">
                <div className={`h-1.5 w-full bg-gradient-to-r ${r.color}`} />
                <div className="p-4">
                  <h3 className="font-display text-base font-bold leading-tight line-clamp-1">{r.name}</h3>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {r.description || `${r.exercises.length} exercises`}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground line-clamp-1">
                      {r.exercises.length} ex {r.schedule && `· ${r.schedule}`}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            </button>
          ))}
          <button
            onClick={() => setRoutineSheet({ open: true, routine: null })}
            className="flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-card/60 text-muted-foreground hover:bg-card"
          >
            <Plus className="h-5 w-5" />
            <span className="text-xs font-semibold">New routine</span>
          </button>
        </div>
      </div>

      {/* Recent PRs */}
      <div className="px-5 pb-2">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Recent PRs</h2>
          <button className="text-xs font-semibold text-primary" onClick={() => onNavigate("stats", { statsTab: "prs" })}>
            View all
          </button>
        </div>
        {personalRecords.length === 0 ? (
          <Card className="p-5 text-center text-xs text-muted-foreground">
            Complete sets in the gym — your PRs will show up here.
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {personalRecords.slice(0, 3).map((pr) => (
              <Card key={pr.exerciseId} className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 ring-1 ring-amber-200">
                  <Trophy className="h-5 w-5 text-amber-600" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{pr.exerciseName}</p>
                  <p className="text-xs text-muted-foreground">
                    Est. 1RM <span className="num text-foreground">{pr.estimated1RM}kg</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-base font-bold">
                    {pr.weight}
                    <span className="text-xs text-muted-foreground"> kg × {pr.reps}</span>
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {routineSheet.open && (
        <React.Suspense fallback={null}>
          <RoutineSheet
            open={routineSheet.open}
            onOpenChange={(o) => setRoutineSheet((s) => ({ ...s, open: o }))}
            routine={routineSheet.routine}
            onSaved={refetchRoutines}
          />
        </React.Suspense>
      )}

      {routineListOpen && (
        <React.Suspense fallback={null}>
          <RoutineListSheet
            open={routineListOpen}
            onOpenChange={setRoutineListOpen}
            routines={routines}
            onSelect={(r) => setRoutineSheet({ open: true, routine: r })}
            onCreate={() => setRoutineSheet({ open: true, routine: null })}
            onChanged={refetchRoutines}
          />
        </React.Suspense>
      )}
    </div>
  )
}

