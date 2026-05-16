import { useState } from "react"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import type { Tab } from "@/components/BottomNav"
import { Home } from "@/screens/Home"
import { Workout } from "@/screens/Workout"
import { History } from "@/screens/History"
import { Stats } from "@/screens/Stats"
import { Profile } from "@/screens/Profile"
import { Login } from "@/screens/Login"
import { useAuth } from "@/lib/auth"
import { SwUpdateProvider } from "@/lib/sw-update"

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
      {!session ? (
        <Login />
      ) : (
        <AppShell active={tab} onChange={(t) => navigate(t)}>
          {tab === "home" && <Home onNavigate={navigate} />}
          {tab === "workout" && <Workout />}
          {tab === "history" && <History />}
          {tab === "stats" && <Stats key={statsInitTab ?? "_"} initialTab={statsInitTab ?? "overview"} />}
          {tab === "profile" && <Profile />}
        </AppShell>
      )}
    </SwUpdateProvider>
  )
}
