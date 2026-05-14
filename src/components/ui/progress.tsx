import { cn } from "@/lib/utils"

export function Progress({
  value = 0,
  className,
  indicatorClass,
}: {
  value?: number
  className?: string
  indicatorClass?: string
}) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className={cn("h-full gradient-primary transition-all duration-500", indicatorClass)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
