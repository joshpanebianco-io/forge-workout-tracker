import { cn } from "@/lib/utils"
import * as React from "react"

export function ScreenHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: string
  subtitle?: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-end justify-between px-5 pt-5 pb-4", className)}>
      <div>
        {subtitle && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {subtitle}
          </div>
        )}
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">
          {title}
        </h1>
      </div>
      {right}
    </div>
  )
}
