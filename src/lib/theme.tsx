import * as React from "react"

export type ThemeMode = "light" | "dark" | "system"

type Ctx = {
  mode: ThemeMode
  resolved: "light" | "dark"
  setMode: (m: ThemeMode) => void
}

const STORAGE_KEY = "forge.theme"
const ThemeCtx = React.createContext<Ctx | null>(null)

function readSystem(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function readStored(): ThemeMode {
  if (typeof window === "undefined") return "system"
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === "light" || v === "dark" || v === "system" ? v : "system"
}

function applyClass(resolved: "light" | "dark") {
  const root = document.documentElement
  if (resolved === "dark") root.classList.add("dark")
  else root.classList.remove("dark")
  root.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0b1220" : "#eef2f7")
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<ThemeMode>(() => readStored())
  const [system, setSystem] = React.useState<"light" | "dark">(() => readSystem())

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystem(mq.matches ? "dark" : "light")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const resolved: "light" | "dark" = mode === "system" ? system : mode

  React.useEffect(() => {
    applyClass(resolved)
  }, [resolved])

  const setMode = React.useCallback((m: ThemeMode) => {
    window.localStorage.setItem(STORAGE_KEY, m)
    setModeState(m)
  }, [])

  return (
    <ThemeCtx.Provider value={{ mode, resolved, setMode }}>{children}</ThemeCtx.Provider>
  )
}

export function useTheme() {
  const ctx = React.useContext(ThemeCtx)
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>")
  return ctx
}
