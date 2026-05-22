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
    const merged: Persisted = { ...empty, ...parsed }
    // If the rest timer already expired while the app was suspended /
    // killed, clear it before first render so the stale countdown never
    // paints on resume.
    if (merged.restEndsAt != null && Date.now() >= merged.restEndsAt) {
      merged.restEndsAt = null
      merged.restDurationMs = null
      merged.restNotified = true
    }
    return merged
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

  // Debounce the localStorage write. JSON.stringify + setItem on every state
  // change (toggle, collapse, rest tick boundary) is synchronous I/O on the
  // main thread and adds up over a long session.
  React.useEffect(() => {
    const t = setTimeout(() => save(state), 250)
    return () => clearTimeout(t)
  }, [state])

  // Keep latest state available to event handlers without re-binding listeners
  // on every state change.
  const stateRef = React.useRef(state)
  stateRef.current = state

  // Vibrate + auto-dismiss when rest timer crosses zero. Only fires once per
  // rest period (restNotified gate). Survives nav because state is restored
  // from localStorage and Date.now() is the source of truth.
  React.useEffect(() => {
    if (state.restEndsAt == null) return
    if (state.restNotified) return
    const endsAt = state.restEndsAt
    const trigger = (vibrate: boolean) => {
      // Suppress chime + vibrate when the app isn't actually visible. iOS
      // can fire the setTimeout in the background AND queue AudioContext
      // tones that then play on resume, so a drift check alone isn't
      // enough — we must also confirm the user is looking at the app.
      const visible =
        typeof document === "undefined" || document.visibilityState === "visible"
      if (vibrate && visible) fireRestComplete()
      setState((s) => ({
        ...s,
        restEndsAt: null,
        restDurationMs: null,
        restNotified: true,
      }))
    }
    // If the timer already expired before this effect runs, the user wasn't
    // in the app when it ended — clear silently rather than chime on return.
    const remaining = endsAt - Date.now()
    if (remaining <= 0) {
      trigger(false)
      return
    }
    // setTimeout can fire late if the tab was backgrounded mid-rest. Only
    // chime if we're firing within ~1s of the true end; otherwise the user
    // re-opened the app well after the rest expired.
    const t = setTimeout(() => {
      const drift = Date.now() - endsAt
      trigger(drift < 1_000)
    }, remaining)
    return () => clearTimeout(t)
  }, [state.restEndsAt, state.restNotified])

  // Single visibility handler: on hide we flush state to localStorage and
  // suspend the AudioContext so the audio hardware can power down. On show
  // we synchronously clear an expired rest timer so the stale countdown
  // card stops rendering immediately — otherwise we'd wait for the queued
  // setTimeout to fire and the user sees the snapshot countdown briefly.
  React.useEffect(() => {
    if (typeof document === "undefined") return
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        save(stateRef.current)
        suspendAudio()
        return
      }
      setState((s) => {
        if (s.restEndsAt == null || s.restNotified) return s
        if (Date.now() < s.restEndsAt) return s
        return { ...s, restEndsAt: null, restDurationMs: null, restNotified: true }
      })
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  const syncWorkout = React.useCallback(
    (workoutId: string | null, knownExerciseIds: string[]) => {
      setState((s) => {
        if (workoutId !== s.workoutId) return { ...empty, workoutId }
        // Only allocate a new state if the prune actually removes something.
        // Returning a new {...s} object on every call combined with `session`
        // landing in a child's effect deps spirals into a render loop.
        const valid = new Set(knownExerciseIds)
        const existingKeys = Object.keys(s.collapsed)
        let changed = false
        const collapsed: Record<string, boolean> = {}
        for (const id of existingKeys) {
          if (valid.has(id)) collapsed[id] = s.collapsed[id]
          else changed = true
        }
        if (!changed) return s
        return { ...s, collapsed }
      })
    },
    []
  )

  const startRest = React.useCallback((seconds: number) => {
    primeAudio()
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
  playChime()
}

// Lazily-created AudioContext, primed on first user gesture (startRest) so
// iOS Safari allows playback when the timer later fires from a setTimeout.
let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) {
    try { audioCtx = new Ctor() } catch { return null }
  }
  return audioCtx
}

function primeAudio() {
  const ctx = getAudioCtx()
  if (!ctx) return
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => { /* no-op */ })
  }
}

function playChime() {
  const ctx = getAudioCtx()
  if (!ctx) return
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => { /* no-op */ })
  }
  const now = ctx.currentTime
  // Two-note ascending chime: E5 → B5, sine waves with quick attack + decay.
  playTone(ctx, 659.25, now, 0.22)
  playTone(ctx, 987.77, now + 0.14, 0.32)
  // Suspend once tones have decayed so iOS can power the audio HW back down.
  // Without this the context stays "running" for the rest of the session.
  window.setTimeout(suspendAudio, 600)
}

function suspendAudio() {
  if (audioCtx && audioCtx.state === "running") {
    audioCtx.suspend().catch(() => { /* no-op */ })
  }
}

function playTone(ctx: AudioContext, freq: number, start: number, dur: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "sine"
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}
