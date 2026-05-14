import * as React from "react"
import {
  Trophy, TrendingUp, TrendingDown, ChevronRight, Activity, Dumbbell, Clock, Flame,
} from "lucide-react"
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts"
import { ScreenHeader } from "@/components/ScreenHeader"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  usePersonalRecords, useStats,
  useTrainedExercises, useExerciseProgress, useTrends,
  type TrainedExercise, type TrendsPeriod,
} from "@/lib/api"
import { ExerciseProgressPickerSheet } from "@/components/ExerciseProgressPickerSheet"
import { relativeDay } from "@/lib/utils"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

const MUSCLE_COLORS: Record<string, string> = {
  Chest: "from-rose-400 to-rose-500",
  Back: "from-blue-400 to-blue-500",
  Shoulders: "from-amber-400 to-amber-500",
  Biceps: "from-violet-400 to-violet-500",
  Triceps: "from-fuchsia-400 to-fuchsia-500",
  Quads: "from-emerald-400 to-emerald-500",
  Hamstrings: "from-teal-400 to-teal-500",
  Glutes: "from-pink-400 to-pink-500",
  Calves: "from-cyan-400 to-cyan-500",
  Core: "from-orange-400 to-orange-500",
  "Full Body": "from-indigo-400 to-indigo-500",
}

type ProgressMetric = "est1rm" | "topweight"

export function Stats() {
  const { data: personalRecords } = usePersonalRecords()
  const { data: stats } = useStats()
  const { data: trained } = useTrainedExercises()
  const { resolved } = useTheme()
  const isDark = resolved === "dark"

  const chart = {
    grid: isDark ? "#1f2937" : "#e5e7eb",
    tick: isDark ? "#94a3b8" : "#64748b",
    tooltipBg: isDark ? "#0f172a" : "#ffffff",
    tooltipBorder: isDark ? "#1f2937" : "#e2e8f0",
    tooltipShadow: isDark ? "0 4px 12px rgba(0,0,0,0.4)" : "0 4px 12px rgba(15,23,42,0.08)",
    tooltipText: isDark ? "#e2e8f0" : "#0f172a",
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      <ScreenHeader title="Stats" subtitle="Progress & PRs" />

      <div className="px-5">
        <Tabs defaultValue="overview">
          <TabsList className="w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="prs">PRs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab stats={stats} chart={chart} />
          </TabsContent>

          <TabsContent value="progress">
            <ProgressTab trained={trained} chart={chart} />
          </TabsContent>

          <TabsContent value="prs">
            <PRsTab personalRecords={personalRecords} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Overview (period-aware combined view)
// ---------------------------------------------------------------------
const PERIODS: { value: TrendsPeriod; label: string }[] = [
  { value: "1W", label: "Week" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "YTD", label: "YTD" },
  { value: "1Y", label: "1Y" },
  { value: "ALL", label: "All" },
]

const PERIOD_PHRASE: Record<TrendsPeriod, string> = {
  "1W": "this week",
  "1M": "last month",
  "3M": "last 3 months",
  "6M": "last 6 months",
  "YTD": "year to date",
  "1Y": "last year",
  "ALL": "all time",
}

function OverviewTab({
  stats, chart,
}: {
  stats: ReturnType<typeof useStats>["data"]
  chart: ChartTheme
}) {
  const [period, setPeriod] = React.useState<TrendsPeriod>("1W")
  const { data, loading } = useTrends(period)
  const isWeek = period === "1W"
  const weeksInPeriod = data.summary.weeksInPeriod || 1

  return (
    <div className="flex flex-col gap-3">
      {/* Period selector */}
      <div className="grid grid-cols-7 gap-1 rounded-xl bg-secondary/60 p-1 ring-inset-border">
        {PERIODS.map((p) => (
          <PeriodChip
            key={p.value}
            active={period === p.value}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </PeriodChip>
        ))}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        {isWeek ? (
          <>
            <DeltaTile
              icon={<Dumbbell className="h-3.5 w-3.5" />}
              label="Sessions"
              value={`${stats.thisWeek.workouts}`}
              delta={stats.thisWeek.workouts - stats.lastWeek.workouts}
            />
            <DeltaTile
              icon={<Flame className="h-3.5 w-3.5" />}
              label="Streak"
              value={`${stats.streak}`}
              delta={0}
              hideZeroDelta
            />
            <DeltaTile
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Time"
              value={fmtTime(stats.thisWeek.minutes)}
              delta={stats.thisWeek.minutes - stats.lastWeek.minutes}
              deltaSuffix="m"
            />
            <DeltaTile
              icon={<Trophy className="h-3.5 w-3.5" />}
              label="PR's"
              value={`${stats.thisWeek.prCount}`}
              delta={stats.thisWeek.prCount - stats.lastWeek.prCount}
            />
          </>
        ) : (
          <>
            <SummaryTile
              icon={<Dumbbell className="h-3.5 w-3.5" />}
              label="Sessions"
              value={`${data.summary.sessions}`}
              sub={`${data.summary.avgSessionsPerWeek.toFixed(1)} / wk avg`}
            />
            <SummaryTile
              icon={<Flame className="h-3.5 w-3.5" />}
              label="Streak"
              value={`${stats.streak}`}
              sub={stats.streak === 1 ? "week" : "weeks"}
            />
            <SummaryTile
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Avg session"
              value={fmtMinutes(data.summary.avgSessionMinutes)}
              sub={`${fmtMinutes(data.summary.totalMinutes)} total`}
            />
            <SummaryTile
              icon={<Trophy className="h-3.5 w-3.5" />}
              label="PR's"
              value={`${data.summary.prCount}`}
              sub={`${(data.summary.prCount / weeksInPeriod * 4.33).toFixed(1)} / mo avg`}
            />
          </>
        )}
      </div>

      {loading && data.weekly.length === 0 ? (
        <Card className="p-6 text-center text-xs text-muted-foreground">Loading…</Card>
      ) : data.summary.sessions === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          <Activity className="mx-auto mb-2 h-7 w-7 opacity-60" strokeWidth={1.5} />
          <p className="font-semibold text-foreground">
            {isWeek ? "No sessions yet this week" : "No sessions in this range"}
          </p>
          <p className="mt-1 text-xs">
            {isWeek ? "Start a workout to see your week take shape." : "Try a longer period."}
          </p>
        </Card>
      ) : (
        <>
          {/* Muscle breakdown */}
          {data.muscleAvg.length > 0 && (
            <Card className="p-4">
              <div className="mb-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Sets per muscle
                </p>
                <p className="mt-1 text-base font-bold">
                  {data.muscleAvg.length} {data.muscleAvg.length === 1 ? "group" : "groups"}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    · {PERIOD_PHRASE[period]}
                  </span>
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {data.muscleAvg.map((r) => {
                  const pct = Math.min(100, (r.avgSetsPerWeek / 25) * 100)
                  return (
                    <div key={r.muscle}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-semibold">{r.muscle}</span>
                        <span className="num text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {isWeek ? r.totalSets : r.avgSetsPerWeek.toFixed(1)}
                          </span>
                          {" "}sets{isWeek ? "" : "/wk"}
                          {!isWeek && (
                            <> · <span className="font-semibold text-foreground">{r.totalSets}</span> total</>
                          )}
                        </span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`relative h-full rounded-full bg-gradient-to-r ${MUSCLE_COLORS[r.muscle] ?? "from-blue-400 to-indigo-500"}`}
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* PR timeline */}
          {data.prs.length > 0 && (
            <Card className="p-0">
              <div className="flex items-end justify-between border-b border-border px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {isWeek ? "PRs this week" : "PRs in this range"}
                </p>
                <p className="num text-[11px] font-semibold text-muted-foreground">
                  {data.prs.length}
                </p>
              </div>
              <div className="divide-y divide-border">
                {data.prs.slice(0, 8).map((pr, idx) => (
                  <div key={`${pr.exerciseId}-${pr.date}-${idx}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 ring-1 ring-amber-200">
                      <Trophy className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{pr.exerciseName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {relativeDay(pr.date)} · est. 1RM {pr.estimated1RM}kg
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num text-sm font-bold">
                        {pr.weight}
                        <span className="text-[10px] text-muted-foreground">kg</span>
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        × {pr.reps}
                      </p>
                    </div>
                  </div>
                ))}
                {data.prs.length > 8 && (
                  <p className="px-4 py-2 text-center text-[11px] text-muted-foreground">
                    +{data.prs.length - 8} more in PRs tab
                  </p>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Progress (per-exercise)
// ---------------------------------------------------------------------
function ProgressTab({
  trained, chart,
}: { trained: TrainedExercise[]; chart: ChartTheme }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [metric, setMetric] = React.useState<ProgressMetric>("topweight")

  React.useEffect(() => {
    if (selectedId) return
    if (trained.length > 0) setSelectedId(trained[0].id)
  }, [trained, selectedId])

  const selected = trained.find((e) => e.id === selectedId) ?? null
  const { data: points, loading } = useExerciseProgress(selectedId)

  if (trained.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <Activity className="mx-auto mb-2 h-7 w-7 opacity-60" strokeWidth={1.5} />
        <p className="font-semibold text-foreground">No trained exercises yet</p>
        <p className="mt-1 text-xs">Log a few sets and progression charts will appear here.</p>
      </Card>
    )
  }

  const chartData = points.map((p) => ({
    date: new Date(p.date).getTime(),
    label: shortDate(p.date),
    est1rm: p.est1RM,
    topweight: p.topWeight,
    topReps: p.topReps,
  }))

  const latest = points[points.length - 1]
  const first = points[0]
  const metricLabel = metric === "est1rm" ? "Est. 1RM" : "Top set"
  const metricUnit = "kg"
  const latestValue = latest
    ? metric === "est1rm" ? latest.est1RM : latest.topWeight
    : 0
  const firstValue = first
    ? metric === "est1rm" ? first.est1RM : first.topWeight
    : 0
  const delta = latestValue - firstValue
  const deltaPct = firstValue > 0 ? (delta / firstValue) * 100 : 0

  return (
    <div className="flex flex-col gap-3">
      {/* Exercise picker button */}
      <button
        onClick={() => setPickerOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left ring-inset-border shadow-card transition-colors hover:bg-secondary/40"
      >
        <div className="tint-blue flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <span className="text-[10px] font-bold uppercase">
            {selected?.muscle.slice(0, 3) ?? "EX"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tracking
          </p>
          <p className="truncate font-display text-base font-bold">
            {selected?.name ?? "Pick exercise"}
          </p>
          {selected && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected.muscle} · {selected.sessionCount}{" "}
              {selected.sessionCount === 1 ? "session" : "sessions"}
              {selected.lastTrained && ` · ${relativeDay(selected.lastTrained)}`}
            </p>
          )}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>

      {/* Metric toggle */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-secondary/60 p-1 ring-inset-border">
        <MetricChip active={metric === "topweight"} onClick={() => setMetric("topweight")}>
          Top set
        </MetricChip>
        <MetricChip active={metric === "est1rm"} onClick={() => setMetric("est1rm")}>
          Est. 1RM
        </MetricChip>
      </div>

      {/* Chart card */}
      <Card className="p-4">
        {loading ? (
          <p className="py-12 text-center text-xs text-muted-foreground">Loading…</p>
        ) : points.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">
            No completed sets logged for this exercise yet.
          </p>
        ) : (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {metricLabel}
                </p>
                <p className="num mt-1 text-2xl font-bold">
                  {latestValue}
                  <span className="ml-1 text-base text-muted-foreground">{metricUnit}</span>
                </p>
                {latest && (
                  <p className="num mt-0.5 text-[11px] text-muted-foreground">
                    {latest.topWeight}kg × {latest.topReps}
                  </p>
                )}
              </div>
              {points.length >= 2 && (
                <DeltaPill value={delta} pct={deltaPct} unit={metricUnit} />
              )}
            </div>

            {points.length >= 2 ? (
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                    <defs>
                      <linearGradient id="progGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#6366f1" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chart.tick, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fill: chart.tick, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      domain={["dataMin - 5", "dataMax + 5"]}
                    />
                    <Tooltip
                      cursor={{ stroke: "#3b82f6", strokeDasharray: 3 }}
                      contentStyle={tooltipStyle(chart)}
                      labelStyle={{ color: chart.tooltipText }}
                      itemStyle={{ color: chart.tooltipText }}
                      formatter={(v) => [`${v as number} ${metricUnit}`, metricLabel]}
                    />
                    <Line
                      type="monotone"
                      dataKey={metric}
                      stroke="url(#progGrad)"
                      strokeWidth={3}
                      dot={{ fill: "#3b82f6", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-6 text-center text-xs text-muted-foreground">
                Log another session to see a trend.
              </p>
            )}
          </>
        )}
      </Card>

      {/* Recent sessions */}
      {points.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recent sessions
            </p>
          </div>
          <div className="divide-y divide-border">
            {[...points].reverse().slice(0, 6).map((p) => (
              <div key={p.date} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{shortDate(p.date)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.totalSets} {p.totalSets === 1 ? "set" : "sets"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-sm font-bold">
                    {p.topWeight}
                    <span className="text-[10px] text-muted-foreground"> kg × {p.topReps}</span>
                  </p>
                  <p className="num text-[11px] text-muted-foreground">
                    est. {p.est1RM}kg
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ExerciseProgressPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedId={selectedId}
        onPick={(e) => setSelectedId(e.id)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------
// PRs
// ---------------------------------------------------------------------
function PRsTab({ personalRecords }: { personalRecords: ReturnType<typeof usePersonalRecords>["data"] }) {
  if (personalRecords.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No PRs yet — complete sets to start tracking.
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {personalRecords.map((pr) => (
        <Card key={pr.exerciseId} className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 ring-1 ring-amber-200">
            <Trophy className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{pr.exerciseName}</p>
            <p className="text-xs text-muted-foreground">
              {relativeDay(pr.date)} · est. 1RM {pr.estimated1RM}kg
            </p>
          </div>
          <div className="text-right">
            <p className="num text-lg font-bold">
              {pr.weight}
              <span className="text-xs text-muted-foreground">kg</span>
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              × {pr.reps} reps
            </p>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------
type ChartTheme = {
  grid: string
  tick: string
  tooltipBg: string
  tooltipBorder: string
  tooltipShadow: string
  tooltipText: string
}

function tooltipStyle(chart: ChartTheme) {
  return {
    background: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: 10,
    fontSize: 11,
    boxShadow: chart.tooltipShadow,
    color: chart.tooltipText,
  }
}

function DeltaTile({
  icon, label, value, delta, deltaSuffix = "", hideZeroDelta = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  delta: number
  deltaSuffix?: string
  hideZeroDelta?: boolean
}) {
  const show = !(hideZeroDelta && delta === 0)
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat"
  const color =
    trend === "up" ? "text-emerald-600" :
    trend === "down" ? "text-red-500" : "text-muted-foreground"
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="tint-blue flex h-7 w-7 items-center justify-center rounded-lg">
          {icon}
        </span>
        {show && (
          <span className={cn("text-[10px] font-semibold", color)}>
            {delta > 0 ? "+" : ""}{delta}{deltaSuffix}
          </span>
        )}
      </div>
      <p className="num mt-3 text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </Card>
  )
}

function MetricChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function PeriodChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg py-1.5 text-[11px] font-semibold transition-all",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function SummaryTile({
  icon, label, value, sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="tint-blue flex h-7 w-7 items-center justify-center rounded-lg">
          {icon}
        </span>
      </div>
      <p className="num mt-3 text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {sub && (
        <p className="num mt-1 text-[10px] text-muted-foreground">{sub}</p>
      )}
    </Card>
  )
}

function DeltaPill({ value, pct, unit }: { value: number; pct: number; unit: string }) {
  const positive = value > 0
  const negative = value < 0
  const Icon = positive ? TrendingUp : negative ? TrendingDown : TrendingUp
  const color = positive
    ? "bg-emerald-100 text-emerald-700"
    : negative
    ? "bg-red-100 text-red-700"
    : "bg-secondary text-muted-foreground"
  if (value === 0) {
    return (
      <span className={cn("flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold", color)}>
        no change
      </span>
    )
  }
  return (
    <div className="text-right">
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
        color
      )}>
        <Icon className="h-3 w-3" />
        {positive ? "+" : ""}{value}{unit} · {positive ? "+" : ""}{pct.toFixed(1)}%
      </span>
      <p className="mt-1 text-[10px] text-muted-foreground">since first session</p>
    </div>
  )
}

function fmtTime(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, "0")}`
}

function fmtMinutes(min: number) {
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
