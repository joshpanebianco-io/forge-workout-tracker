import * as React from "react"
import { Sparkles } from "lucide-react"
import { useRegisterSW } from "virtual:pwa-register/react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

type Result = "available" | "up-to-date" | null

type SwUpdateValue = {
  result: Result
  checking: boolean
  triggerCheck: () => Promise<void>
}

const SwUpdateCtx = React.createContext<SwUpdateValue | null>(null)

export function useSwUpdate() {
  const ctx = React.useContext(SwUpdateCtx)
  if (!ctx) throw new Error("useSwUpdate must be used inside <SwUpdateProvider>")
  return ctx
}

// Minimum gap between automatic SW update checks. Prevents glancing at the
// app dozens of times during a workout from firing dozens of network requests.
const AUTO_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000

export function SwUpdateProvider({ children }: { children: React.ReactNode }) {
  const [result, setResult] = React.useState<Result>(null)
  const [checking, setChecking] = React.useState(false)
  const regRef = React.useRef<ServiceWorkerRegistration | null>(null)
  const lastAutoCheckRef = React.useRef(0)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      if (reg) regRef.current = reg
    },
  })

  React.useEffect(() => {
    if (needRefresh) setResult("available")
  }, [needRefresh])

  const runCheck = React.useCallback(async (manual: boolean) => {
    if (!manual) {
      const since = Date.now() - lastAutoCheckRef.current
      if (since < AUTO_CHECK_MIN_INTERVAL_MS) return
      lastAutoCheckRef.current = Date.now()
    }
    if (manual) setChecking(true)
    try {
      const reg =
        regRef.current ?? (await navigator.serviceWorker?.getRegistration()) ?? null
      if (!reg) {
        if (manual) setResult("up-to-date")
        return
      }
      // Kick off a fetch for the worker script. If there's a new version
      // available the browser starts installing it.
      await reg.update()
      // Poll for reg.waiting to populate. We intentionally don't listen for
      // the `updatefound` event because that fires when install BEGINS —
      // not when the new worker is ready to take over. Acting on
      // updatefound surfaces the "update available" dialog too early, and
      // clicking "Reload now" then has no waiting worker to skip-waiting
      // against, so the reload silently no-ops until the install actually
      // finishes (at which point vite-plugin-pwa fires needRefresh and we
      // get a second, working dialog). Polling reg.waiting avoids that.
      const deadline = Date.now() + (manual ? 4000 : 2500)
      while (Date.now() < deadline) {
        if (reg.waiting) break
        await new Promise((r) => setTimeout(r, 200))
      }
      // If a waiting worker exists, the needRefresh effect will (or already
      // has) opened the dialog; nothing to do for the "available" case here.
      // For manual checks where nothing's waiting after the poll window,
      // confirm the up-to-date state explicitly.
      if (manual && !reg.waiting) {
        setResult("up-to-date")
      }
    } catch {
      if (manual) setResult("up-to-date")
    } finally {
      if (manual) setChecking(false)
    }
  }, [])

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    let cancelled = false

    const initial = async () => {
      try {
        await navigator.serviceWorker.ready
      } catch {
        return
      }
      if (cancelled) return
      await runCheck(false)
      setTimeout(() => { if (!cancelled) runCheck(false) }, 3000)
    }
    initial()

    const onVis = () => {
      if (document.visibilityState === "visible") runCheck(false)
    }
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("focus", onVis)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("focus", onVis)
    }
  }, [runCheck])

  const triggerCheck = React.useCallback(() => runCheck(true), [runCheck])

  const apply = () => {
    // Clear needRefresh as well — otherwise the effect at the top of this
    // provider re-fires setResult("available") the moment we set result to
    // null, and the dialog pops a second time before updateServiceWorker
    // actually swaps in the new worker and reloads.
    setResult(null)
    setNeedRefresh(false)
    updateServiceWorker(true)
  }

  const dismiss = () => {
    setResult(null)
    setNeedRefresh(false)
  }

  return (
    <SwUpdateCtx.Provider value={{ result, checking, triggerCheck }}>
      {children}
      <ConfirmDialog
        open={result === "available"}
        onOpenChange={(o) => { if (!o) dismiss() }}
        title="Update available"
        description="A new version of Forge is ready. Reload to install it."
        confirmLabel="Reload now"
        cancelLabel="Later"
        tone="default"
        icon={<Sparkles className="h-6 w-6" />}
        onConfirm={apply}
      />
      <ConfirmDialog
        open={result === "up-to-date"}
        onOpenChange={(o) => { if (!o) dismiss() }}
        title="You're up to date"
        description="Forge is already running the latest version."
        confirmLabel="OK"
        tone="info"
        hideCancel
        onConfirm={dismiss}
      />
    </SwUpdateCtx.Provider>
  )
}
