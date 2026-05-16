import { useEffect } from "react"
import { createPortal } from "react-dom"
import { Sparkles } from "lucide-react"
import { useRegisterSW } from "virtual:pwa-register/react"
import { Button } from "@/components/ui/button"

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      setInterval(() => {
        registration.update().catch(() => {})
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNeedRefresh(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [needRefresh, setNeedRefresh])

  if (!needRefresh) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div
        onClick={() => setNeedRefresh(false)}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-3xl glass ring-inset-border shadow-soft animate-fade-in overflow-hidden"
      >
        <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold tracking-tight">Update available</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A new version of Forge is ready. Reload to get the latest improvements.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 px-5 pb-5">
          <Button variant="secondary" onClick={() => setNeedRefresh(false)}>
            Later
          </Button>
          <Button onClick={() => updateServiceWorker(true)}>Update now</Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
