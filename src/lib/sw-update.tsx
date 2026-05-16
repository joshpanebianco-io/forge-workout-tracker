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

export function SwUpdateProvider({ children }: { children: React.ReactNode }) {
  const [result, setResult] = React.useState<Result>(null)
  const [checking, setChecking] = React.useState(false)
  const regRef = React.useRef<ServiceWorkerRegistration | null>(null)

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
    if (manual) setChecking(true)
    try {
      const reg =
        regRef.current ?? (await navigator.serviceWorker?.getRegistration()) ?? null
      if (!reg) {
        if (manual) setResult("up-to-date")
        return
      }
      let found = !!reg.waiting
      const onUpdate = () => { found = true }
      reg.addEventListener("updatefound", onUpdate)
      try {
        await reg.update()
        await new Promise((r) => setTimeout(r, manual ? 1200 : 800))
      } finally {
        reg.removeEventListener("updatefound", onUpdate)
      }
      if (manual) {
        setResult(found ? "available" : "up-to-date")
      } else if (found) {
        setResult("available")
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
    setResult(null)
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
