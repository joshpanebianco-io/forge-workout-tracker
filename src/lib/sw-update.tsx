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
      // Kick off the update check. If a new worker is available, the
      // browser starts installing it; if one's already installing from a
      // prior check, this is a no-op.
      await reg.update()
      // Fast path: a previous check already produced a waiting worker.
      if (reg.waiting) {
        setResult("available")
        return
      }
      // If a worker is currently installing, wait for it to actually
      // finish before deciding. Polling for a few seconds (the old
      // approach) wasn't long enough for real installs — we'd declare
      // "up to date" prematurely, then vite-plugin-pwa's needRefresh
      // would fire a moment later and pop the "available" dialog
      // immediately after. Listening for statechange resolves the moment
      // the new worker hits "installed" (== now waiting).
      if (reg.installing) {
        const sw = reg.installing
        const deadlineMs = manual ? 12000 : 30000
        await new Promise<void>((resolve) => {
          let timer: ReturnType<typeof setTimeout> | null = null
          const cleanup = () => {
            sw.removeEventListener("statechange", onChange)
            if (timer) clearTimeout(timer)
          }
          const onChange = () => {
            if (
              sw.state === "installed" ||
              sw.state === "activated" ||
              sw.state === "redundant"
            ) {
              cleanup()
              resolve()
            }
          }
          sw.addEventListener("statechange", onChange)
          timer = setTimeout(() => { cleanup(); resolve() }, deadlineMs)
        })
      }
      if (reg.waiting) {
        setResult("available")
      } else if (manual) {
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
    }
    initial()

    const onVis = () => {
      if (document.visibilityState === "visible") runCheck(false)
    }
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("focus", onVis)

    // Periodic check while the app is foregrounded. Without this, a build
    // deployed mid-session never surfaces until the user backgrounds the
    // app or manually clicks "Check for updates" — runCheck's own
    // 5-minute debounce makes this safe to fire on every interval tick.
    const intervalId = setInterval(() => {
      if (!document.hidden) runCheck(false)
    }, AUTO_CHECK_MIN_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(intervalId)
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
