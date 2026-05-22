import { lazy, Suspense, useState } from "react"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { RotatePrompt } from "@/components/RotatePrompt"
import type { Tab } from "@/components/BottomNav"
import { Home } from "@/screens/Home"
import { Workout } from "@/screens/Workout"
import { useAuth } from "@/lib/auth"
import { SwUpdateProvider } from "@/lib/sw-update"

// Code-split everything except the two screens you land on first
// (Home / Workout). Each chunk only loads when its tab is opened.
const Stats = lazy(() =>
  import("@/screens/Stats").then((m) => ({ default: m.Stats }))
)
const History = lazy(() =>
  import("@/screens/History").then((m) => ({ default: m.History }))
)
const Profile = lazy(() =>
  import("@/screens/Profile").then((m) => ({ default: m.Profile }))
)
const Login = lazy(() =>
  import("@/screens/Login").then((m) => ({ default: m.Login }))
)

function ScreenFallback() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>("home")
  const [statsInitTab, setStatsInitTab] = useState<string | null>(null)
  const { session, loading } = useAuth()

  const navigate = (next: Tab, opts?: { statsTab?: string }) => {
    setTab(next)
    setStatsInitTab(next === "stats" ? (opts?.statsTab ?? null) : null)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <SwUpdateProvider>
      <RotatePrompt />
      {!session ? (
        <Suspense fallback={<ScreenFallback />}>
          <Login />
        </Suspense>
      ) : (
        <AppShell active={tab} onChange={(t) => navigate(t)}>
          {tab === "home" && <Home onNavigate={navigate} />}
          {tab === "workout" && <Workout />}
          {tab === "history" && (
            <Suspense fallback={<ScreenFallback />}>
              <History />
            </Suspense>
          )}
          {tab === "stats" && (
            <Suspense fallback={<ScreenFallback />}>
              <Stats key={statsInitTab ?? "_"} initialTab={statsInitTab ?? "overview"} />
            </Suspense>
          )}
          {tab === "profile" && (
            <Suspense fallback={<ScreenFallback />}>
              <Profile />
            </Suspense>
          )}
        </AppShell>
      )}
    </SwUpdateProvider>
  )
}
