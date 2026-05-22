import { Smartphone } from "lucide-react"

export function RotatePrompt() {
  return (
    <div className="rotate-prompt">
      <div className="flex flex-col items-center gap-5 px-8 text-center">
        <div className="rotate-prompt-icon flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Smartphone className="h-10 w-10" />
        </div>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold text-foreground">Rotate your device</p>
          <p className="text-sm text-muted-foreground">
            Forge is designed for portrait mode.
          </p>
        </div>
      </div>
    </div>
  )
}
