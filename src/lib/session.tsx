import * as React from "react"

const STORAGE_KEY = "forge.session.v1"
const DEFAULT_REST_SECONDS = 90

type Persisted = {
  workoutId: string | null
  restEndsAt: number | null
  restDurationMs: number | null
  collapsed: Record<string, boolean>
  restNotified: boolean
}

const empty: Persisted = {
  workoutId: null,
  restEndsAt: null,
  restDurationMs: null,
  collapsed: {},
  restNotified: true,
}

function load(): Persisted {
  if (typeof window === "undefined") return empty
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw)
    return { ...empty, ...parsed }
  } catch {
    return empty
  }
}

function save(state: Persisted) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota / private mode — ignore */
  }
}

type SessionContextValue = {
  workoutId: string | null
  restEndsAt: number | null
  restDurationMs: number | null
  collapsed: Record<string, boolean>
  syncWorkout: (workoutId: string | null, knownExerciseIds: string[]) => void
  startRest: (seconds: number) => void
  clearRest: () => void
  toggleCollapsed: (id: string) => void
  setCollapsed: (id: string, value: boolean) => void
}

const SessionContext = React.createContext<SessionContextValue | null>(null)

export function WorkoutSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<Persisted>(() => load())

  React.useEffect(() => { save(state) }, [state])

  // Vibrate + auto-dismiss when rest timer crosses zero. Only fires once per
  // rest period (restNotified gate). Survives nav because state is restored
  // from localStorage and Date.now() is the source of truth.
  React.useEffect(() => {
    if (state.restEndsAt == null) return
    if (state.restNotified) return
    const trigger = (vibrate: boolean) => {
      if (vibrate) fireRestComplete()
      setState((s) => ({
        ...s,
        restEndsAt: null,
        restDurationMs: null,
        restNotified: true,
      }))
    }
    const remaining = state.restEndsAt - Date.now()
    if (remaining <= 0) {
      // App was likely closed during/after the rest. Only vibrate if we
      // missed the buzzer by a small margin; otherwise just clear silently.
      trigger(remaining > -5_000)
      return
    }
    const t = setTimeout(() => trigger(true), remaining)
    return () => clearTimeout(t)
  }, [state.restEndsAt, state.restNotified])

  const syncWorkout = React.useCallback(
    (workoutId: string | null, knownExerciseIds: string[]) => {
      setState((s) => {
        if (workoutId !== s.workoutId) return { ...empty, workoutId }
        const valid = new Set(knownExerciseIds)
        const collapsed: Record<string, boolean> = {}
        for (const [id, v] of Object.entries(s.collapsed)) {
          if (valid.has(id)) collapsed[id] = v
        }
        return { ...s, collapsed }
      })
    },
    []
  )

  const startRest = React.useCallback((seconds: number) => {
    const ms = Math.max(1, Math.round(seconds)) * 1000
    setState((s) => ({
      ...s,
      restEndsAt: Date.now() + ms,
      restDurationMs: ms,
      restNotified: false,
    }))
  }, [])

  const clearRest = React.useCallback(() => {
    setState((s) => ({
      ...s,
      restEndsAt: null,
      restDurationMs: null,
      restNotified: true,
    }))
  }, [])

  const toggleCollapsed = React.useCallback((id: string) => {
    setState((s) => ({
      ...s,
      collapsed: { ...s.collapsed, [id]: !s.collapsed[id] },
    }))
  }, [])

  const setCollapsed = React.useCallback((id: string, value: boolean) => {
    setState((s) => ({
      ...s,
      collapsed: { ...s.collapsed, [id]: value },
    }))
  }, [])

  const value = React.useMemo<SessionContextValue>(() => ({
    workoutId: state.workoutId,
    restEndsAt: state.restEndsAt,
    restDurationMs: state.restDurationMs,
    collapsed: state.collapsed,
    syncWorkout, startRest, clearRest, toggleCollapsed, setCollapsed,
  }), [state, syncWorkout, startRest, clearRest, toggleCollapsed, setCollapsed])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useWorkoutSession() {
  const ctx = React.useContext(SessionContext)
  if (!ctx) throw new Error("useWorkoutSession must be used within WorkoutSessionProvider")
  return ctx
}

/**
 * Ticks every `intervalMs` so timer displays can update. Returns Date.now().
 *
 * Battery notes:
 * - Pauses while the document is hidden (iOS PWA in background, screen off,
 *   tab switched) and resumes — with an immediate catch-up tick — on return.
 *   Without this gate iOS keeps firing the interval and draining battery
 *   while the user isn't even looking at the app.
 * - Call this from the smallest possible leaf component. Anything that
 *   subscribes to the returned `now` re-renders every tick, so don't put
 *   it on a screen-level component.
 */
export function useTick(intervalMs = 1000) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null
    const tick = () => setNow(Date.now())
    const start = () => {
      if (id != null) return
      tick()
      id = setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (id != null) {
        clearInterval(id)
        id = null
      }
    }
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden"
    if (!hidden) start()
    const onVis = () => {
      if (document.visibilityState === "hidden") stop()
      else start()
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis)
    }
    return () => {
      stop()
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis)
      }
    }
  }, [intervalMs])
  return now
}

export const RestDefaults = { seconds: DEFAULT_REST_SECONDS }

function fireRestComplete() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate([200, 80, 200]) } catch { /* no-op */ }
  }
}
