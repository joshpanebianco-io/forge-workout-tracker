import * as React from "react"
import { Dumbbell, Clock, Trophy } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn, fmtMinutes } from "@/lib/utils"

type WeekTotals = { workouts: number; minutes: number; prCount: number }

export function WeekStatsGrid({
  thisWeek,
  lastWeek,
  onTileClick,
}: {
  thisWeek: WeekTotals
  lastWeek: WeekTotals
  onTileClick?: () => void
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Tile
        icon={<Dumbbell className="h-3.5 w-3.5" />}
        label="Workouts"
        value={`${thisWeek.workouts}`}
        delta={thisWeek.workouts - lastWeek.workouts}
        onClick={onTileClick}
      />
      <Tile
        icon={<Clock className="h-3.5 w-3.5" />}
        label="Time"
        value={fmtMinutes(thisWeek.minutes)}
        delta={thisWeek.minutes - lastWeek.minutes}
        deltaSuffix="m"
        onClick={onTileClick}
      />
      <Tile
        icon={<Trophy className="h-3.5 w-3.5" />}
        label={<span className="normal-case">PRs</span>}
        value={`${thisWeek.prCount}`}
        delta={thisWeek.prCount - lastWeek.prCount}
        onClick={onTileClick}
      />
    </div>
  )
}

function Tile({
  icon, label, value, delta, deltaSuffix = "", onClick,
}: {
  icon: React.ReactNode
  label: React.ReactNode
  value: string
  delta: number
  deltaSuffix?: string
  onClick?: () => void
}) {
  const color =
    delta > 0 ? "text-emerald-600" :
    delta < 0 ? "text-red-500" : "text-muted-foreground"

  const inner = (
    <Card className="h-full p-3">
      <div className="flex items-center justify-between">
        <span className="tint-blue flex h-6 w-6 items-center justify-center rounded-md">
          {icon}
        </span>
        <span className={cn("text-[10px] font-semibold", color)}>
          {delta > 0 ? "+" : ""}{delta}{deltaSuffix}
        </span>
      </div>
      <p className="num mt-2 text-xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </Card>
  )

  if (!onClick) return inner
  return (
    <button onClick={onClick} className="text-left">
      {inner}
    </button>
  )
}
