import type { LucideIcon } from "lucide-react"
import { Home, Dumbbell, History, BarChart3, User } from "lucide-react"
import { cn } from "@/lib/utils"

export type Tab = "home" | "workout" | "history" | "stats" | "profile"

const items: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "workout", label: "Workout", icon: Dumbbell },
  { id: "history", label: "History", icon: History },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "profile", label: "Profile", icon: User },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: Tab
  onChange: (t: Tab) => void
}) {
  return (
    <nav className="fixed md:absolute inset-x-0 bottom-0 z-40">
      {/* Solid bg instead of .glass — backdrop-filter recomputes on every
          scroll frame on iOS and is the dominant compositor cost for the
          always-visible nav. */}
      <div className="bg-card/95 border-t border-border/60 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 gap-1 px-2 pt-2 pb-3">
          {items.map(({ id, label, icon: Icon }) => {
            const isActive = active === id
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                className="group relative flex flex-col items-center gap-1 py-1"
              >
                <div
                  className={cn(
                    "flex h-9 w-12 items-center justify-center rounded-xl transition-all",
                    isActive ? "bg-primary/15" : "bg-transparent group-hover:bg-secondary/40"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                    strokeWidth={2.2}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-semibold transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
