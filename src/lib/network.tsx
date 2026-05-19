import * as React from "react"

// Tracks online/offline state from the browser. The `online` and `offline`
// events fire on the window when navigator.onLine flips. We also poll on
// visibility-change because mobile browsers sometimes miss the event when
// the app is backgrounded across a connectivity change.

type NetworkContextValue = {
  online: boolean
  // Bumps when the browser transitions offline → online. Subscribers can
  // use this as a trigger to retry queued work.
  reconnectEpoch: number
}

const NetworkContext = React.createContext<NetworkContextValue | null>(null)

function readOnline(): boolean {
  if (typeof navigator === "undefined") return true
  return navigator.onLine !== false
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = React.useState<boolean>(() => readOnline())
  const [reconnectEpoch, setReconnectEpoch] = React.useState(0)
  const prevOnlineRef = React.useRef(online)

  React.useEffect(() => {
    const sync = () => {
      const now = readOnline()
      setOnline((cur) => {
        if (cur === now) return cur
        if (!cur && now) setReconnectEpoch((e) => e + 1)
        prevOnlineRef.current = now
        return now
      })
    }
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    document.addEventListener("visibilitychange", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  const value = React.useMemo(
    () => ({ online, reconnectEpoch }),
    [online, reconnectEpoch],
  )
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
}

export function useNetworkStatus() {
  const ctx = React.useContext(NetworkContext)
  if (!ctx) throw new Error("useNetworkStatus must be used inside <NetworkProvider>")
  return ctx
}

// Subscribe imperatively (outside React) — used by the mutation queue to
// drain on reconnect without depending on a hook.
type Listener = (online: boolean) => void
const listeners = new Set<Listener>()

export function onNetworkChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

if (typeof window !== "undefined") {
  const fire = () => listeners.forEach((l) => l(readOnline()))
  window.addEventListener("online", fire)
  window.addEventListener("offline", fire)
}

export function isOnline(): boolean {
  return readOnline()
}
