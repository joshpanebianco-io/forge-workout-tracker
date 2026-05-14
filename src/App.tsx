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

export default function App() {
  const [tab, setTab] = useState<Tab>("home")
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <AppShell active={tab} onChange={setTab}>
      {tab === "home" && <Home onNavigate={setTab} />}
      {tab === "workout" && <Workout />}
      {tab === "history" && <History />}
      {tab === "stats" && <Stats />}
      {tab === "profile" && <Profile />}
    </AppShell>
  )
}
