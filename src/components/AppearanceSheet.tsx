import { Check, Sun, Moon, Monitor } from "lucide-react"
import { Sheet } from "@/components/ui/sheet"
import { useTheme, type ThemeMode } from "@/lib/theme"
import { cn } from "@/lib/utils"

const OPTIONS: { value: ThemeMode; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", hint: "Bright surfaces", icon: Sun },
  { value: "dark", label: "Dark", hint: "Easy on the eyes", icon: Moon },
  { value: "system", label: "System", hint: "Match device setting", icon: Monitor },
]

export function AppearanceSheet({
  open, onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { mode, setMode } = useTheme()

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Appearance">
      <div className="flex flex-col gap-2">
        {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
          const active = mode === value
          return (
            <button
              key={value}
              onClick={() => {
                setMode(value)
                onOpenChange(false)
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl p-3 text-left ring-inset-border transition-colors",
                active ? "bg-primary/10 ring-2 ring-primary/40" : "bg-card hover:bg-secondary/40"
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl",
                  active ? "bg-primary/15 text-primary" : "bg-secondary text-foreground"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
              {active && <Check className="h-4 w-4 text-primary" />}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
